#!/usr/bin/env sh
set -eu
if [ -z "${STAR_CPU_API_KEY:-}" ]; then
  if [ ! -r .env ]; then printf '%s\n' 'Set STAR_CPU_API_KEY or create .env first' >&2; exit 2; fi
  STAR_CPU_API_KEY=$(sed -n 's/^STAR_CPU_API_KEY=//p' .env | head -n 1)
fi
[ "${#STAR_CPU_API_KEY}" -ge 32 ] || { echo 'API key too short' >&2; exit 2; }
BASE_URL="${STAR_CPU_BASE_URL:-http://127.0.0.1:8080}"
printf '%s\n' 'Checking authenticated model list...'
curl -fsS --max-time 20 -H "Authorization: Bearer $STAR_CPU_API_KEY" "$BASE_URL/v1/models"
printf '\n%s\n' 'Checking a short text-only completion...'
curl -fsS --max-time 180 -H "Authorization: Bearer $STAR_CPU_API_KEY" \
  -H 'Content-Type: application/json' \
  --data '{"model":"star-ai-cpu","messages":[{"role":"user","content":"Reply with only: STAR CPU READY"}],"max_tokens":24,"stream":false}' \
  "$BASE_URL/v1/chat/completions"
printf '\n'
