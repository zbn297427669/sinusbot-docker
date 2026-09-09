#!/bin/bash

# print kernel/system info
uname -srmo
date

if [ -d "default_scripts" ]; then
  mkdir -p scripts
  # Only add missing defaults — never overwrite customized scripts (e.g. AloneMode).
  for f in default_scripts/*; do
    [ -e "$f" ] || continue
    base="$(basename "$f")"
    if [ -e "scripts/$base" ]; then
      echo "Keeping existing script: $base"
    else
      mv "$f" "scripts/$base"
      echo "Installed default script: $base"
    fi
  done
  rm -rf default_scripts
fi

if [ ! -f "data/config.ini" ]; then
  cp config.ini.configured data/config.ini
fi

ln -fs data/config.ini config.ini

SINUSBOT="./sinusbot"
YTDL="yt-dlp"

echo "Updating yt-dlp..."
$YTDL --restrict-filename -U
$YTDL --version

PID=0

# graceful shutdown on kill
kill_handler() {
  echo "Shutting down..."
  kill -s SIGINT -$(ps -o pgid= $PID | grep -o '[0-9]*')
  while [ -e /proc/$PID ]; do
    sleep .5
  done
  exit 0
}

trap 'kill ${!}; kill_handler' SIGTERM # docker stop
trap 'kill ${!}; kill_handler' SIGINT  # CTRL + C

GUID="${UID}"
if [[ -z "${GUID}" || "${GUID}" -eq 0 ]]; then
  GUID=9987
fi

if [[ -z "${GID}" || "${GID}" -eq 0 ]]; then
  GID=9987
fi

# WORKAROUND for `setpriv: libcap-ng is too old for "all" caps`, previously "-all" was used here
# create a list to drop all capabilities supported by current kernel
cap_prefix="-cap_"
caps="$cap_prefix$(seq -s ",$cap_prefix" 0 $(cat /proc/sys/kernel/cap_last_cap))"

SETPRIV="setpriv --clear-groups --inh-caps=$caps"

# set user id
echo "User ID: $GUID"
SETPRIV="$SETPRIV --reuid=$GUID"
echo "Change file owner..."
chown -R "$GUID" "$PWD"

# set group id
echo "Group ID: $GID"
SETPRIV="$SETPRIV --regid=$GID"
echo "Change file group..."
chown -R ":$GID" "$PWD"

echo "Drop privileges..."
SINUSBOT="$SETPRIV $SINUSBOT"
YTDL="$SETPRIV $YTDL"

echo "Clearing yt-dlp cache..."
$YTDL --rm-cache-dir

# YouTube: wrap yt-dlp so SinusBot always gets cookies + a safe format selector.
# Format 18 is rarely offered now; "-f 18/best" → exit 1 → playlist skip storms.
COOKIES_FILE="data/youtube-cookies.txt"
YTDLP_CONF="data/yt-dlp.conf"
YTDLP_CONF_EXAMPLE="yt-dlp.conf.example"
WRAPPER="data/yt-dlp-wrapper.sh"
# Prefer low-bitrate audio; best* = progressive fallback without ffmpeg merge.
SAFE_YTDL_FORMAT='ba[abr<=128]/bestaudio/best*'

write_safe_ytdlp_conf() {
  cat > "${YTDLP_CONF}" << EOF
# Auto-managed default (see yt-dlp.conf.example in the repo).
# Do NOT use -f 18 / 18/best — often unavailable → yt-dlp exit 1 skip storms.
-f ${SAFE_YTDL_FORMAT}
--no-part
--socket-timeout 30
--retries 5
EOF
}

# Seed or repair data/yt-dlp.conf before generating the wrapper.
if [[ ! -f "${YTDLP_CONF}" ]]; then
  if [[ -f "${YTDLP_CONF_EXAMPLE}" ]]; then
    cp "${YTDLP_CONF_EXAMPLE}" "${YTDLP_CONF}"
    echo "Installed ${YTDLP_CONF} from ${YTDLP_CONF_EXAMPLE}"
  else
    write_safe_ytdlp_conf
    echo "Installed default ${YTDLP_CONF} (safe audio format)"
  fi
elif grep -qE '^[[:space:]]*-f[[:space:]]+([^#]*[[:space:]])?18([/[:space:]]|$)' "${YTDLP_CONF}" \
  || grep -qE '^[[:space:]]*-f[[:space:]]+18/' "${YTDLP_CONF}"; then
  bak="${YTDLP_CONF}.bak.$(date +%Y%m%d%H%M%S)"
  cp "${YTDLP_CONF}" "${bak}"
  write_safe_ytdlp_conf
  echo "WARN: ${YTDLP_CONF} requested format 18 (often unavailable)."
  echo "WARN: backed up to ${bak} and replaced with a safe -f ${SAFE_YTDL_FORMAT}"
fi

YTDL_REAL="$(command -v yt-dlp || true)"
if [[ -z "${YTDL_REAL}" && -x /usr/local/bin/yt-dlp ]]; then
  YTDL_REAL="/usr/local/bin/yt-dlp"
fi
if [[ -n "${YTDL_REAL}" ]]; then
  # Wrapper: cookies + conf when present; if no conf, inject SAFE_YTDL_FORMAT on CLI.
  cat > "${WRAPPER}" << EOF
#!/bin/sh
REAL="${YTDL_REAL}"
COOKIES="/opt/sinusbot/data/youtube-cookies.txt"
CONF="/opt/sinusbot/data/yt-dlp.conf"
SAFE_FMT="${SAFE_YTDL_FORMAT}"
EXTRA=""
if [ -f "\$COOKIES" ]; then
  EXTRA="\$EXTRA --cookies \$COOKIES"
fi
if [ -f "\$CONF" ]; then
  EXTRA="\$EXTRA --config-locations \$CONF"
else
  # No conf: still force a safe format so SinusBot never defaults into missing itags.
  EXTRA="\$EXTRA -f \$SAFE_FMT"
fi
exec "\$REAL" \$EXTRA "\$@"
EOF
  chmod 755 "${WRAPPER}"
  # Point SinusBot at the wrapper (create key if missing; never clobber other settings)
  if grep -q '^YoutubeDLPath' data/config.ini 2>/dev/null; then
    sed -i 's|^YoutubeDLPath.*|YoutubeDLPath = "/opt/sinusbot/data/yt-dlp-wrapper.sh"|' data/config.ini
  else
    printf '\nYoutubeDLPath = "/opt/sinusbot/data/yt-dlp-wrapper.sh"\n' >> data/config.ini
  fi
  if [[ -f "${COOKIES_FILE}" ]]; then
    echo "YouTube cookies found — yt-dlp wrapper enabled"
  else
    echo "No YouTube cookies yet — put Netscape cookies at data/youtube-cookies.txt then restart"
  fi
  echo "yt-dlp conf: $([ -f "${YTDLP_CONF}" ] && echo present || echo missing) | safe format: ${SAFE_YTDL_FORMAT}"
fi

echo "Starting SinusBot..."
if [[ -v OVERRIDE_PASSWORD ]]; then
  echo "Overriding password..."
  $SINUSBOT --override-password="${OVERRIDE_PASSWORD}" &
else
  $SINUSBOT &
fi

PID=$!
echo "PID: $PID"

while true; do
  tail -f /dev/null & wait ${!}
done
