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
