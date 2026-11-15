#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"
PREVIOUS="$(git rev-parse HEAD)"

./scripts/backup.sh

if ! git diff --quiet || ! git diff --cached --quiet; then
  echo "Uncommitted changes present. Commit or stash them before updating." >&2
  exit 1
fi

git pull --ff-only
docker compose build
docker compose up -d

if ./scripts/healthcheck.sh; then
  echo "Update complete. Previous commit was $PREVIOUS."
  exit 0
fi

echo "Health check failed after update. Rolling the code back to $PREVIOUS." >&2
git checkout "$PREVIOUS"
docker compose build
docker compose up -d
echo "Code rolled back. If the migration changed the database, restore the backup taken before this update with scripts/restore.sh." >&2
exit 1
