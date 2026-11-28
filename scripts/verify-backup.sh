#!/usr/bin/env bash
set -euo pipefail

BACKUP_FILE="${1:?usage: verify-backup.sh backups/<dump>}"
SCRATCH_DB="${2:-dinesense_restore_check}"
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

if [[ ! "$SCRATCH_DB" =~ (_acceptance|_scratch|_test|restore_check)$ ]]; then
  echo "Refusing to restore into a non-scratch database: $SCRATCH_DB" >&2
  exit 1
fi

cd "$ROOT"
echo "Creating scratch database $SCRATCH_DB from $BACKUP_FILE"
docker compose exec -T db dropdb -U "${POSTGRES_USER:-dinesense}" --if-exists "$SCRATCH_DB"
docker compose exec -T db createdb -U "${POSTGRES_USER:-dinesense}" "$SCRATCH_DB"
docker compose exec -T db pg_restore -U "${POSTGRES_USER:-dinesense}" -d "$SCRATCH_DB" --no-owner < "$BACKUP_FILE"

for table in "User" "DiningTable" "MenuItem" "Bill" "Payment"; do
  count="$(docker compose exec -T db psql -U "${POSTGRES_USER:-dinesense}" -d "$SCRATCH_DB" -tAc "SELECT count(*) FROM \"$table\";" | tr -d '[:space:]')"
  echo "$table=$count"
done
echo "Restore verification complete. Drop $SCRATCH_DB before reinstalling."
