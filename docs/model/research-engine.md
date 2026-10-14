# Research engine (M7): design

Status: **design, under review**. Nothing here is implemented or shown to users yet. Per the plan, the
research engine ships only when its measured error is no worse than GRT Traditional's on the
validation corpus ([validation.md](validation.md)).

## Why

GRT Traditional reproduces GRT, including its simplifications: a closed-form expansion with
smoothing heuristics, energies subtracted from forces, no covolume in the pressure, no heat loss and
no pressure gradient. On the maintainer's chronograph data, uncalibrated loads come out about 10 %
fast on average, and up to 40 % for low-pressure subsonic rifle loads. A model built on the standard
lumped-parameter theory should do better without per-load calibration, or at least fail in ways that
can be explained.

## Principles

- Keep GRT's powder description: the vivacity Ba with its temperature coefficients and the
  three-phase form function φ(z) (grt-traditional.md). Existing powder data then stays usable, and
  differences between the engines come from the gas dynamics, not the data.
- Use the standard equations of interior ballistics, each with a citation, each switchable, so that
  the validation can measure what each term contributes.
- Integrate in time with a standard ODE method and an error control, not a fixed grid.
- SI throughout.

References: R. H. Kent and the "Lagrange problem"; J. Corner, *Theory of the Interior Ballistics of
Guns*, Wiley, 1950; D. E. Carlucci and S. S. Jacobson, *Ballistics: Theory and Design of Guns and
Ammunition*, CRC Press, 3rd ed., 2018, ch. 2–4 (cited as C&J below); STANAG 4367 (thermodynamic
interior ballistic model with global parameters).

## State and equations

State: time t, burnt fraction z, projectile travel x, projectile velocity v, cumulative work terms.

1. **Burning (Vieille's law with GRT's vivacity).** GRT's closed form implies, through the momentum
   balance, dz/dt = Ba(T) · φ(z) · p / p₀ with p₀ = 98 066.5 Pa (Ba per second per technical
   atmosphere). The research engine uses this law directly, with the space-mean pressure p, and
   without GRT's vivacity smoothing (α₁, α_B) or its initial-pressure factor F_Ba, which are numerical
   devices of the closed form. Burning stops at z = 1.

2. **Energy (Résal's equation with Noble-Abel covolume).** With the free volume
   V(z, x) = V_b + A x − m_c (1 − z) / ρ_g − η z m_c,
   p V = (k − 1) [ z m_c Q − ½ m_p v² − ½ (m_c / 3) v² − W_r − E_rot − E_h ],
   where Q is the heat of explosion (J/kg, at constant volume), η the covolume, W_r the work against
   bore resistance, E_rot the projectile's rotational energy and E_h the heat lost to the walls. The
   ½ (m_c/3) v² term is the gas's kinetic energy under the Lagrange assumption (C&J §2.6).

3. **Pressure gradient (Lagrange).** Base pressure p_b = p / (1 + m_c / (3 m_p)); breech pressure
   p_r = p_b (1 + m_c / (2 m_p)) (C&J §2.6, Corner ch. 4). The reported chamber pressure is the breech
   pressure, the closest to where CIP and SAAMI transducers sit; the space-mean and base pressures are
   kept on the curve.

4. **Motion.** m_p dv/dt = A (p_b − p_f(x)), dx/dt = v. Shot start: the projectile stays at x = 0
   until A p_b exceeds A p_s (the load's initial pressure). The resistance p_f(x) models engraving and
   friction: p_s while the bearing surface engraves (over a travel equal to the bearing length,
   approximated from the projectile's length), then a lower friction pressure, by default a fixed
   fraction of p_s (to be set from the validation, and compared with published friction data).

5. **Rotation.** E_rot = ½ I ω² with ω = 2π v / L_tw and I = 0.5 m_p r² (a solid cylinder; open:
   better estimates of I for jacketed bullets).

6. **Heat loss.** E_h from a convective model on the wetted area (chamber walls plus bore behind the
   projectile), with a heat-transfer coefficient from the Nordheim correlation (C&J §3.5), or, in a
   first version, a global loss coefficient fitted on the validation corpus (STANAG 4367 style).

7. **Leaks, jump to the lands.** Not in the first version; loads with gas leaks or a jump are
   refused by this engine until modelled.

Integration: an embedded Runge-Kutta method (Dormand-Prince 5(4)) with relative tolerance 1e-8 on
(z, x, v, energies), events at shot start, burnout and muzzle exit. The curve is resampled on the
same uniform travel grid as GRT Traditional (2000 points) so that both engines' results compare
point by point.

## Validation plan

1. Unit tests: closed-form limits (constant-pressure ballistic case, isentropic expansion after
   burnout), energy conservation to the integrator's tolerance with every loss switched off.
2. The chronograph corpus (`tools/validation/chronograph.ts`) for both engines, uncalibrated: mean
   error, RMS and 90th percentile, per regime (subsonic rifle, pistol, revolver, supersonic rifle).
3. Published pressure data, when available (validation.md, Pressure).
4. Each switchable term on and off, to show what it contributes.

The engine is shown to users only when 2 and 3 show it no worse than GRT Traditional; until then it
runs in tools and tests only.

## Open questions

- Which pressure GRT's "Pmax" corresponds to (mean, base or breech): GRT Traditional has no gradient,
  so its pressure is closest to a space mean. Comparing the engines' peaks needs the same pressure.
- Whether GRT's Ba, fitted by GRT users and Gordon against GRT's own model, transfers to a model with
  different gas dynamics, or needs a systematic rescaling: the validation will tell.
- Primer contribution (GRT's primer energy 75 J appears only in the jump time).
