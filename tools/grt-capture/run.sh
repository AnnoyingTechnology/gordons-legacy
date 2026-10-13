#!/usr/bin/env bash
# Starts GRT headless (Xvfb, Wine), captures reference results, then stops GRT.
#
#   tools/grt-capture/run.sh <output directory> <file.grtload>...
set -eu

CACHE=$HOME/.cache/gordons-legacy
TOOL_DIR=$(cd "$(dirname "$0")" && pwd)
NODE=${NODE:-$(command -v node)}
DISPLAY_NUMBER=91
BRIDGE_PORT=47321

export DISPLAY=:$DISPLAY_NUMBER WINEPREFIX=$CACHE/wine WINEDEBUG=-all

if [ ! -d "$CACHE/grt/plugins/GLCapture" ]; then
  echo "Run tools/grt-capture/setup.sh first." >&2
  exit 1
fi

if ! [ -e /tmp/.X11-unix/X$DISPLAY_NUMBER ]; then
  Xvfb :$DISPLAY_NUMBER -screen 0 1600x1000x24 >/dev/null 2>&1 &
  sleep 1
fi

wineserver -k 2>/dev/null || true
(cd "$CACHE/grt" && wine GordonsReloadingTool.exe >/dev/null 2>&1 &)
trap 'wineserver -k 2>/dev/null || true' EXIT

# Wait for the bridge, which GRT starts once its window is up.
for _ in $(seq 1 120); do
  if (exec 3<>/dev/tcp/127.0.0.1/$BRIDGE_PORT) 2>/dev/null; then break; fi
  sleep 0.5
done
sleep 2

"$NODE" "$TOOL_DIR/capture.ts" --out "$@"
