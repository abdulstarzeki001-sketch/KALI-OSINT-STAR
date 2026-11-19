#!/usr/bin/env bash
# Open a recorded attacker shell for a training-range session.
#
#   bash scripts/range-shell.sh            # new recorded session
#   bash scripts/range-shell.sh juice-shop # tag the session with a lab id
#
# Everything you type and see is saved (with timing, so it can be replayed)
# under ~/.local/share/kali-osint-star/sessions/, readable only by you.
# STAR Coach will use these logs to review how you solved a challenge.
# Replay later with: scriptreplay --timing=<dir>/timing.log <dir>/session.log
set -euo pipefail
umask 077

lab="${1:-general}"
if [[ ! "$lab" =~ ^[a-z0-9-]{2,32}$ ]]; then
  echo "Lab id must be 2-32 chars of a-z, 0-9 or '-'" >&2; exit 2
fi
if ! command -v script >/dev/null; then
  echo "'script' (util-linux) is required: sudo apt install util-linux" >&2; exit 1
fi

base="${STAR_SESSIONS_DIR:-$HOME/.local/share/kali-osint-star/sessions}"
stamp="$(date -u +%Y%m%dT%H%M%SZ)"
dir="$base/$stamp-$lab"
mkdir -p "$dir"
chmod 700 "$base" "$dir"
printf '{"lab":"%s","started_at":"%s","host":"%s"}\n' "$lab" "$stamp" "$(hostname)" > "$dir/meta.json"

cat <<EOF
[STAR RANGE] Recorded session: $dir
[STAR RANGE] Targets: Juice Shop http://127.0.0.1:3000 · DVWA http://127.0.0.1:4280 · WebGoat http://127.0.0.1:8081/WebGoat
[STAR RANGE] Only attack the range targets above. Type 'exit' to end the recording.
EOF

export STAR_RANGE_SESSION="$dir" STAR_RANGE_LAB="$lab"
script -q --log-out "$dir/session.log" --log-timing "$dir/timing.log" -c "${SHELL:-/bin/bash}"
echo "[STAR RANGE] Saved: $dir"
