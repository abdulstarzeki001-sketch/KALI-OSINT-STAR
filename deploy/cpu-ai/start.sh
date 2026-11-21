#!/bin/sh
set -eu
if [ -z "${LLAMA_API_KEY:-}" ] || [ "${#LLAMA_API_KEY}" -lt 32 ]; then
  echo 'FATAL: LLAMA_API_KEY missing or shorter than 32 characters; refusing to expose inference API' >&2
  exit 1
fi
if [ "${LLAMA_API_KEY}" = 'CHANGE_ME_GENERATE_WITH_PYTHON_SECRETS' ]; then
  echo 'FATAL: placeholder API key is not allowed' >&2
  exit 1
fi
exec /app/llama-server "$@"
