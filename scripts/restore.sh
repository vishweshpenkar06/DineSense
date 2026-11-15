#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"
FILE="${1:-}"
if [ -z "$FILE" ] || [ ! -f "$FILE" ]; then
  echo "Usage: $0 backups/dinesense-YYYYMMDD-HHMMSS.dump" >&2
  exit 1
fi
if [ -f .env ]; then
  set -a
  # shellcheck disable=SC1091
  . ./.env
  set +a
fi

read -r -p "Restore $FILE over the LIVE database? This replaces all current data. [y/N] " ANSWER
case "$ANSWER" in
  y|Y) ;;
  *) echo "Cancelled."; exit 1 ;;
esac

docker compose stop web worker vision
docker compose exec -T db sh -c \
  'PGPASSWORD="$POSTGRES_PASSWORD" pg_restore -h 127.0.0.1 -U "$POSTGRES_USER" -d "$POSTGRES_DB" --clean --if-exists --no-owner' \
  < "$FILE"
docker compose up -d
./scripts/healthcheck.sh
echo "Restore complete. Check the admin Health page."
