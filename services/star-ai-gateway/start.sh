#!/bin/sh
set -eu

if [ -n "${STAR_TAILNET_OLLAMA_URL:-}" ] && [ -n "${TS_AUTHKEY:-}" ]; then
    umask 077
    runtime_dir=$(mktemp -d /tmp/star-tailnet.XXXXXX)
    auth_file="$runtime_dir/auth.key"
    printf '%s' "$TS_AUTHKEY" > "$auth_file"
    unset TS_AUTHKEY
    trap 'rm -f "$auth_file"' EXIT

    socket="$runtime_dir/tailscaled.sock"
    tailscaled --tun=userspace-networking --state=mem: --socket="$socket" \
        --outbound-http-proxy-listen=127.0.0.1:1055 &
    tailscale_pid=$!
    if ! tailscale --socket="$socket" up --timeout=45s --auth-key="file:$auth_file" \
        --hostname=star-ai-cyber-gateway --accept-dns=false --accept-routes=false --shields-up; then
        echo 'Tailscale enrollment failed; starting without Ollama' >&2
        kill "$tailscale_pid" 2>/dev/null || true
        wait "$tailscale_pid" 2>/dev/null || true
        unset STAR_TAILNET_OLLAMA_URL
    fi

    rm -f "$auth_file"
    trap - EXIT
elif [ -n "${STAR_TAILNET_OLLAMA_URL:-}" ]; then
    echo 'Tailscale auth key is missing; starting without Ollama' >&2
    unset STAR_TAILNET_OLLAMA_URL
fi
unset TS_AUTHKEY

exec node /app/server.mjs
