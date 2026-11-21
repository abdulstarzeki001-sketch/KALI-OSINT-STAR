#!/bin/sh
set -eu

if [ -n "${STAR_TAILNET_OLLAMA_URL:-}" ]; then
    : "${TS_AUTHKEY:?Set TS_AUTHKEY to enroll this gateway in Tailscale}"
    umask 077
    runtime_dir=$(mktemp -d /tmp/star-tailnet.XXXXXX)
    auth_file="$runtime_dir/auth.key"
    printf '%s' "$TS_AUTHKEY" > "$auth_file"
    unset TS_AUTHKEY
    trap 'rm -f "$auth_file"' EXIT

    socket="$runtime_dir/tailscaled.sock"
    tailscaled --tun=userspace-networking --state=mem: --socket="$socket" \
        --outbound-http-proxy-listen=127.0.0.1:1055 &
    tailscale --socket="$socket" up --timeout=45s --auth-key="file:$auth_file" \
        --hostname=star-ai-cyber-gateway --accept-dns=false --accept-routes=false --shields-up

    rm -f "$auth_file"
    trap - EXIT
fi

exec node /app/server.mjs
