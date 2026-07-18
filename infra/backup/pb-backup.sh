#!/usr/bin/env bash
# UPSCVidya — nightly PocketBase backup.
# Online sqlite .backup (no service stop), gzip to /opt/backups, keep 14 days,
# offsite sync to Cloudflare R2 via rclone (config: /etc/rclone-r2.conf).
set -euo pipefail

PB_DATA=/opt/pocketbase/pb_data
OUT_DIR=/opt/backups
STAMP=$(date +%Y%m%d-%H%M%S)
OUT="$OUT_DIR/pb_data-$STAMP.tar.gz"
TMP=$(mktemp -d)
trap 'rm -rf "$TMP"' EXIT

# 1. consistent sqlite snapshots via the online backup API (safe while PB runs)
sqlite3 "$PB_DATA/data.db" ".backup '$TMP/data.db'"
[[ -f $PB_DATA/auxiliary.db ]] && sqlite3 "$PB_DATA/auxiliary.db" ".backup '$TMP/auxiliary.db'"

# 2. copy uploaded storage (if any) — rsync tolerates concurrent writes well enough
[[ -d $PB_DATA/storage ]] && cp -r "$PB_DATA/storage" "$TMP/storage"

# 3. archive
tar -czf "$OUT" -C "$TMP" .
echo "backup written: $OUT ($(du -h "$OUT" | cut -f1))"

# 4. retention: 14 days local
find "$OUT_DIR" -name 'pb_data-*.tar.gz' -mtime +14 -delete

# 5. offsite → R2 (skips gracefully until credentials are configured)
if rclone --config /etc/rclone-r2.conf listremotes 2>/dev/null | grep -q '^r2:'; then
  rclone --config /etc/rclone-r2.conf copy "$OUT" r2:upscvidya-backups/pb/ \
    && echo "synced to R2"
  # mirror retention offsite
  rclone --config /etc/rclone-r2.conf delete r2:upscvidya-backups/pb/ --min-age 14d || true
else
  echo "WARN: rclone remote 'r2' not configured — local backup only"
fi
