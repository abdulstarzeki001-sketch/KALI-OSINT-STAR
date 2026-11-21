#!/usr/bin/env bash
# STAR AI CPU + Agent bootstrap for a NEW Ubuntu 24.04 amd64 VPS.
# Run manually as root after reviewing. No cloud purchase or public API exposure.
set -Eeuo pipefail
trap 'echo "[STAR] Installation stopped on line $LINENO" >&2' ERR

if [ "$EUID" -ne 0 ]; then echo "Run as root: sudo bash install-ubuntu.sh" >&2; exit 1; fi
. /etc/os-release
if [ "$ID" != "ubuntu" ] || [ "$VERSION_ID" != "24.04" ]; then
  echo "Requires Ubuntu 24.04 LTS. Found $PRETTY_NAME" >&2; exit 1
fi
if [ "$(uname -m)" != "x86_64" ]; then echo "Requires x86_64 VPS" >&2; exit 1; fi
mem_kib="$(awk '/^MemTotal:/ {print $2}' /proc/meminfo)"
if [ "$mem_kib" -lt 14000000 ]; then
  echo "Need >= 16GB marketed RAM (>= 13.4GiB reported). Found: $mem_kib KiB" >&2
  exit 1
fi
free_kib="$(df -Pk / | awk 'NR==2 {print $4}')"
if [ "$free_kib" -lt 20000000 ]; then
  echo "Need >= 20GB available disk before Docker image/model downloads." >&2; exit 1
fi
echo "[STAR] Ubuntu, x86_64, RAM and free disk checks passed."
export DEBIAN_FRONTEND=noninteractive
apt-get update
apt-get install -y ca-certificates curl gnupg git python3
install -m 0755 -d /etc/apt/keyrings
curl -fsSL https://download.docker.com/linux/ubuntu/gpg -o /etc/apt/keyrings/docker.asc
chmod a+r /etc/apt/keyrings/docker.asc
cat >/etc/apt/sources.list.d/docker.sources <<EOF
Types: deb
URIs: https://download.docker.com/linux/ubuntu
Suites: noble
Components: stable
Architectures: amd64
Signed-By: /etc/apt/keyrings/docker.asc
EOF
apt-get update
apt-get install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
systemctl enable --now docker

PREFIX=/opt/kali-star-ai
mkdir -p "$PREFIX"
if [ ! -d "$PREFIX/app/.git" ]; then
  git clone --depth 1 https://github.com/abdulstarzeki001-sketch/KALI-OSINT-STAR.git "$PREFIX/app"
else
  echo "[STAR] Existing app repository kept. No implicit git pull."
fi
cd "$PREFIX/app/deploy/cpu-ai"
if [ ! -e .env ]; then
  umask 077
  python3 - <<'PY'
import secrets
from pathlib import Path
p=Path('.env')
with p.open('x',encoding='utf-8') as f:
    f.write('STAR_CPU_API_KEY='+secrets.token_urlsafe(48)+'\n')
    f.write('STAR_AGENT_API_KEY='+secrets.token_urlsafe(48)+'\n')
    f.write('STAR_AGENT_BROWSER_HOSTS=\n')
p.chmod(0o600)
print('[STAR] Created distinct model/agent secrets. Values not printed.')
PY
else
  chmod 600 .env
  echo "[STAR] Reusing existing secrets; no overwrite."
fi
mkdir -p workspace
if [ ! -d workspace/KALI-OSINT-STAR/.git ]; then
  git clone --depth 1 https://github.com/abdulstarzeki001-sketch/KALI-OSINT-STAR.git workspace/KALI-OSINT-STAR
fi
# The agent container runs as UID 1000 and must own its isolated workspace.
chown -R 1000:1000 workspace
chmod 750 workspace
docker compose -f compose.yaml -f compose.agent.yaml config --quiet
echo "[STAR] Starting CPU model + isolated Agent. First model download may be large."
docker compose -f compose.yaml -f compose.agent.yaml up -d --build
echo "[STAR] Compose containers:"
docker compose -f compose.yaml -f compose.agent.yaml ps
echo
echo "[STAR] No public inference or agent ports were opened."
echo "[STAR] Private localhost:8787 (Agent), localhost:8080 (Qwen)."
echo "[STAR] Check status via: cd $PREFIX/app/deploy/cpu-ai && docker compose -f compose.yaml -f compose.agent.yaml logs --tail=30"
echo "[STAR] For iPhone, configure Tailscale Serve/HTTPS AFTER enrolling the server in your tailnet."
echo "[STAR] Treat .env as a secret and never paste it into chat/GitHub."
