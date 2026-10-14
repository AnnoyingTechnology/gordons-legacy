# GRTrace files (`.grtrace`)

Recordings of GRT's GRTrace plugin, which read a PressureTrace II strain-gauge box. Observed on one
file written by GRTrace `2020.144-NIGHTLY` (a sample shipped with the plugin; not committed).

Plain JSON (not percent-encoded as a whole, but text values inside are percent-encoded, as in GRT's XML):

| Key | Content |
|---|---|
| `Type` | `"GRTrace"` |
| `GRTraceVersion`, `DateTime`, `Device` | writer version, recording date, `"PressureTrace II"` |
| `DeviceValues`, `CalibrationValues` | the box's settings (resistances, gain, trigger level…) |
| `Config` | the gauge and case setup (`Di`, `Da` barrel diameters, `GageFactor`, `Emodule`, `vnu`, case wall `thcase`…) and the components as text: `Projectile`, `Propellant`, `Case`, `Primer` |
| `Traces` | one object per shot |
| `AvgTrace`, `bar_avg`, `bar_es`, `vel_avg`… | the recording's averages |

Each trace: `Designation` (shot name), `Notes`, `PowderCharge` (grains, inferred: "50" for a .30-06
with 50.0 gr of IMR 4166, as the file name says), `COAL` (mm), `CaseVolume` (grains of water,
inferred), `Velocity` (m/s), `pmax_bar` and `pmax_psi` (the peak, from the strain gauge),
`case_bar`, and the curve `Record`: samples `{ time, value, bar, psi }`, `time` a sample index (the
sampling interval is not in the file), with `PeakIdx`, `TriggerIdx`, `MaxTime`.

Strain-gauge peaks are estimates calibrated from the barrel's elastic response, not transducer
measurements; their offset from a CIP or SAAMI transducer depends on the setup.

Gordon's Legacy imports each shot's velocity and peak as a measurement series (`importGrtrace`), not
the curves.
