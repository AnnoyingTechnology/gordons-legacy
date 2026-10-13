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
addresses from Xojo's registration code.

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

### Vivacity along the burn (read)

The dynamic vivacity Ba·φ(z) is computed from the powder's form function (one branch below z1, another
above) times the temperature-corrected Ba, then smoothed twice by exponential moving averages over the
integration steps, with weights from GRT's configuration (`CORE_BAPHI_ALPHA_BA1`,
`CORE_BAPHI_ALPHA_BAFIR`). Open: φ(z), the weights' values, and `fn_FactorBaPs`.

### Covolume (read; open)

`fn_coVol(z) = z · mc · η`, with η the propellant's `eta` in cm³/g. Sweeps show `eta` doesn't affect
the results, so this function is not on the pressure path, or is overridden. Open.

## Open

- The integration loop (`computeMain`, `compute_BurnAphi`, `compute_BurnBphi`) and its 2000-step travel
  grid.
- The equation of state and energy balance (`fn_pm`, `fn_Psi`, `fn_Sigma`, `fn_theta*`).
- Losses: `fn_pLoss` (gas leaks), `fn_mFriction`, `fn_EfrictionInternal`, `fn_Etwist`, `fn_mAir`,
  `fn_gDrag`.
- Shot start and jump: `fn_mPs`, `fn_jumpTime`, `fn_VbAdjust_gjump`.
