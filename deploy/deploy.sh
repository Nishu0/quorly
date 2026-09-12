#!/usr/bin/env bash
# Pulls the latest code and rolls the stack. Run on the server, in ~/quorly.
set -euo pipefail

cd "$(dirname "$0")/.."

echo "==> Pulling"
git fetch --quiet origin
git reset --hard origin/main --quiet
echo "  $(git log -1 --pretty='%h %s')"

echo "==> Reclaiming disk"
# The Next compile writes several GB of transient state. On this 14G box a stale
# build cache is enough to push it into ENOSPC, which surfaces as a bare
# "exit code: 1" five minutes in. Clear the cache and refuse to start a build
# that has no room to finish.
docker builder prune -af >/dev/null 2>&1 || true
avail_kb=$(df --output=avail -k / | tail -1)
if [ "$avail_kb" -lt 3145728 ]; then
  echo "  only $((avail_kb / 1024)) MB free on / - need at least 3072 MB to build" >&2
  df -h /
  exit 1
fi
echo "  $((avail_kb / 1024)) MB free"

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
