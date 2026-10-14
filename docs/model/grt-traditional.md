# GRT Traditional: model specification

The "GRT Traditional" engine reproduces Gordon's Reloading Tool `2021.2030-NIGHTLY`. This page is its
specification, in mathematical form; the engine (`packages/engine/src/grt-traditional/`) is written
from it. How each part was recovered and checked is in [grt-structure.md](grt-structure.md).

Status marks: **confirmed** parts reproduce GRT to machine precision under emulation; **partial**
parts are understood but not yet confirmed in every branch; **open** parts are not yet recovered.

The engine built from this page reproduces GRT's peak pressure, muzzle velocity and barrel time to within
10⁻¹⁴ (the last bits of a double) on every fixture load (`packages/engine/test/grt-parity.test.ts`) and on
all 67 of the maintainer's loads, revolvers with cylinder gaps included.

Notation: SI units unless stated. GRT mixes units in a few places (bar, kJ/kg, cm³); where it does,
the formula says so, because reproducing GRT means reproducing its conversions.

## Inputs

| Symbol | Meaning | Load field |
|---|---|---|
| m_p | projectile mass | `projectile.mass` |
| m_c | charge mass | `charge.mass` |
| s | Sebert factor | `cartridge.sebertFactor` |
| A | effective bore area | `cartridge.effectiveBoreArea` |
| D_g | groove diameter | `cartridge.grooveDiameter` |
| D_p | projectile diameter | `projectile.diameter` |
| L_p | projectile length | `projectile.length` |
| V_case | case capacity | `cartridge.caseCapacity` |
| x_e | barrel length | `barrel.length` |
| L_case | case length | `cartridge.caseLength` |
| d | seating depth | derived: L_case + L_p − overall length |
| L_tw | twist length | `barrel.twistLength` |
| p_s | initial pressure, in **bar** | `projectile.shotStartPressure` / 10⁵ |
| f_r | bore resistance adjustment, in **bar** | `projectile.boreResistanceAdjustment` / 10⁵ |
| Q | heat of explosion, in **kJ/kg** | `propellant.heatOfExplosion` / 10³ |
| k | ratio of specific heats | `propellant.heatCapacityRatio` |
| ρ_g | grain density | `propellant.grainDensity` |
| Ba, a0, a1, z1, z2 | burn model | `propellant.burnModel` |
| T | powder temperature, in °C | `charge.temperature` − 273.15 |

Constants: p₀ = 98 066.5 Pa (one technical atmosphere).

## Configuration constants (confirmed)

GRT's defaults, which the engine uses: α₁ = 0.9, α_B = 0.8 (vivacity smoothing), F_Ba = 3.29635·10⁻⁴,
G = 1.511101935815519 (internal friction), rotation energy and air drag enabled, air mass and primer
mass disabled.

## Setup

### Form function setup (confirmed)

z1 is capped at 0.99. The degressive branch's scale z_b is not read from the file: GRT starts from
z_b = 0 and adds 0.0001 until φ_d(z1) ≥ φ_p(z1), so that the form function is continuous at z1 to
within 0.0001 (z_b stays 0 when z1 ≤ 0). The repeated additions, with their rounding, are part of the
result.

When z2 is not in (z1, 0.99] (z1 already capped), GRT replaces it (confirmed by two variant fixtures):

z2 = z1 + min(0.99, max(0, 0.792 (1 − z1) − z1^0.8 / 10)),

rounded to 4 decimals: GRT formats it as `#.0000` and reads the text back. This runs at every
simulation, after z_b, and doesn't change the file.

### Vivacity at the powder temperature (confirmed)

With ΔT = T − 21 and the coefficients tcc, tch (when both are 0: tcc = −0.0214, tch = 0.0381):

- ΔT > 0: Ba₀ = Ba · (1 + tch · ΔT / 39)
- ΔT < 0: Ba₀ = Ba · (1 + tcc · |ΔT| / 41)
- otherwise Ba₀ = Ba.

### Geometry (confirmed for flat, hollow and boat-tail bases)

Working in cm³ and mm as GRT does, with r = D_p / 2 in mm and d in mm:

- intrusion I = π r² d (mm³);
- hollow base (length h, end diameters a and b, in mm): I −= (π h / 3)(a²/4 + ab/4 + b²/4);
- boat-tail: I −= π r² h − (π h / 3)(a²/4 + ab/4 + b²/4) when the frustum volume (π h / 3)(…) is
  positive and smaller than the cylinder π r² h, else nothing (so a boat-tail without diameters counts
  as a flat base; open: tails longer than the seating depth);
- V_b = 0.9975 · (V_case[cm³] − I / 1000) / 10⁶ (m³).

Then:

- V₀ = V_b − m_c / ρ_g, the free volume at shot start;
- x_eff = x_e − (L_case − d), the projectile's travel to the muzzle;
- ξ_E = x_eff · A / V₀, the relative expansion at the muzzle;
- m_f = A · f_r · 0.10197162129779 (bore resistance as an added mass; 0 without adjustment);
- m = m_p + s · m_c + m_f, the effective mass;
- twist ratio τ = D_g / L_tw.

## Integration

ξ runs from 0 in steps of Δξ = max(0.001, ξ_E / 2000). At each ξ, with ξ_c = min(ξ, ξ_E), the
projectile is at x = x_eff · ξ_c / ξ_E, and the relative step is Δ = (ξ_c − ξ_c,previous) / ξ_E.
Phase A runs while ξ ≤ ξ_E and z ≤ 1; phase B continues after burnout until ξ > ξ_E.

State carried between steps: z, the smoothed vivacities B₁ and B, their running sum S and count n,
the smoothed pressure p̃, the velocity v, the position x, and the cumulative energies.
Initially everything is 0, except B₁ = B = Ba₀.

### Phase A: while the powder burns (confirmed)

1. Form function, from the previous step's z:
   - z ≤ z1: φ = (1 + a0 z)^0.3571, or 1 if a0 = 0;
   - z > z1: φ = max(φ_d(z2), φ_d(z)) with φ_d(u) = z_b · (|a0| (1 − u))^c, or z_b (1 − u)^c if a0 = 0,
     or 1 if a0 = 0 and z1 = 1, and c = a1 if 0.1 ≤ a1 ≤ 0.9, else 0.3051. Past z2, φ stays at φ_d(z2).
2. Vivacity: B₁ ← α₁ · Ba₀ φ + (1 − α₁) · B₁; S ← S + B₁; n ← n + 1;
   B_new = (1 + B₁ · F_Ba · p_s) · S / n (the factor is 1 for shotshells);
   B ← α_B · B_new + (1 − α_B) · B.
3. θ = 1 − (1 + ξ_c)^(−(k − 1)/2).
4. v_θ = θ · 2 · Q · 1000 · m_c · B / (A p₀).
5. z = v_θ · m · B / (A p₀).
6. p_abs = 2 (k − 1) · m · (B m_c Q)² / (p₀² A² V₀); p_m = 10 · p_abs · θ (1 − θ) / (1 + ξ_c) (bar).
7. p = p_m + p_s (1 − z) − p_leak (bar; see Gas leaks).
8. p̃ ← 0.27 p + 0.73 p̃ (p̃ = p at the first step).
9. Energies of the step: E_rot = Δ · τ · v_θ² · m_p · π² / 4;
   E_U = Δ · v_θ² · m_f / 2 (engraving friction); internal friction
   E_I = δ · Δ · x_eff · (0.6 π D_g L_p) · G · 10⁶ and air drag E_air = δ · Δ · A · v_θ² · k, where δ is the
   open fraction of the bore through gas leaks (0 without leaks). Cumulative: E_friction ← (E_U + E_I) +
   E_friction; E_air,total ← E_air + E_air,total.
10. a = (p̃ · 10⁵ · A − E_friction − E_air − E_rot) / m (E_rot of this step only).
11. v ← √(v² + 2 a (x − x_previous)).

The point records x, p̃, v, z, the projectile energy m_p v² / 2, and the propellant energy z · Q · m_c ·
1000.

### Gas leaks (confirmed for every type)

Each opening of the gun is placed on the projectile's travel: it starts at s = position − (L_case − d)
and is uncovered over its width w. Its area, with r = D_g / 2, by GRT's type code:

- 0, cylinder gap: 2 π r w;
- 1, round hole: π (w/2)², or the ellipse π (w/2)(h/2) when w and h are both above 0;
- 2, square hole: w h (GRT reports an error when h ≤ 0);
- 3, slot cut into the bore to a depth h: the uncovered arc times the width, w · 2 r · acos(1 − h/r),
  when 0 < h ≤ r; else 0 and an error;
- other types: no area (Gordon's Legacy refuses them, and the error cases above).

At each step, with Δt the time step (the last increase of T, in s) and p the step's pressure (bar):

1. Nothing leaks before the first time step (Δt ≤ 0) or without openings.
2. Open area: A_o = min(A, Σ clamp((x − s)/w, 0, 1) · area) over the openings with x ≥ s > 0.
3. If A_o = 0, the loss is reset to 0. Otherwise the loss is smoothed:
   p_leak ← min(p, 0.85 p_leak + 0.15 min(p, √(A_o / A) · p)).
4. If p_leak > 0: δ = clamp(A_o / A, 0, 1), and the charge loses
   Δ · (p_leak / p) · (1 − z) · s · m_c (never below 0). V₀, m and everything derived from m_c follow.

In phase A the leak is evaluated before the step's energies, in phase B after them (phase B's energies
use the previous step's δ). In phase B, z is the last value of phase A, which may slightly exceed 1.

### End of burning (partial)

θ_B is the last θ of phase A. The result notes whether the peak pressure was reached before burnout:
θ_B ≥ (k − 1)/(2k).

### Phase B: after burnout (confirmed)

1. σ = 1 − 1 / ((1 + ξ_c)^(k − 1) · (1 − θ_B)).
2. v_σ = √(2 σ Q · 1000 · m_c / m).
3. p = (Q · 1000 · m_c − m v_σ² / 2) · (k − 1) / ((V₀ + A x) · 10⁵) − p_leak (bar).
4. p̃ ← 0.18 p + 0.82 p̃.
5. Energies as in phase A with v_σ in place of v_θ; a and v as in phase A, except that while gas leaks
   (δ > 0) the acceleration is smoothed: a ← 0.95 a_previous + 0.05 a.

The point records z = 1.

### Time (confirmed)

Time T (ms) starts at 0 and is integrated as points are added. For each new point n ≥ 2 whose
predecessor has moved (x_{n−1} > 0): u = 1/v_{n−1}, d₁ = |u − u_prev|; on every second such point,
with d₂ = |d₁ − d₁,prev|:

T ← T + (1000 u + |d₂ − d₁| · 1000 · (1/6)) · |x_n − x_{n−2}|

and the point in between gets t_{n−1} = (T + t_{n−2}) / 2. Every point gets t_n = T when added; the
change of T at the last pair step, Δt = T − T_previous, is the time step used by gas leaks. The barrel
time is the last point's T.

### Jump to the lands (confirmed)

Only when the load sets a jump j > 0 (GRT: `gjumpUnlock` with `gjump`). GRT doesn't move the projectile
over the jump; it enlarges the chamber as if the projectile were seated less deep by the distance
covered so far, which grows in proportion to time.

Setup: the time to cross the jump under the primer's pressure alone, at constant acceleration, with
E_pr = 75.09815610370678 J (`CORE_PRIMER_ENERGY_FACTOR`) and V_b the initial chamber volume:

- F = A · (E_pr / V_b), the primer's force;
- t_j = (√j · √2 / √(F / m_p)) · 1000 ms;
- the rate r = j / t_j (m per ms).

During phase A only, after each point is added and the time T updated: with c = T · r, while c ≤ j,
recompute V_b with the geometry above at seating depth d − c, then V₀ and ξ_E = x_eff · A / V₀. The next
step uses them: the travel x = x_eff · ξ_c / ξ_E, the relative step, the pressure and the end of the loop
(ξ > ξ_E) all read the current ξ_E; Δξ keeps its initial value. Once c > j, V_b stays at its last value.

Consequences: a jump shorter than the distance covered by the first time step has no effect (0.1 mm on
the .327 Federal fixture), and the chamber ends a little smaller than with the full jump, since the
last update falls before c reaches j.

## Results (partial)

- Peak pressure: the largest p̃; muzzle velocity and pressure: the last point's v and p̃.
- Burnout: the index of the last phase A point; z at the muzzle: min(1, z) at burnout.
- Validity: the result is invalid when the peak pressure is below 2 p_s, the Sebert factor is negative,
  or the propellant is invalid.

## Inputs outside the model (Gordon's Legacy)

GRT simulated almost any input and showed plausible numbers even where its equations are undefined.
Gordon's Legacy refuses such loads with a typed problem instead of numbers (`validation.ts`):

- not finite: any input; not above zero: masses, diameters, lengths, case capacity, bore area, heat of
  explosion, grain density, vivacity, z1; negative: Sebert factor, initial pressure, twist, jump;
- k ≤ 1; a form function that isn't defined (1 + a0·z1 ≤ 0, or a z_b above 100 needed, which real
  powders, at 1.07 to 1.86, are far from); a vivacity at the powder's temperature of 0 or less;
- a free volume V₀ of 0 or less (the charge doesn't fit), or x_eff of 0 or less (barrel too short);
- gas leaks of negative or non-integer type, of zero width, or with a negative height.

As a safety net, a result with any non-finite value, or a solver that runs past 100 000 steps (valid
inputs need about 2000), is refused too. No load file seen so far is refused.

## Ladder (read)

A ladder of n charges is the load's charge m_c and n − 1 reduced charges, each one step less:
m_c − Δm, m_c − Δm − Δm, … (the step subtracted repeatedly). Each is simulated on its own, as a
separate load (`ladderChargeMasses` in the formats package). GRT can also hold a custom list of steps,
which no load file seen so far carries.

## Not yet covered

Air drag beyond the leak term (`fn_gDrag`), recoil,
OBT, the 10 %-of-peak times, and custom ladder steps.
