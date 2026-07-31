#!/usr/bin/env bash
# =============================================================================
# UPSCVidya — VPS bootstrap (Ubuntu 24.04 ARM, Oracle Always Free)
# Idempotent: safe to re-run. Every section checks before it changes.
#
# Usage:
#   sudo DOMAIN=example.com ADMIN_SSH_KEY="ssh-ed25519 AAAA..." bash setup.sh
#
# Required env:
#   DOMAIN          apex domain (API served at api.$DOMAIN)
#   ADMIN_SSH_KEY   public key installed for the appadmin user
# Optional env:
#   PB_VERSION      PocketBase version tag (default: v0.39.7 — the version the
#                   pb_hooks are written against; do NOT float to latest)
#   API_HOST        full hostname for the API (default: api.$DOMAIN). Set this
#                   when the host has no sub-subdomain, e.g. a DuckDNS name.
#   ARCH            linux release arch: arm64 (default) | amd64 (Oracle AMD micro)
#   ADMIN_UI_IP     IP allowed to reach /_/ admin UI (default: open; set later)
# =============================================================================
set -euo pipefail

[[ $EUID -eq 0 ]] || { echo "run as root (sudo)"; exit 1; }
: "${DOMAIN:?set DOMAIN=yourdomain.com}"
: "${ADMIN_SSH_KEY:?set ADMIN_SSH_KEY='ssh-ed25519 ...'}"

API_HOST="${API_HOST:-api.${DOMAIN}}"
PB_DIR=/opt/pocketbase
BACKUP_DIR=/opt/backups
JOBS_DIR=/opt/jobs
ARCH="${ARCH:-arm64}"

log() { echo -e "\n=== $* ==="; }

# -----------------------------------------------------------------------------
log "1. Base hardening"
# -----------------------------------------------------------------------------
timedatectl set-timezone Asia/Kolkata

if ! id appadmin &>/dev/null; then
  adduser --disabled-password --gecos "" appadmin
  usermod -aG sudo appadmin
fi
install -d -m 700 -o appadmin -g appadmin /home/appadmin/.ssh
grep -qF "$ADMIN_SSH_KEY" /home/appadmin/.ssh/authorized_keys 2>/dev/null \
  || echo "$ADMIN_SSH_KEY" >> /home/appadmin/.ssh/authorized_keys
chown appadmin:appadmin /home/appadmin/.ssh/authorized_keys
chmod 600 /home/appadmin/.ssh/authorized_keys

# sshd: key-only, no root
cat > /etc/ssh/sshd_config.d/99-hardening.conf <<'EOF'
PermitRootLogin no
PasswordAuthentication no
KbdInteractiveAuthentication no
PubkeyAuthentication yes
MaxAuthTries 4
EOF
systemctl reload ssh

# firewall — Oracle also filters at the VCN security list; open 22/80/443 there too
ufw default deny incoming
ufw default allow outgoing
ufw allow 22/tcp
ufw allow 80/tcp
ufw allow 443/tcp
ufw --force enable

# unattended upgrades
apt-get update -qq
DEBIAN_FRONTEND=noninteractive apt-get install -y -qq unattended-upgrades curl gnupg sqlite3 rclone jq
dpkg-reconfigure -f noninteractive unattended-upgrades

# -----------------------------------------------------------------------------
log "2. Caddy reverse proxy"
# -----------------------------------------------------------------------------
if ! command -v caddy &>/dev/null; then
  curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' \
    | gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
  curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' \
    > /etc/apt/sources.list.d/caddy-stable.list
  apt-get update -qq && apt-get install -y -qq caddy
fi

# Caddyfile deployed beside this script (infra/Caddyfile) or generated here
sed "s/{{API_HOST}}/${API_HOST}/g" "$(dirname "$0")/Caddyfile" > /etc/caddy/Caddyfile
systemctl enable --now caddy
systemctl reload caddy

# -----------------------------------------------------------------------------
log "3. PocketBase"
# -----------------------------------------------------------------------------
if ! id pocketbase &>/dev/null; then
  useradd --system --home "$PB_DIR" --shell /usr/sbin/nologin pocketbase
fi
install -d -o pocketbase -g pocketbase "$PB_DIR" "$PB_DIR/pb_data" "$PB_DIR/pb_migrations" "$PB_DIR/pb_hooks"

if [[ ! -x $PB_DIR/pocketbase ]]; then
  # pinned: the pb_hooks are written against this JSVM surface. Floating to
  # "latest" can change it under our feet — bump deliberately, never by default.
  V=${PB_VERSION:-v0.39.7}
  V=${V#v}
  curl -fsSL -o /tmp/pb.zip \
    "https://github.com/pocketbase/pocketbase/releases/download/v${V}/pocketbase_${V}_linux_${ARCH}.zip"
  apt-get install -y -qq unzip
  unzip -o /tmp/pb.zip -d "$PB_DIR" pocketbase
  chown pocketbase:pocketbase "$PB_DIR/pocketbase"
  chmod 755 "$PB_DIR/pocketbase"
  rm /tmp/pb.zip
fi

# deploy migrations + hooks from the repo checkout (rsync keeps it idempotent)
REPO_PB="$(dirname "$0")/../pb"
if [[ -d $REPO_PB ]]; then
  cp -r "$REPO_PB/pb_migrations/." "$PB_DIR/pb_migrations/" 2>/dev/null || true
  cp -r "$REPO_PB/pb_hooks/."      "$PB_DIR/pb_hooks/"      2>/dev/null || true
  chown -R pocketbase:pocketbase "$PB_DIR/pb_migrations" "$PB_DIR/pb_hooks"
fi

install -m 644 "$(dirname "$0")/pocketbase.service" /etc/systemd/system/pocketbase.service
systemctl daemon-reload
systemctl enable --now pocketbase

# -----------------------------------------------------------------------------
log "4. Backups (nightly 03:00 IST, 14-day retention, R2 offsite)"
# -----------------------------------------------------------------------------
install -d -m 750 -o pocketbase -g pocketbase "$BACKUP_DIR"
install -m 755 "$(dirname "$0")/backup/pb-backup.sh" /usr/local/bin/pb-backup.sh

# rclone config template — insert R2 keys per infra/backup/rclone.conf.template
install -d -m 700 -o pocketbase -g pocketbase /home/pocketbase 2>/dev/null || true
if [[ ! -f /etc/rclone-r2.conf ]]; then
  install -m 600 "$(dirname "$0")/backup/rclone.conf.template" /etc/rclone-r2.conf
  echo ">>> EDIT /etc/rclone-r2.conf and insert your R2 credentials <<<"
fi

cat > /etc/cron.d/pb-backup <<'EOF'
# nightly PocketBase backup, 03:00 IST (server TZ is Asia/Kolkata)
0 3 * * * root /usr/local/bin/pb-backup.sh >> /var/log/pb-backup.log 2>&1
EOF

# -----------------------------------------------------------------------------
log "5. Node.js LTS + pnpm + jobs dir"
# -----------------------------------------------------------------------------
if ! command -v node &>/dev/null; then
  curl -fsSL https://deb.nodesource.com/setup_lts.x | bash -
  apt-get install -y -qq nodejs
fi
corepack enable 2>/dev/null || npm install -g pnpm

install -d -o appadmin -g appadmin "$JOBS_DIR"
if [[ ! -f $JOBS_DIR/jobs.md ]]; then
  install -o appadmin -g appadmin "$(dirname "$0")/jobs-README.md" "$JOBS_DIR/jobs.md"
fi

# -----------------------------------------------------------------------------
log "DONE"
# -----------------------------------------------------------------------------
echo "Checks:"
echo "  systemctl status pocketbase caddy"
echo "  https://${API_HOST}/_/  → PocketBase admin UI (create the first superuser)"
echo "  /usr/local/bin/pb-backup.sh  → manual backup test"
echo "Remaining manual steps: R2 keys in /etc/rclone-r2.conf; DNS A record api.${DOMAIN} → this VPS."
