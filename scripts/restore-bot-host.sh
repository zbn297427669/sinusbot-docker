#!/usr/bin/env bash
# Restore a SinusBot host backup into this deploy directory.
# Usage:
#   ./scripts/restore-bot-host.sh /path/to/sinusbot-backup.tgz
#   ./scripts/restore-bot-host.sh backup.tgz --force   # overwrite existing data/
# Env:
#   START=1          — docker compose up -d after restore
#   DATA_UID=9987    — owner for data/ + scripts/ (SinusBot container user)
#   DATA_GID=9987
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

ARCHIVE="${1:-}"
FORCE=0
shift || true
for arg in "$@"; do
  case "$arg" in
    --force|-f) FORCE=1 ;;
    *)
      echo "Unknown option: $arg" >&2
      exit 1
      ;;
  esac
done

if [[ -z "$ARCHIVE" || ! -f "$ARCHIVE" ]]; then
  echo "Usage: $0 <backup.tgz> [--force]" >&2
  exit 1
fi

ARCHIVE="$(cd "$(dirname "$ARCHIVE")" && pwd)/$(basename "$ARCHIVE")"

if ! tar tzf "$ARCHIVE" | grep -qE '^data(/|$)'; then
  echo "ERROR: archive does not look like a sinusbot-host backup (need data/)." >&2
  exit 1
fi

if [[ -d data && -n "$(ls -A data 2>/dev/null || true)" && "$FORCE" != "1" ]]; then
  echo "ERROR: ./data is not empty. Pass --force to overwrite, or move it aside." >&2
  exit 1
fi

OWNER_UID="${DATA_UID:-9987}"
OWNER_GID="${DATA_GID:-9987}"

if command -v docker >/dev/null 2>&1 && [[ -f docker-compose.yml ]]; then
  echo "==> Stopping local sinusbot if running…"
  docker compose stop sinusbot 2>/dev/null || true
fi

TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

echo "==> Extracting $ARCHIVE"
tar xzf "$ARCHIVE" -C "$TMP"

if [[ ! -d "$TMP/data" ]]; then
  echo "ERROR: extracted archive missing data/." >&2
  exit 1
fi

echo "==> Installing into $ROOT"
rm -rf data
mkdir -p data
cp -a "$TMP/data/." data/

if [[ -d "$TMP/scripts" ]]; then
  # Merge: keep restore/backup helpers if already present; replace overlays from archive.
  mkdir -p scripts
  # Copy archive scripts over (does not delete untracked local-only files outside the archive).
  cp -a "$TMP/scripts/." scripts/
fi

[[ -f "$TMP/entrypoint.sh" ]] && cp -a "$TMP/entrypoint.sh" entrypoint.sh
[[ -f "$TMP/docker-compose.yml" ]] && cp -a "$TMP/docker-compose.yml" docker-compose.yml
[[ -f "$TMP/.env" ]] && cp -a "$TMP/.env" .env
[[ -f "$TMP/yt-dlp.conf.example" ]] && cp -a "$TMP/yt-dlp.conf.example" yt-dlp.conf.example

if [[ -d "$TMP/teamspeak" ]]; then
  echo "==> Restoring ./teamspeak (local TS6 volume from backup)"
  rm -rf teamspeak
  mkdir -p teamspeak
  cp -a "$TMP/teamspeak/." teamspeak/
fi

echo "==> Fixing ownership data/ scripts/ → ${OWNER_UID}:${OWNER_GID}"
if chown -R "${OWNER_UID}:${OWNER_GID}" data scripts 2>/dev/null; then
  :
elif command -v sudo >/dev/null 2>&1; then
  sudo chown -R "${OWNER_UID}:${OWNER_GID}" data scripts
else
  echo "WARN: could not chown to ${OWNER_UID}:${OWNER_GID}; fix manually before start."
fi

# entrypoint is mounted read-only; keep it readable by the host user
if [[ -f entrypoint.sh ]]; then
  chmod a+r entrypoint.sh || true
fi

echo "==> Restored data/ (sample):"
ls -la data/ | head -25
echo
echo "Next steps:"
echo "  1. Confirm OLD host sinusbot is stopped (same identity must not double-login)"
echo "  2. docker compose pull && docker compose up -d sinusbot"
echo "  3. Open WebUI http://<host>:9987 and check Connected"
echo "  4. docker compose logs -f --tail=50 sinusbot"
echo
echo "See docs/MIGRATE_BOT_HOST.md"

if [[ "${START:-0}" == "1" ]]; then
  echo "==> START=1 → docker compose up -d sinusbot"
  docker compose up -d sinusbot
fi
