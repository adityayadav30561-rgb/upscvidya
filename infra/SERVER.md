# UPSCVidya — Server Operations

VPS: Ubuntu 24.04 ARM (Oracle Always Free). Timezone: Asia/Kolkata (all crons IST).
Stack: Caddy (TLS + reverse proxy) → PocketBase (127.0.0.1:8090, systemd).

## First-time setup

```bash
# on the VPS, as root, with the repo's infra/ directory present:
sudo DOMAIN=yourdomain.com ADMIN_SSH_KEY="ssh-ed25519 AAAA... you@machine" bash infra/setup.sh
```

Then:
1. Point DNS: `api.yourdomain.com` A record → VPS IP. Caddy fetches TLS automatically.
2. Open `https://api.yourdomain.com/_/` — create the first superuser.
3. Insert R2 keys into `/etc/rclone-r2.conf` (template documents where to get them).
4. Oracle Cloud: ensure the VCN security list also allows 22/80/443 (ufw alone is not enough on Oracle).

## Services

| Action | Command |
|---|---|
| Status | `systemctl status pocketbase` / `systemctl status caddy` |
| Restart | `sudo systemctl restart pocketbase` |
| Logs (live) | `journalctl -u pocketbase -f` |
| Caddy config | `/etc/caddy/Caddyfile` → `sudo systemctl reload caddy` |
| PB data dir | `/opt/pocketbase/pb_data` |
| Migrations / hooks | `/opt/pocketbase/pb_migrations`, `/opt/pocketbase/pb_hooks` (copied from repo `pb/` by setup.sh; re-run setup.sh or copy manually to update, then restart pocketbase) |

## Backups

- Nightly 03:00 IST via `/etc/cron.d/pb-backup` → `/usr/local/bin/pb-backup.sh`
- Local: `/opt/backups/pb_data-<stamp>.tar.gz`, 14-day retention
- Offsite: R2 bucket `upscvidya-backups/pb/`, same retention
- Manual run: `sudo /usr/local/bin/pb-backup.sh`

### Restore procedure

```bash
sudo systemctl stop pocketbase
sudo tar -xzf /opt/backups/pb_data-<stamp>.tar.gz -C /tmp/pb-restore
# sanity-check the snapshot:
sqlite3 /tmp/pb-restore/data.db "select count(*) from _collections;"
sudo rm -rf /opt/pocketbase/pb_data.old
sudo mv /opt/pocketbase/pb_data /opt/pocketbase/pb_data.old
sudo mv /tmp/pb-restore /opt/pocketbase/pb_data
sudo chown -R pocketbase:pocketbase /opt/pocketbase/pb_data
sudo systemctl start pocketbase
# verify, then remove pb_data.old
```

RTO: minutes. RPO: worst case 24h (nightly). Test restores quarterly (Prompt 17 drill).

## Updating PocketBase safely

```bash
sudo systemctl stop pocketbase
sudo /usr/local/bin/pb-backup.sh                      # snapshot first
cd /opt/pocketbase
sudo -u pocketbase curl -fsSL -o pb.zip \
  https://github.com/pocketbase/pocketbase/releases/download/vX.Y.Z/pocketbase_X.Y.Z_linux_arm64.zip
sudo -u pocketbase unzip -o pb.zip pocketbase && sudo rm pb.zip
sudo systemctl start pocketbase
journalctl -u pocketbase -n 50    # watch for migration output / errors
```

PocketBase auto-applies its own internal migrations on start. Read the release
notes for breaking changes before a minor-version jump.

## Security posture

- SSH: key-only, root login disabled, user `appadmin` (sudo)
- ufw: 22/80/443 only
- PocketBase binds localhost only; world reaches it through Caddy
- Admin UI `/_/`: IP-allowlist block available in the Caddyfile (commented; enable at hardening)
- systemd sandboxing on the pocketbase unit (ProtectSystem=strict etc.)
- Unattended security upgrades enabled
