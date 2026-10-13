# GRT's model: structure and recovered equations

What GRT `2021.2030-NIGHTLY` computes, recovered by analysing its binary (decision of 2026-10-13). This
page describes the model in mathematical terms; Gordon's Legacy's engine is written from it, not from
GRT's code. Status of each item: **confirmed** (read from the binary and checked against GRT's output),
**read** (read from the binary, not yet checked), or **open**.

## How the binary was read

GRT is a Xojo (REALbasic) application. `GordonsReloadingTool.exe` is a 330 KB launcher; the program is a
62 MB overlay that the launcher maps and relocates at run time. Xojo keeps class, property and method
names with their types for introspection, so the solver's structure can be read by name:

| Class | Role |
|---|---|
| `InnerBallistikData` | One load: `caliber`, `propellant`, `work`, `res` (result), `projectile`, `recoil`, `obt` |
| `InnerBallistikCore` | The solver: `Compute`, `computeMain`, `compute_BaseValues`, `compute_BurnAphi`, `compute_BurnBphi`, and `fn_*` physics functions |
| `InnerBallistikWork` | The solver's state: position `xpos`, velocity `xpunkt`, burnt fraction `z`, vivacity `Ba`, chamber volume `Vb`… |
| `InnerBallistikResult`, `InnerBallistikResultPoint` | Results and curve points |
| `InnerBallistikPropellant` | Powder data and the form function φ(z) |

Maintainer procedure (local only, nothing from it is committed): run GRT under Wine, dump the overlay's
memory, import it into Ghidra as raw x86 at its load address, then recover property offsets and method
addresses from Xojo's registration code. Framework calls are named from `guifrmwrk.dll`'s export table
(`RuntimePow`, `RuntimeAbs`, `RuntimeMin`…).

Equations are checked by emulation: a snapshot of a running GRT's memory is loaded into the Unicorn CPU
emulator, and GRT's own functions run on it with framework calls replaced by Python equivalents. Run
step by step from a reset state, GRT's step function reproduces the captured reference curve to every
digit, so each recovered equation can be compared with GRT to machine precision.

GRT works in SI internally (m, kg, m³, Pa for some quantities, bar for pressures in curve points).

## Simulation loop (read; confirmed by emulation)

The integration variable is ξ, the relative expansion: ξ = x · A_eff / V_free, where x is the
projectile travel and V_free = V_b − m_c / ρ_grain is the chamber volume behind the seated projectile
minus the solid powder volume. ξ_E is its value at the muzzle.

1. Setup (`compute_BaseValues`).
2. Phase A, while the powder burns: ξ = 0, dξ, 2dξ… with dξ = max(0.001, ξ_E / 2000), while ξ ≤ ξ_E and
   z ≤ 1. One curve point per step; the travel is x = x_eff · min(ξ, ξ_E) / ξ_E, hence GRT's uniform
   2000-step travel grid.
3. End of burning (`compute_BurnAphi_End`).
4. Phase B, after burnout, same stepping until ξ > ξ_E (`compute_BurnBphi`).
5. Results: muzzle values are the last point's; the result is flagged invalid when, among others, the
   peak pressure is below twice the initial pressure or the Sebert factor is negative.

Time is not integrated by the step function: each new point stores 1/v, and the result object
integrates dt = dx / v over pairs of steps with a Simpson-type rule (open: the exact rule).

## Recovered so far

### Powder temperature (read; consistent with sweeps)

With ΔT = T − 21 °C and the propellant's coefficients `tcc` and `tch`:

- ΔT > 0: Ba(T) = Ba · (1 + tch · ΔT / 39)
- ΔT < 0: Ba(T) = Ba · (1 + tcc · |ΔT| / 41)
- When both coefficients are 0, GRT uses tcc = −0.0214 and tch = 0.0381.

The coefficients are relative and scaled by 41 K and 39 K, which the manual's formulas don't make
clear.

### Derived quantities at start (read)

- Fill ratio: Lv = (mc / ρ_bulk) / Vb, with Vb the chamber volume behind the seated projectile. This is
  the only use of the bulk density, which is why it doesn't affect the simulation.
- Bore volume over the travel: Vr = A_eff · x_eff.
- An effective friction surface: 0.6 · π · D_groove · L_projectile.
- The initial pressure state: pMaxStart = 0.6 · f(…) (open: f).

### Form function (confirmed by emulation)

With the powder's `a0`, `a1`, `z1` and `zb`:

- z ≤ z1, progressive: φ(z) = (1 + a0 · z)^0.3571, or 1 when a0 = 0.
- z > z1, degressive: φ(z) = zb · (|a0| · (1 − z))^c, or zb · (1 − z)^c when a0 = 0, or 1 when a0 = 0
  and z1 = 1; with c = a1 when 0.1 ≤ a1 ≤ 0.9, otherwise c = 0.3051.

Open: how `zb` relates to the file's `z2` (`Compute_z2`, `AutoCompute_zb`).

### Vivacity along the burn (read)

The dynamic vivacity Ba₀·φ(z) is smoothed twice by exponential moving averages over the integration
steps: B₁ ← 0.9·B₁_new + 0.1·B₁ (weight `CORE_BAPHI_ALPHA_BA1` = 0.9), accumulated, then
B ← 0.8·B_new + 0.2·B (`CORE_BAPHI_ALPHA_BAFIR` = 0.8). Open: `fn_FactorBaPs`.

### Configuration constants (read)

GRT's solver reads these settings, with these defaults, from its configuration (no maintainer override):
`CORE_FRICTION_INTERNAL_GAWIRK` 1.511101935815519, `CORE_PRIMER_ENERGY_FACTOR` 75.09815610370678,
`CORE_FAKTOR_FBA` 3.29635e-4, `CORE_FAKTOR_FK` 2.9638e-6 (disabled), `CORE_ETWIST_ENABLED` and
`CORE_EAIRDRAG_ENABLED` on, `CORE_MAIR_ENABLED` and `CORE_MPS_ENABLED` off.

### Units (confirmed)

The vivacity `Ba` is per second per technical atmosphere: the burn law divides pressure by
p₀ = 98 066.5 Pa (1 kgf/cm²).

### Covolume (read; open)

`fn_coVol(z) = z · mc · η`, with η the propellant's `eta` in cm³/g. Sweeps show `eta` doesn't affect
the results, so this function is not on the pressure path, or is overridden. Open.

## Open

- The step equations inside `compute_BurnAphi` and `compute_BurnBphi`.
- The equation of state and energy balance (`fn_pm`, `fn_Psi`, `fn_Sigma`, `fn_theta*`).
- Losses: `fn_pLoss` (gas leaks), `fn_mFriction`, `fn_EfrictionInternal`, `fn_Etwist`, `fn_mAir`,
  `fn_gDrag`.
- Shot start and jump: `fn_mPs`, `fn_jumpTime`, `fn_VbAdjust_gjump`.
