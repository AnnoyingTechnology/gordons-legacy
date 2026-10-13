#!/bin/sh
# Prepares a private copy of GRT for capturing reference results. Never touches the original install.
#
#   tools/grt-capture/setup.sh [path to the GRT install]
#
# Creates, under ~/.cache/gordons-legacy:
#   grt/   a copy of GRT, with the capture plugin installed
#   wine/  a dedicated Wine prefix
set -eu

GRT_SOURCE=${1:-$HOME/Documents/Reloading/GRT}
CACHE=$HOME/.cache/gordons-legacy
TOOL_DIR=$(cd "$(dirname "$0")" && pwd)
NODE=${NODE:-$(command -v node)}

if [ "$("$NODE" -p 'process.features.typescript')" = "false" ]; then
  echo "$NODE can't run TypeScript. Set NODE to an official Node.js 24 build (see docs/development.md)." >&2
  exit 1
fi

mkdir -p "$CACHE"
if [ ! -d "$CACHE/grt" ]; then
  echo "Copying $GRT_SOURCE to $CACHE/grt"
  cp -a "$GRT_SOURCE" "$CACHE/grt"
fi

PLUGIN_DIR=$CACHE/grt/plugins/GLCapture
mkdir -p "$PLUGIN_DIR"
cp "$TOOL_DIR/plugin/com.grt.plugin.xml" "$PLUGIN_DIR/"
# GRT runs this batch file under Wine; "start /unix" launches the bridge as a Linux process.
printf '@echo off\r\nstart /unix %s %s %%*\r\n' "$NODE" "$TOOL_DIR/bridge.ts" > "$PLUGIN_DIR/capture.bat"

if [ ! -f "$CACHE/wine/system.reg" ]; then
  echo "Creating the Wine prefix $CACHE/wine"
  WINEPREFIX=$CACHE/wine WINEDEBUG=-all xvfb-run -a wineboot -i
fi
echo "Ready. Run tools/grt-capture/run.sh to capture reference results."
