#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$ROOT"

if [ "$(id -u)" -ne 0 ]; then
  echo "Run the installer with sudo: sudo ./install.sh" >&2
  exit 1
fi

if ! command -v docker >/dev/null 2>&1; then
  echo "Installing Docker from the Ubuntu repositories…"
  apt-get update
  apt-get install -y ca-certificates curl
  apt-get install -y docker.io docker-compose-v2 || apt-get install -y docker.io docker-compose-plugin
  systemctl enable --now docker
fi

if ! docker compose version >/dev/null 2>&1; then
  echo "Docker Compose v2 is required. Install docker-compose-v2 (Ubuntu) or docker-compose-plugin (Docker CE)." >&2
  exit 1
fi

if [ -n "${SUDO_USER:-}" ] && [ "$SUDO_USER" != "root" ]; then
  usermod -aG docker "$SUDO_USER" || true
fi

SITE_DEFAULT="$(ip -4 route get 1.1.1.1 2>/dev/null | awk '{for (i=1;i<=NF;i++) if ($i=="src") {print $(i+1); exit}}' || true)"
if [ -z "$SITE_DEFAULT" ]; then
  SITE_DEFAULT="$(hostname -I 2>/dev/null | awk '{print $1}')"
fi
if [ -z "$SITE_DEFAULT" ]; then
  SITE_DEFAULT="dinesense.local"
fi

NEW_ENV=0
if [ ! -f .env ]; then
  NEW_ENV=1
  read -r -p "Restaurant LAN address [$SITE_DEFAULT]: " SITE_INPUT
  SITE_ADDRESS="${SITE_INPUT:-$SITE_DEFAULT}"

  read -r -s -p "Admin password (leave blank to generate): " ADMIN_PASSWORD
  echo
  if [ -z "$ADMIN_PASSWORD" ]; then
    ADMIN_PASSWORD="$(openssl rand -hex 12)"
  fi

  umask 077
  cat > .env <<ENV
POSTGRES_USER=dinesense
POSTGRES_PASSWORD=$(openssl rand -hex 16)
POSTGRES_DB=dinesense
SESSION_SECRET=$(openssl rand -hex 32)
ENCRYPTION_KEY=$(openssl rand -hex 32)
VISION_SHARED_SECRET=$(openssl rand -hex 32)
ENABLE_DEV_CONSOLE=false
COOKIE_SECURE=false
VISION_DEMO=false
SITE_ADDRESS=$SITE_ADDRESS
ACME_EMAIL=
ENV
  chmod 600 .env
else
  set -a
  # shellcheck disable=SC1091
  . ./.env
  set +a
  ADMIN_PASSWORD="${SEED_ADMIN_PASSWORD:-}"
  SITE_ADDRESS="${SITE_ADDRESS:-$SITE_DEFAULT}"
fi

if grep -Eq '^(POSTGRES_PASSWORD|SESSION_SECRET|ENCRYPTION_KEY|VISION_SHARED_SECRET)=.*(change-me|dev-|^$)' .env; then
  echo "Refusing to start with placeholder secrets. Update .env." >&2
  exit 1
fi

echo "Building and starting DineSense…"
docker compose up -d --build

for _ in $(seq 1 60); do
  if docker compose exec -T db pg_isready -U "${POSTGRES_USER:-dinesense}" -d "${POSTGRES_DB:-dinesense}" >/dev/null 2>&1; then
    break
  fi
  sleep 2
done

USERS="$(docker compose exec -T db psql -U "${POSTGRES_USER:-dinesense}" -d "${POSTGRES_DB:-dinesense}" -tAc 'SELECT count(*) FROM "User";' | tr -d '[:space:]')"
INSTALLED_ADMIN=""
if [ "$USERS" = "0" ]; then
  if [ -z "$ADMIN_PASSWORD" ]; then
    ADMIN_PASSWORD="$(openssl rand -hex 12)"
  fi
  docker compose run --rm -e SEED_ADMIN_PASSWORD="$ADMIN_PASSWORD" migrate \
    npm run db:seed -w @dinesense/db -- --minimal
  INSTALLED_ADMIN="$ADMIN_PASSWORD"
else
  echo "Existing users found — the database was not reseeded."
fi

./scripts/export-ca.sh >/dev/null 2>&1 || true

if command -v crontab >/dev/null 2>&1; then
  cat > /etc/cron.d/dinesense-backup <<CRON
SHELL=/bin/sh
PATH=/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin
0 3 * * * root cd "$ROOT" && ./scripts/backup.sh >> "$ROOT/backups/backup.log" 2>&1
CRON
  chmod 644 /etc/cron.d/dinesense-backup
  echo "Nightly backup scheduled at 03:00 (14-day retention)."
else
  echo "cron is not installed; add a nightly job for scripts/backup.sh manually."
fi

./scripts/healthcheck.sh || true

cat <<TEXT

──────────────────────────────────────────────
DineSense is installed.

  URL:            https://${SITE_ADDRESS}
  Setup wizard:   https://${SITE_ADDRESS}/setup
  Admin login:    password login${INSTALLED_ADMIN:+
  Admin password: ${INSTALLED_ADMIN}}
  Root CA:        ${ROOT}/caddy-root.crt
  Backups:        ${ROOT}/backups (nightly, keep 14)
  Docs:           ${ROOT}/docs/INSTALL.md

Install caddy-root.crt on each phone/tablet (docs/HTTPS.md).
If this is a reinstall, use the admin password you saved earlier.
──────────────────────────────────────────────
TEXT
