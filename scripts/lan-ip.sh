#!/usr/bin/env bash
set -euo pipefail
IP=$(ip -4 route get 1.1.1.1 2>/dev/null | awk '{for (i = 1; i <= NF; i++) if ($i == "src") { print $(i + 1); exit }}')
if [ -z "${IP:-}" ]; then
  IP=$(hostname -I 2>/dev/null | awk '{print $1}')
fi
if [ -z "${IP:-}" ]; then
  echo "Could not detect a LAN IP. Set SITE_ADDRESS manually in .env."
  exit 1
fi
cat <<TEXT
LAN IP: $IP

Add/update in .env:
  SITE_ADDRESS=$IP
  COOKIE_SECURE=true

Then:
  docker compose up -d --force-recreate caddy
  ./scripts/export-ca.sh

Open https://$IP on a phone/tablet and install caddy-root.crt once.
TEXT
