# Research engine (M7): design

Status: **design, reviewed** (physics review by Codex, 2026-10-14, applied). Nothing here is implemented or shown to users yet. Per the plan, the
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

Revised after a physics review (Codex, 2026-10-14; see PROGRESS.md): the gradient closure now
includes the bore resistance, rotation enters through an effective mass, and the ignition is explicit.

State: time t, burnt fraction z, projectile travel x, projectile velocity v, resistance work W_r.

1. **Burning (Vieille's law with GRT's vivacity).** For a constant vivacity B, GRT's closed form
   (v_θ = 2 Q m_c B θ / (A p₀), z = m B v_θ / (A p₀), and the momentum balance m v_θ dv_θ/dx = A p_θ)
   gives exactly dz/dt = B p / p₀, with p₀ = 98 066.5 Pa: Ba is a vivacity in s⁻¹ per technical
   atmosphere, as GRT's own closed-vessel definition of vivacity also says. GRT varies and averages B,
   so this is a justified reading, not an exact equivalent. The engine uses
   dz/dt = Ba(T) · φ(z) · F_ps · p̄ / p₀, with the space-mean pressure p̄ (the standard lumped choice),
   GRT's initial-pressure factor F_ps = 1 + Ba · F_Ba · p_s (p_s in bar; a switch, on by default:
   removing it would slow the burn and lower the peak), and without GRT's smoothing of B. Burning stops
   at z = 1. Vieille's law with exponent 1 is itself a model choice; erosive burning and grain fracture
   are not represented.

2. **Effective mass.** With the twist fixed, the projectile's rotation adds inertia:
   M = m_p + I (2π / L_tw)², with I = m_p r² / 2 for a solid cylinder (open: better estimates for
   jacketed bullets). Rotation is then inside M and is not subtracted again.

3. **Motion and gradient (Lagrange, with resistance).** M dv/dt = A (p_b − p_f), dx/dt = v, with the
   resistance pressure p_f(x). The Lagrange closure with resistance (C&J eqs. 3.70–3.71; AEP-4367 ch. 1):
   p̄ = p_b + m_c (dv/dt) / (3A) and p_r = p_b + m_c (dv/dt) / (2A), hence
   p_b = (p̄ + (m_c / 3M) p_f) / (1 + m_c / 3M) and p_r = p_b + (m_c / 2M)(p_b − p_f).
   While the projectile is restrained (before shot start), p_b = p_r = p̄.

4. **Energy (Résal with Noble-Abel).** Free volume V = V_b + A x − m_c (1 − z) / ρ_g − η z m_c, with V_b
   the chamber behind the seated projectile and ρ_g the grain density. Then
   p̄ V = (k − 1) [ z m_c Q + E_ign − ½ (M + m_c/3) v² − W_r − E_h ], dW_r/dt = A p_f v.
   The m_c v²/6 term is the kinetic energy of gas and unburnt grains moving with a velocity rising
   linearly from breech to base (the Lagrange assumption); it is consistent with, not a double count of,
   the gradient in 3, which expresses the momentum balance.

5. **Ignition.** At t = 0 the primer's gas holds the energy E_ign in the free volume, which starts the
   burn (with z = 0 and no igniter, p̄ = ż = 0 and nothing happens). First version: GRT's primer energy,
   75.098 J (the only place GRT uses it is the jump time), as internal energy of a gas with the powder
   gas's k; the primer gas's mass and covolume are neglected (open: include them).

6. **Shot start and resistance.** The projectile stays at x = 0 until A p_b exceeds A p_s (the load's
   initial pressure). Then p_f(x) = p_s while the bearing surface engraves (over a travel taken from
   the projectile's length), then a friction pressure, by default a fixed fraction of p_s, to be set
   from published friction data, not fitted to velocity.

7. **Heat loss.** Not in the first version (E_h = 0). A convective model, dE_h/dt = h A_w (T_g − T_w),
   needs the gas temperature, which Q and k alone don't give (it needs c_v or the flame temperature).
   A loss coefficient must never be fitted on velocity alone: losses lower the predicted pressure, so
   they are fitted and checked against pressure and velocity together.

8. **Leaks, jump to the lands.** Not in the first version; this engine refuses such loads.

**Reported pressure.** CIP and SAAMI transducers sit at a cartridge-specific place (near the case
mouth or shoulder), not at the breech and not at a space mean. The engine reports the breech pressure
p_r as its labelled chamber-pressure estimate, and keeps p̄, p_b and p_r on the curve. GRT's Pmax is an
empirical single pressure (max p̃); the comparison between engines states which pressure it uses.

Integration: the Dormand-Prince 5(4) integrator (`packages/engine/src/numerics/ode.ts`), relative
tolerance 1e-8, with events at shot start, burnout and muzzle exit. The curve is resampled on GRT
Traditional's uniform travel grid (2000 points) so that the engines compare point by point.

## Validation plan

1. Unit tests: closed-form limits and energy conservation to the integrator's tolerance. Done
   (`packages/engine/test/research-physics.test.ts`, 2026-10-15): in a closed vessel the model reaches
   the Noble-Abel pressure *f*·Δ / (1 − η·Δ) exactly, with *f* = (k − 1)·Q and Δ = m_c/V_b; the free
   volume holds the unburnt solid before the burn and the gas covolume after, in proportion to z; and
   the pressure gradient obeys the published Lagrange ratios, p̄ = p_base (1 + m_c/3M) and
   p_breech = p_base (1 + m_c/2M), with the bore resistance entering at the base. Checked by mutation:
   a covolume applied to the whole charge instead of the burnt share, or a 4 in place of the 3 of the
   mean-pressure ratio, fails them.
2. The chronograph corpus (`tools/validation/chronograph.ts`) for both engines, uncalibrated: mean
   error, RMS and 90th percentile, per regime (subsonic rifle, pistol, revolver, supersonic rifle).
3. Published pressure data, when available (validation.md, Pressure). Velocity agreement alone never
   qualifies the engine: a model can match velocities with pressures that are too low.
4. Each switchable term on and off, to show what it contributes.

The engine is shown to users only when 2 and 3 show it no worse than GRT Traditional; until then it
runs in tools and tests only.

## First results (R1, 2026-10-14)

Implemented as `packages/engine/src/research/` (tools and tests only). With GRT's powder data used
as is, R1 burns much faster than GRT Traditional: on the .327 Federal fixture 3258 bar and 446 m/s
against GRT's 1962 bar and 411 m/s; on the hottest 300 BLK fixture 6114 bar against 3445 bar.
Against the chronograph corpus (`tools/validation/chronograph.ts --engine research-1`):

| Engine | Charges | Mean error | RMS | 90th percentile |
|---|---|---|---|---|
| GRT Traditional | 51 | +6.8 % | 13.3 % | 26.9 % |
| Research R1 | 47 | +12.2 % | 15.8 % | 22.2 % |

(R1 refuses the revolver loads with gas leaks.) So GRT's Ba doesn't transfer to standard gas dynamics:
GRT's powder data were fitted under GRT's own devices, which slow the effective burn and damp the
peak: the vivacity is averaged since ignition (B₁ smoothed, then the running mean S/n) and the
pressure is smoothed (0.27 / 0.18). R1 is not a candidate for users in this form.

**Matching GRT's velocity.** Scaling Ba until R1's muzzle velocity equals GRT Traditional's, load by
load (the maintainer's 63 loads, R1 refusing the revolvers): no single factor fits. The scale is
about 0.71–0.75 for the 9 mm loads, 0.82–0.85 for supersonic 300 BLK, 0.86–0.95 for subsonic 300 BLK,
and three subsonic loads with a fast pistol powder (A1) can't be matched within a scale of 1.5.

At the matched velocity, R1's peak pressure is 0.97–1.7 times GRT's (up to 2.1 for the three
unmatched loads): close for pistols, highest for subsonic rifle loads with heavy bullets. GRT smooths
its pressure (p̃ ← 0.27 p + 0.73 p̃ while burning), which lowers peaks; R1 has no such smoothing.
**If R1's gas dynamics are the more faithful ones, GRT under-predicts peak pressure for low-pressure
rifle loads, the unsafe direction.** Neither engine is validated on pressure, so this is a discrepancy
to settle with measured pressures, not a conclusion; it is reported to the maintainer.

**What accounts for the difference (same day).** Each of GRT's devices switched into R1, over the
maintainer's 58 loads R1 simulates (medians of R1 / GRT):

| R1 variant | Muzzle velocity | Peak pressure |
|---|---|---|
| As designed (Noble-Abel covolume) | 1.080 | 1.75 |
| With GRT's running mean of the vivacity | 1.078 | 1.75 |
| Without covolume (GRT's ideal-gas volume) | 0.975 | 1.12 |

The vivacity averaging hardly matters; the covolume accounts for most of the gap. GRT ignores the
covolume (grt-observations.md), so its users fitted Ba to an ideal-gas model; at small-arms loading
densities the covolume of the burnt charge (about 1 cm³/g) is a large part of the free volume, and the
same Ba then burns far too fast in a Noble-Abel model. The remaining 12 % of peak pressure comes from
GRT's other choices (its closed-form expansion, its pressure smoothing, the Sebert mass).

Against the chronograph corpus, on the 47 charges both engines simulate:

| Engine | Mean error | RMS | 90th percentile |
|---|---|---|---|
| GRT Traditional | +8.0 % | 13.5 % | 26.9 % |
| R1 without covolume | +4.1 % | 11.1 % | 16.6 % |

R1 is now set **without covolume by default**, to stay consistent with the powder data it uses; the
covolume returns once powders are fitted for it. On velocity it does better than GRT Traditional, most
of all on the subsonic loads; its peaks are a median 12 % above GRT's. Which peaks are closer to reality
is unknown until measured pressures are available, so R1 stays out of the application.

Next steps, in order:

1. Pressure data (validation.md): with it, decide between the engines' peaks.
2. Powder data fitted for R1 with its covolume (closed-vessel or published charge-velocity-pressure
   data), so that the physics and the data agree.
3. The engraving and friction parameters (provisional) against published data.

## Open questions

- Which pressure GRT's "Pmax" corresponds to (mean, base or breech): GRT Traditional has no gradient,
  so its pressure is closest to a space mean. Comparing the engines' peaks needs the same pressure.
- Whether GRT's Ba, fitted by GRT users and Gordon against GRT's own model, transfers to a model with
  different gas dynamics, or needs a systematic rescaling: the validation will tell.
- Primer contribution (GRT's primer energy 75 J appears only in the jump time).
