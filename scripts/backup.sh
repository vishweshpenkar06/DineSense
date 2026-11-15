#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"
if [ -f .env ]; then
  set -a
  # shellcheck disable=SC1091
  . ./.env
  set +a
fi

mkdir -p backups
STAMP="$(date +%Y%m%d-%H%M%S)"
FILE="backups/dinesense-$STAMP.dump"

docker compose exec -T db sh -c \
  'PGPASSWORD="$POSTGRES_PASSWORD" pg_dump -h 127.0.0.1 -U "$POSTGRES_USER" -d "$POSTGRES_DB" -Fc' \
  > "$FILE"

if [ ! -s "$FILE" ]; then
  echo "Backup failed: empty dump" >&2
  rm -f "$FILE"
  exit 1
fi

date -u +%Y-%m-%dT%H:%M:%SZ > backups/.last_backup
find backups -maxdepth 1 -name 'dinesense-*.dump' -mtime +14 -delete

if [ -n "${BACKUP_USB_PATH:-}" ]; then
  mkdir -p "$BACKUP_USB_PATH"
  cp "$FILE" "$BACKUP_USB_PATH/"
fi
if [ -n "${BACKUP_RCLONE_REMOTE:-}" ] && command -v rclone >/dev/null 2>&1; then
  rclone copy "$FILE" "$BACKUP_RCLONE_REMOTE"
fi

echo "Backup written: $FILE"
