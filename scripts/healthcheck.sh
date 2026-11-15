#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"
for _ in $(seq 1 30); do
  if curl -fsS --max-time 3 http://127.0.0.1:3000/api/health >/dev/null 2>&1; then
    echo "DineSense is healthy."
    exit 0
  fi
  sleep 2
done
echo "Health check failed. Run: docker compose ps && docker compose logs --tail=100 web worker" >&2
exit 1
