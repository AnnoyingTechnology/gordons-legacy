# grt-capture

Captures the results of the original Gordon's Reloading Tool (GRT) for load files, as reference data
for Gordon's Legacy's engine. Maintainer tool: it needs a GRT install, which can no longer be downloaded.

It runs a private copy of GRT headless (Xvfb and Wine), with a small plugin that gives access to GRT's
plugin IPC (see [docs/grt-ipc.md](../../docs/grt-ipc.md)), opens each load, and writes GRT's results and
curve to a JSON file.

## Requirements

- Wine with 32-bit support (`wine32`), Xvfb.
- An official Node.js 24 build, which runs TypeScript (Debian's doesn't; see
  [docs/development.md](../../docs/development.md)). Point `NODE` at it.

## Use

```sh
export NODE=~/.local/opt/node-v24.21.0-linux-x64/bin/node
tools/grt-capture/setup.sh ~/Documents/Reloading/GRT      # once
tools/grt-capture/run.sh capture --out <directory> <file.grtload>...
tools/grt-capture/run.sh sweep [--fields MaxPressure,MuzzleVelocity] <base.grtload> Ba=3.0,3.2 mc=0.38,0.40
```

`sweep` varies one input at a time around a base load and prints GRT's results as a table, to study the
model. `compare.ts` checks the GRT Traditional engine against captured references, for load files
that can't be committed:

```sh
tools/grt-capture/run.sh capture --out ~/.cache/gordons-legacy/references/mine my-loads/*.grtload
$NODE tools/grt-capture/compare.ts --references ~/.cache/gordons-legacy/references/mine my-loads/*.grtload
```

`setup.sh` copies GRT to `~/.cache/gordons-legacy/grt`, installs the plugin into the copy and creates a
Wine prefix in `~/.cache/gordons-legacy/wine`. The original install is never modified.

## Files

| File | Role |
|---|---|
| `setup.sh` | One-time preparation. |
| `run.sh` | Starts GRT on a private X display, runs `capture.ts`, stops GRT. |
| `plugin/com.grt.plugin.xml` | Plugin manifest; GRT starts `capture.bat`, which `setup.sh` writes. |
| `bridge.ts` | Started by GRT through the plugin; holds the IPC connection and relays it on port 47321. |
| `grt-ipc-client.ts` | Typed client for GRT's IPC commands. |
| `simulate.ts` | Runs one load text through GRT; edits input values. |
| `capture.ts` | Loads each file in GRT and writes the reference JSON (`GrtReference`). |
| `sweep.ts` | Varies inputs one at a time and tabulates GRT's results. |
| `compare.ts` | Compares the engine with captured references (no GRT needed). |

Each load is simulated from a working copy with the ladder disabled and the first curve selected, so the
results belong to the load's own charge; the reference file lists these changes.
