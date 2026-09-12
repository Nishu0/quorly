#!/usr/bin/env bash
# Prepares a fresh Ubuntu host: Docker, swap, firewall, deploy key.
# Idempotent — safe to re-run.
set -euo pipefail

echo "==> Docker"
if ! command -v docker >/dev/null; then
  sudo apt-get update -qq
  sudo apt-get install -y -qq ca-certificates curl git
  sudo install -m 0755 -d /etc/apt/keyrings
  sudo curl -fsSL https://download.docker.com/linux/ubuntu/gpg -o /etc/apt/keyrings/docker.asc
  sudo chmod a+r /etc/apt/keyrings/docker.asc
  echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.asc] \
https://download.docker.com/linux/ubuntu $(. /etc/os-release && echo "$VERSION_CODENAME") stable" \
    | sudo tee /etc/apt/sources.list.d/docker.list >/dev/null
  sudo apt-get update -qq
  sudo apt-get install -y -qq docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
  sudo usermod -aG docker "$USER"
fi
docker --version

echo "==> Swap"
# 3.8GB of RAM is not enough to build Next.js. Without swap the build is killed
# by the OOM reaper part-way through, which looks like a hung deploy.
if ! sudo swapon --show | grep -q /swapfile; then
  sudo fallocate -l 4G /swapfile
  sudo chmod 600 /swapfile
  sudo mkswap /swapfile >/dev/null
  sudo swapon /swapfile
  echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab >/dev/null
fi
free -h | awk '/^Swap:/{print "  swap: "$2}'

echo "==> Firewall"
if command -v ufw >/dev/null; then
  sudo ufw allow OpenSSH >/dev/null
  sudo ufw allow 80/tcp  >/dev/null
  sudo ufw allow 443/tcp >/dev/null
  sudo ufw --force enable >/dev/null
  sudo ufw status | head -6
fi

echo "==> GitHub deploy key"
if [ ! -f ~/.ssh/quorly_deploy ]; then
  ssh-keygen -t ed25519 -N "" -C "quorly-deploy@$(hostname)" -f ~/.ssh/quorly_deploy
  cat >> ~/.ssh/config <<'SSHCFG'

Host github.com
  IdentityFile ~/.ssh/quorly_deploy
  IdentitiesOnly yes
  StrictHostKeyChecking accept-new
SSHCFG
  chmod 600 ~/.ssh/config
fi

echo
echo "Add this as a deploy key at https://github.com/Nishu0/quorly/settings/keys"
echo "(read-only is enough):"
echo
cat ~/.ssh/quorly_deploy.pub
echo
