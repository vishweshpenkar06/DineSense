#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

BRANCH="$(git rev-parse --abbrev-ref HEAD)"
if [[ "$BRANCH" == "HEAD" ]]; then BRANCH="master"; fi
PREVIOUS="$(git rev-parse HEAD)"
TARGET="${1:-${RELEASE_TAG:-}}"

if [[ -z "$TARGET" ]]; then
  echo "Usage: RELEASE_TAG=vX.Y.Z ./scripts/update.sh   or   ./scripts/update.sh vX.Y.Z" >&2
  exit 1
fi

if ! git diff --quiet || ! git diff --cached --quiet; then
  echo "Uncommitted changes present. Commit or stash them before updating." >&2
  exit 1
fi

./scripts/backup.sh
git fetch --tags origin
git checkout "$BRANCH"
git pull --ff-only
git checkout "$TARGET"

docker compose build
docker compose up -d

if ./scripts/healthcheck.sh; then
  echo "Update to $TARGET complete on branch $BRANCH. Previous commit was $PREVIOUS."
  exit 0
fi

echo "Health check failed after update. Rolling back on branch $BRANCH to $PREVIOUS." >&2
git checkout "$BRANCH"
git reset --hard "$PREVIOUS"
docker compose build
docker compose up -d
echo "Code rolled back. If the migration changed the database, restore the backup taken before this update with scripts/restore.sh." >&2
exit 1
