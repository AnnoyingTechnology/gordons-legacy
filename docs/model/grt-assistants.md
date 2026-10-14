# GRT's input assistants

Calculators GRT offered next to some inputs, read from its binary (decision of 2026-10-13). They help
fill a load in; they are not part of the simulation.

## Effective bore area (read)

`AssistAeffWin` calls a function of the bore diameter F, groove diameter Z, groove width b and number
of grooves N, which also returns the groove angle α = 360 · b / (π F) degrees and the land width
l = (π F − N b) / N. With A_F = π F²/4 and A_Z = π Z²/4 (GRT writes π/4 as 0.7853981633974483):

| Profile (GRT's caption) | Area |
|---|---|
| Standard (field/groove-profile) | N α (A_Z − A_F) / 360 + A_F: each groove adds its angular share of the ring |
| Polygonal (multi-corner shape) | A_Z − N · (((Z − F) / 1.5) / 2 · (l / 2) · π) / 2: the groove circle less a half-ellipse per land |
| Polygonal (multi-round shape) | sin((360 / N) π / 180) · N · (Z/2)² / 2: a regular N-sided polygon inscribed in the groove circle |

Check: 300 AAC Blackout per CIP (F 7.62, Z 7.82, b 4.52, N 4 mm) gives 47.435 mm² where the CIP sheet
gives 47.54 mm²; GRT's manual warns that standards may differ from the calculator. Implemented in
`packages/app/src/editor/bore-area.ts`.

## Powder temperature coefficients (read; GRT's search replaced by a bisection)

`AssistPtWin.Compute` takes velocities measured with one charge at a cold temperature, at 21 °C and at
a hot temperature. It offsets the simulation to the 21 °C measurement (offset = simulated − measured
at 21 °C), then searches tcc so that the simulated velocity at the cold temperature equals the cold
measurement plus the offset, and tch likewise at the hot temperature. GRT runs the search with a
helper object; the velocity rises monotonically with either coefficient, so `fitTemperatureCoefficients`
(engine, `calibration.ts`) bisects on [−2, 2] instead and reaches the same root. A powder with both
coefficients at 0 uses GRT's defaults (−0.0214, 0.0381); the fit and the application start from those.

## Initial pressure

GRT's assistant lists typical starting values: pistol and revolver, jacketed bullets 80–150 bar,
standard lead 50–80 bar, soft lead 20–50 bar; rifle, jacketed bullets 250 bar (manual p. 32). The
editor shows them as the field's hint.
