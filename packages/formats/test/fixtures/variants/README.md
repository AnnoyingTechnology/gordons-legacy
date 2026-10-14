# Variants

Fixture loads with one input changed, to cover features the original files don't use. Each file states
its origin and change below; the licence is the original's.

| File | Origin | Change |
|---|---|---|
| `327_Federal_Magnum_jump_1.5mm.grtload` | `cc0/loads/327_Federal_Magnum_by_dpeppe01_2022.12.12.grtload` | Jump to the lands set to 1.5 mm (`gjump`, `gjumpUnlock`) |
| `300_blackout_full_patate_jump_0.8mm.grtload` | `maintainer/300_blackout_Hornady_110gr_vmax_full_patate.grtload` | Jump to the lands set to 0.8 mm |
| `327_Federal_Magnum_z2_0.grtload` | `cc0/loads/327_Federal_Magnum_by_dpeppe01_2022.12.12.grtload` | z2 set to 0, below z1: GRT computes its own |
| `300_blackout_full_patate_z2_1.grtload` | `maintainer/300_blackout_Hornady_110gr_vmax_full_patate.grtload` | z2 set to 1, above 0.99: GRT computes its own |
| `300_blackout_full_patate_round_hole.grtload` | `maintainer/300_blackout_Hornady_110gr_vmax_full_patate.grtload` | A 3 mm round hole (gas leak type 1) at 200 mm |
| `300_blackout_full_patate_square_hole.grtload` | same | A 4 × 3 mm square hole (type 2) at 200 mm |
| `300_blackout_full_patate_slot.grtload` | same | A slot (type 3), 5 mm wide and 1.5 mm deep, at 200 mm |
