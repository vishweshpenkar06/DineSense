#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

DB="dinesense_scratch_preflight"
export DATABASE_URL="postgresql://dinesense:dinesense@localhost:5432/${DB}?schema=public"
export ENCRYPTION_KEY="${ENCRYPTION_KEY:-preflight-encryption-key-not-for-production}"

npm run db:generate
npm run typecheck
npm test
npm run test:core

docker compose -f docker-compose.yml -f docker-compose.dev.yml up -d db
docker compose exec -T db dropdb -U "${POSTGRES_USER:-dinesense}" --if-exists "$DB"
docker compose exec -T db createdb -U "${POSTGRES_USER:-dinesense}" "$DB"
npx prisma migrate deploy --schema packages/db/prisma/schema.prisma
npm run db:seed -w @dinesense/db -- --force
npm run acceptance

npm run build

if [[ "${RUN_E2E:-0}" == "1" ]]; then
  ENABLE_DEV_CONSOLE=true VISION_DEMO=true docker compose -f docker-compose.yml -f docker-compose.dev.yml up -d --force-recreate web worker vision
  docker compose -f docker-compose.yml -f docker-compose.dev.yml exec -T vision python scripts/make_demo.py
  docker compose -f docker-compose.yml -f docker-compose.dev.yml restart vision
  npm run test:e2e
fi

echo "Preflight passed. Run E2E on the dev stack before pushing if RUN_E2E was not set."
