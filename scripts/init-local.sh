#!/usr/bin/env bash
set -euo pipefail
umask 077
root="$(cd "$(dirname "$0")/.." && pwd)"
output="$root/.env.local"
if [[ -e "$output" ]]; then echo "Existing .env.local preserved"; exit 0; fi
python3 - "$output" <<'PY'
import secrets, sys
from pathlib import Path
path=Path(sys.argv[1])
with path.open("x", encoding="utf-8") as file:
    file.write("# LOCAL SECRETS: NEVER COMMIT OR SHARE\n")
    file.write("STAR_OPERATOR_TOKEN="+secrets.token_hex(32)+"\n")
    file.write("STAR_APPROVAL_TOKEN="+secrets.token_hex(32)+"\n")
    file.write("STAR_LAB_CIDRS=\n")
PY
chmod 600 "$output"
echo "Private local credentials generated in .env.local (chmod 600)."
