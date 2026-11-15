#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"
STAMP="$(date +%Y%m%d-%H%M%S)"
OUT="backups/diagnostics-$STAMP"
mkdir -p "$OUT"
docker compose ps > "$OUT/compose-ps.txt" 2>&1 || true
docker compose logs --no-color --tail=500 > "$OUT/services.log" 2>&1 || true
curl -sS http://127.0.0.1:3000/api/health > "$OUT/health.json" 2>/dev/null || true
tar -czf "$OUT.tar.gz" -C backups "$(basename "$OUT")"
rm -rf "$OUT"
echo "Diagnostics written: $OUT.tar.gz (no .env, no secrets, no video)."
