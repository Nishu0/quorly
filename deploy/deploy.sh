#!/usr/bin/env bash
# Pulls the latest code and rolls the stack. Run on the server, in ~/quorly.
set -euo pipefail

cd "$(dirname "$0")/.."

echo "==> Pulling"
git fetch --quiet origin
git reset --hard origin/main --quiet
echo "  $(git log -1 --pretty='%h %s')"

echo "==> Building"
# Build before stopping anything, so a failed build leaves the old stack up.
docker compose build

echo "==> Rolling"
docker compose up -d --remove-orphans

echo "==> Waiting for health"
for i in $(seq 1 30); do
  if docker compose exec -T api /usr/local/bin/quorlyctl queue >/dev/null 2>&1; then
    echo "  api healthy"
    break
  fi
  sleep 2
done

docker compose ps
echo
echo "==> Recent logs"
docker compose logs --tail=15 api
