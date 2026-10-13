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

Emulating GRT's own step functions in this loop reproduces the .327 Federal reference completely: the
2000 points within the reference's printed precision (5·10⁻¹⁰), burnout at the same step, and the muzzle
velocity to all 17 digits.

## The step (read; confirmed by emulation)

GRT combines a closed-form interior-ballistics solution, used for the burnt fraction and the pressure,
with a step-by-step integration of the projectile's motion. At each ξ:

1. θ = 1 − (1 + ξ)^(−(k − 1)/2), with k the ratio of specific heats.
2. B = the effective vivacity: the running mean, since ignition, of the smoothed Ba₀·φ(z) (see
   Vivacity), times F(B̄) = 1 + B̄ · `CORE_FAKTOR_FBA` · p_s (not for shotshells).
3. Closed-form velocity v_θ = θ · 2 · Q_ex · m_c · B / (A_eff · p₀), with Q_ex in J/kg.
4. Burnt fraction z = v_θ · m_eff · B / (A_eff · p₀), with m_eff = m_p + s · m_c (s the Sebert factor).
   This is the classical result of a burn rate proportional to pressure: dz/dv = B · m / (A · p₀).
5. Pressure p_m = 10 · p_abs · θ(1 − θ) / (1 + ξ) [bar], with
   p_abs = 2(k − 1) · m_eff · (B · m_c · Q_ex)² / (p₀² · A_eff² · V_free) and Q_ex here in kJ/kg.
6. p = p_m + p_s · (1 − z) − p_loss: the initial pressure p_s fades as the powder burns; p_loss is the
   pressure lost through gas leaks (0 without leaks).
7. The reported pressure is smoothed: p̃ ← 0.27 · p + 0.73 · p̃ (the first value is taken as is).
8. The projectile is accelerated by the smoothed pressure:
   a = (p̃ · 10⁵ · A_eff − E_friction − E_air − E_rot,step) / m_eff, and v² = v_prev² + 2 a Δx. The loss
   terms are cumulative energies subtracted from a force, as GRT does.
9. The point also records the effective gas volume V_free + A_eff · x − covolume(z), the propellant
   energy z · Q_ex · m_c, and the energies. The covolume never enters the pressure: this is why the
   powder's `eta` has no effect on GRT's results.

## Chamber geometry (read; confirmed by emulation)

V_b = 0.9975 · (V_case − V_intrusion), where V_case is the case capacity and the intrusion is the
projectile's cylinder (its own diameter) over the seating depth, corrected by the base:

- flat base: no correction;
- hollow base: plus the cavity, a cone frustum (π h / 3)(r_A² + r_A r_B + r_B²);
- boat-tail: plus π r² h minus the frustum, the volume the tail leaves free (open: tails longer than the
  seating depth).

V_free = V_b − m_c / ρ_grain, and the travel to the muzzle is x_eff = barrel length − (case length −
seating depth).

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
- z > z1, degressive: φ(z) = max(φ_d(z2), φ_d(z)) with φ_d(z) = zb · (|a0| · (1 − z))^c, or
  zb · (1 − z)^c when a0 = 0, or 1 when a0 = 0 and z1 = 1; with c = a1 when 0.1 ≤ a1 ≤ 0.9, otherwise
  c = 0.3051.

`zb` is not the file's z2: GRT searches it (`AutoCompute_zb`) so that φ is continuous at z1; the file's
z2 is where φ stops decreasing. See grt-traditional.md, Form function setup.

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

- The end of burning (`compute_BurnAphi_End`) and the phase B step (`compute_BurnBphi`).
- `fn_Psi`, `fn_Sigma`, `fn_thetaB`, `fn_thetaPm`, `fn_pAbs`'s use outside the step.
- Losses: `fn_pLoss` (gas leaks), `fn_mFriction`, `fn_EfrictionInternal`, `fn_Etwist`, `fn_mAir`,
  `fn_gDrag`.
- Shot start and jump: `fn_mPs`, `fn_jumpTime`, `fn_VbAdjust_gjump`.
