#!/usr/bin/env bash
# Backup SinusBot deploy data for moving the bot host (TS server can stay put).
# Usage (from repo / deploy root):
#   ./scripts/backup-bot-host.sh
#   ./scripts/backup-bot-host.sh /path/to/out/sinusbot-backup.tgz
#   STOP=1 ./scripts/backup-bot-host.sh          # docker compose stop sinusbot first
#   INCLUDE_TS=1 ./scripts/backup-bot-host.sh    # also pack ./teamspeak (local TS6 volume)
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

STAMP="$(date +%Y%m%d_%H%M%S)"
OUT="${1:-"$ROOT/backups/sinusbot-host_${STAMP}.tgz"}"
mkdir -p "$(dirname "$OUT")"

if [[ "${STOP:-0}" == "1" ]]; then
  if command -v docker >/dev/null 2>&1 && [[ -f docker-compose.yml ]]; then
    echo "==> Stopping sinusbot (docker compose stop sinusbot)…"
    docker compose stop sinusbot || true
  else
    echo "WARN: STOP=1 set but docker/compose not available; continuing."
  fi
fi

MISSING=()
[[ -d data ]] || MISSING+=("data/")
if ((${#MISSING[@]})); then
  echo "ERROR: missing required paths: ${MISSING[*]}" >&2
  echo "Run this in the deploy directory that contains data/." >&2
  exit 1
fi

# Always include when present.
ITEMS=(data)
[[ -d scripts ]] && ITEMS+=(scripts)
[[ -f entrypoint.sh ]] && ITEMS+=(entrypoint.sh)
[[ -f docker-compose.yml ]] && ITEMS+=(docker-compose.yml)
[[ -f .env ]] && ITEMS+=(.env)
[[ -f yt-dlp.conf.example ]] && ITEMS+=(yt-dlp.conf.example)

if [[ "${INCLUDE_TS:-0}" == "1" ]]; then
  if [[ -d teamspeak ]]; then
    ITEMS+=(teamspeak)
  else
    echo "WARN: INCLUDE_TS=1 but ./teamspeak missing; skipping."
  fi
fi

# data/ is often owned by 9987 with mode 600 (cookies, ts3 secrets) — ubuntu cannot read.
TAR=(tar)
if [[ "$(id -u)" -ne 0 ]] && find data -type f ! -readable 2>/dev/null | grep -q .; then
  if command -v sudo >/dev/null 2>&1; then
    echo "==> Some data/ files are not readable by $(whoami); using sudo tar"
    TAR=(sudo tar)
  else
    echo "ERROR: some files under data/ are not readable by $(whoami)." >&2
    echo "       Re-run as root, or: sudo chown -R \$(id -u):\$(id -g) data && … then restore ownership." >&2
    exit 1
  fi
fi

echo "==> Creating $OUT"
echo "    packing: ${ITEMS[*]}"
"${TAR[@]}" czf "$OUT" "${ITEMS[@]}"

# Archive may be root-owned when created with sudo tar
if [[ -f "$OUT" && ! -w "$OUT" ]] || [[ -f "$OUT" && "$(stat -c %u "$OUT" 2>/dev/null || true)" == "0" ]]; then
  if command -v sudo >/dev/null 2>&1; then
    sudo chown "$(id -u):$(id -g)" "$OUT" 2>/dev/null || true
  fi
fi

echo "==> Contents (first 40):"
tar tzf "$OUT" | head -40
COUNT="$(tar tzf "$OUT" | wc -l | tr -d ' ')"
echo "… ($COUNT entries)"

# Soft checks for common runtime files (existence only; may be unreadable)
exists() { [[ -e "$1" ]] || sudo test -e "$1" 2>/dev/null; }
exists data/config.ini || echo "WARN: data/config.ini missing — instance settings may be empty after restore."
exists data/youtube-cookies.txt || echo "WARN: data/youtube-cookies.txt missing — YouTube may need fresh cookies."
exists data/yt-dlp.conf || echo "WARN: data/yt-dlp.conf missing — entrypoint will seed a safe default on start."
[[ -d scripts ]] || echo "WARN: scripts/ missing — custom overlays will not be in this archive."

echo
echo "Done. Copy the archive to the new host, then:"
echo "  ./scripts/restore-bot-host.sh $OUT --force"
echo "See docs/MIGRATE_BOT_HOST.md"
echo
echo "IMPORTANT: keep the old sinusbot stopped until the new host is up,"
echo "           so the same identity/nickname is not connected twice."
if [[ "${STOP:-0}" == "1" ]]; then
  echo
  echo "Bot was stopped for this backup. To resume on THIS host:"
  echo "  docker compose start sinusbot"
fi
