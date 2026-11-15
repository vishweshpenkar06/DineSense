#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
docker compose cp caddy:/data/caddy/pki/authorities/local/root.crt ./caddy-root.crt
echo "Wrote $(pwd)/caddy-root.crt"
echo "Install it as a trusted root CA on each phone/tablet. See docs/HTTPS.md."
