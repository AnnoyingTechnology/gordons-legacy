# GRT's model: observations

Black-box facts about GRT's simulation (`2021.2030-NIGHTLY`), measured through its plugin IPC with
`tools/grt-capture`. Each fact names its evidence. Equations derived from the binary go in a separate
document once found.

## Discretization

- GRT reports 2000 curve points (sometimes 2001), equally spaced in projectile travel from the seated
  base position to the muzzle. Time is a derived quantity, not the integration variable.
- Peak pressure moves slightly with barrel length although the peak occurs long before the muzzle
  (127 mm: 1961.524 bar; 100 mm: 1961.463; 150 mm: 1961.544). A fixed number of steps over the travel
  explains this: the step size changes with the barrel. Reproducing GRT to better than 10⁻⁴ requires the
  same discretization.
- The burnt fraction at `PointIdxZ1` and `PointIdxZ2` equals the powder's `z1` and `z2`.

## Inputs that don't affect the simulation

Varying these alone leaves every result identical (.327 Federal fixture):

| Input | Range tried | Interpretation |
|---|---|---|
| `eta` (covolume) | 0.8–1.2 | Ignored, or replaced by an internal value. Every file carries 1. |
| `pcd` (bulk density) | 700–900 kg/m³ | Used only for the fill ratio. |
| `gpressure` (projectile) | 100–200 bar | The simulation reads the caliber's `ps` instead. |
| `glen` (projectile length) | 10.5–12.5 mm | GRT keeps the seating depth and moves the overall length. |
| ladder settings | `laddercnt`, `CurveFocusIdx` | The IPC reports the main charge only. |

## One-at-a-time sensitivities

Base: `cc0/loads/327_Federal_Magnum_by_dpeppe01_2022.12.12.grtload`, Pmax 1961.52 bar,
v0 410.79 m/s. Each row changes one input; units as in GRT's files.

| Input | Value | Pmax (bar) | ΔPmax | v0 (m/s) | Δv0 |
|---|---|---|---|---|---|
| `Ba` | 3.0 | 1753.90 | -10.58 % | 402.45 | -2.03 % |
| `Ba` | 3.6 | 2184.74 | +11.38 % | 417.32 | +1.59 % |
| `a0` | 1.5 | 1843.00 | -6.04 % | 406.72 | -0.99 % |
| `a0` | 3.0 | 2049.57 | +4.49 % | 413.29 | +0.61 % |
| `z1` | 0.25 | 1837.78 | -6.31 % | 406.80 | -0.97 % |
| `z1` | 0.40 | 2066.28 | +5.34 % | 413.11 | +0.57 % |
| `z2` | 0.75 | 1961.52 | +0.00 % | 411.09 | +0.07 % |
| `z2` | 0.90 | 1961.52 | +0.00 % | 410.89 | +0.02 % |
| `k` | 1.20 | 1691.94 | -13.74 % | 389.89 | -5.09 % |
| `k` | 1.25 | 2335.40 | +19.06 % | 435.92 | +6.12 % |
| `Qex` | 3800 | 1814.74 | -7.48 % | 398.67 | -2.95 % |
| `Qex` | 4200 | 2111.28 | +7.63 % | 422.53 | +2.86 % |
| `eta` | 0.8 | 1961.52 | +0.00 % | 410.79 | +0.00 % |
| `eta` | 1.2 | 1961.52 | +0.00 % | 410.79 | +0.00 % |
| `pc` | 1500 | 2031.45 | +3.56 % | 413.96 | +0.77 % |
| `pc` | 1800 | 1919.43 | -2.15 % | 408.84 | -0.48 % |
| `pcd` | 700 | 1961.52 | +0.00 % | 410.79 | +0.00 % |
| `pcd` | 900 | 1961.52 | +0.00 % | 410.79 | +0.00 % |
| `sebert` | 0.5 | 1943.81 | -0.90 % | 413.66 | +0.70 % |
| `sebert` | 1.0 | 1978.96 | +0.89 % | 407.96 | -0.69 % |
| `ps` | 100 | 1852.24 | -5.57 % | 406.42 | -1.06 % |
| `ps` | 200 | 2063.54 | +5.20 % | 414.42 | +0.88 % |
| `gpressure` | 100 | 1961.52 | +0.00 % | 410.79 | +0.00 % |
| `gpressure` | 200 | 1961.52 | +0.00 % | 410.79 | +0.00 % |
| `casevol` | 1.1 | 2376.39 | +21.15 % | 427.58 | +4.09 % |
| `casevol` | 1.35 | 1704.47 | -13.10 % | 398.01 | -3.11 % |
| `xe` | 100 | 1961.46 | -0.00 % | 381.83 | -7.05 % |
| `xe` | 150 | 1961.54 | +0.00 % | 428.69 | +4.36 % |
| `mp` | 5.0 | 1865.79 | -4.88 % | 426.38 | +3.80 % |
| `mp` | 6.0 | 2047.16 | +4.37 % | 397.02 | -3.35 % |
| `pt` | 0 | 1935.17 | -1.34 % | 409.87 | -0.22 % |
| `pt` | 40 | 2004.90 | +2.21 % | 412.22 | +0.35 % |
| `Aeff` | 45 | 2094.51 | +6.78 % | 409.29 | -0.36 % |
| `Aeff` | 50 | 1873.39 | -4.49 % | 411.43 | +0.16 % |
| `mc` | 0.35 | 1618.43 | -17.49 % | 384.42 | -6.42 % |
| `mc` | 0.42 | 2263.30 | +15.38 % | 431.01 | +4.92 % |
| `glen` | 10.5 | 1961.52 | +0.00 % | 410.79 | +0.00 % |
| `glen` | 12.5 | 1961.52 | +0.00 % | 410.79 | +0.00 % |
| `gfriction` | -20 | 1943.70 | -0.91 % | 413.74 | +0.72 % |
| `gfriction` | 50 | 2004.88 | +2.21 % | 403.62 | -1.74 % |

Notes:

- `z2` doesn't move Pmax here because the peak comes before the burnt fraction reaches `z2`.
- `pt` (powder temperature) changes the results although the powder's `tcc` and `tch` are 0, so GRT
  applies its internal default coefficients, as its manual says.
