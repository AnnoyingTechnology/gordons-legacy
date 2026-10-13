# GRT plugin IPC

GRT exposes a local socket to its plugins. Gordon's Legacy uses it to capture GRT's simulation results
as reference data (tool: [`tools/grt-capture/`](../tools/grt-capture/)). Observed 2026-10-13 on GRT
`2021.2030-NIGHTLY` under Wine 10. The protocol knowledge comes from the MIT-licensed
[GRT-Reloading-Toolkit](https://github.com/FREESHOTER/GRT-Reloading-Toolkit) (`GrtPluginKit/Ipc/GrtClient.cs`)
and was confirmed live.

## Connection

- A plugin is a folder in GRT's `plugins/` with a `com.grt.plugin.xml` manifest naming its executable
  (`launch-windows`). With `launch-type="permanent"`, GRT starts it at startup.
- GRT launches the executable with `--ipcport N` and listens on `127.0.0.1:N` only until the plugin
  connects, within the manifest's `start-timeout` (seconds). A client that connects later is refused.
- Under Wine, the plugin can be a batch file that starts a Linux program with `start /unix <program>`;
  Wine sockets are host sockets, so the Linux program connects directly.
- Messages in both directions are compact JSON objects, concatenated without separators. Split them by
  matching braces outside strings.
- GRT first sends `{"Event_Attached":{"windowhandle":…,"LanguageCode":"en",…}}`.

## Commands

Each request is one object whose only key is the command; GRT answers `{"Result":{"command":…,
"status":"success"|…,"values":…}}`. Send one request at a time and wait for its answer.

| Request | Answer `values` |
|---|---|
| `{"Load_File":{"filepath":"Z:\\path\\to\\load.grtload"}}` | `null`. Opens the file in a new tab and simulates it. |
| `{"Get_TabOnTop":null}` | `tabhandle`, `caption`, `file`, `ontop`, `changed`, `locked`. |
| `{"Get_TabResults":{"tabhandle":"…"}}` | `data` (scalar results), `chunkStreamHandle`, `chunkCount`. |
| `{"Get_Chunk":{"chunkStreamHandle":"…","chunkIndex":"0"}}` | `data` (curve points), `EOF`. |
| `{"Close_ChunkStream":{"chunkStreamHandle":"…"}}` | `null`. Always close a stream you opened. |

Values are strings. Quantities carry their unit after a space (`"1961.524121728012688 bar"`), at full
double precision.

## Results (`Get_TabResults` → `data`)

The results are always those of the load's main charge (`mc`), whatever the ladder settings: the
.327 Federal fixture gives identical results for `CurveFocusIdx` 0 to 8 and `laddercnt` 1 and 2. The IPC
therefore can't show the other ladder steps. Observed fields:

| Field | Unit | Meaning |
|---|---|---|
| `MaxPressure` | bar | Peak pressure |
| `MuzzleVelocity`, `MaxVelocity`, `Vmax` | m/s | Velocity at the muzzle, and its maximum |
| `MuzzlePressure` | bar | Pressure at the muzzle |
| `MuzzleTime` | ms | Time from ignition to muzzle exit |
| `MuzzleEnergy`, `Emax`, `Ekin` | J | Projectile energy at the muzzle; `Ekin` unclear (lower than `MuzzleEnergy`) |
| `Erot` | J | Rotational energy |
| `Eprop` | J | Chemical energy of the charge: charge mass × `Qex` (identifies the charge simulated) |
| `Efriction`, `EfrictionI`, `EfrictionU`, `MuzzleEfriction`, `Eair` | J | Friction and air losses |
| `Efficiency` | | Muzzle energy / `Eprop` |
| `BurnoutInBarrel`, `BurnoutPressure`, `z` | –, bar, – | Burnout before the muzzle, pressure at burnout, burnt fraction at the muzzle |
| `Pmax10Pressure`, `Pmax10Time` | bar, ms | 10 % of peak pressure and when it is reached |
| `BulletLeadTime10Pmax` | ms | Barrel time counted from 10 % of peak pressure (used by OBT) |
| `OptimalBarrelTime`, `OptimalBarrelTimeNode` | ms, – | Nearest OBT node, for example `#15 ½` |
| `MuzzleRPM` | 1/min | Spin at the muzzle |
| `Recoil*`, `IPSCFaktor`, `MIPFaktor` | | Recoil and match power factors |
| `PointIdxZ1`, `PointIdxZ2`, `PointIdxPmax`, `PointIdxBurnout`, `PointIdxBurnedEnergy95` | | Indices into the curve |
| `invalidData`, `invalidPressure`, `invalidPropellant`, `PropellantCharge*`, `ThruPressureMax`, `gjumpTime` | | Validity flags and jump time |

## Curve (`Get_Chunk` → `data`)

Points have `x` (projectile base position from the breech face, mm), `z` (burnt fraction), `p` (bar),
`v` (m/s), `e` (projectile energy, J) and `t` (ms). A .327 Federal load gave 84 chunks, 2000 points:

- **The curve is uniform in travel**, not in time: `x` runs from the seated base position
  (case length − seating depth) to the muzzle in equal steps (0.050785 mm for a 127 mm barrel).
- The first point is the shot start, at the initial pressure (`p` = 150 bar, `z` = 0, `t` = 0). The
  second point also has `t` = 0.
- At `PointIdxZ1` and `PointIdxZ2`, `z` equals the powder's `z1` and `z2`.
