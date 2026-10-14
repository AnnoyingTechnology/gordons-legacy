# Muzzle blast sound level

An estimate of the peak sound pressure level of the muzzle blast beside an unsuppressed gun (issue #6),
shown with the results and in the library. Code: `packages/app/src/analysis/muzzle-blast.ts`; source
energy: `muzzleGasEnergy` in `packages/engine/src/grt-traditional/results.ts`.

## Model

K. S. Fansler, "Description of muzzle blast by modified ideal scaling models", *Shock and Vibration*
5 (1998), point-source model 2pb, fitted by least squares to blast waves measured around 7.62 mm
barrels (.300 Magnum, a shortened .300 Magnum, a shortened carbine with 2400 powder) from 15 to 400
calibers, plus 30 mm and 105 mm cannon:

- λ = (E / p₀)^⅓, the point-source length, with E the energy available to the blast;
- δ = L a₀ / (λ v₀), the blow-down parameter: the barrel's emptying time L / v₀ over the blast's λ / a₀;
- β(θ) = μ cos θ + √(1 − μ² sin² θ), μ = 0.78: the blast is stronger ahead of the muzzle (θ = 0) than
  behind it;
- λ′ = λ β (1 + 0.592 / δ);
- P / p₀ = 0.11 (λ′ / r) + 0.0061 (λ′ / r)², the peak overpressure at distance r.

The fit's RMS error on ln P is 0.201: 1.75 dB RMS within its data (about ±3.4 dB for 95 % coverage if
the residuals are Gaussian), before any error in E. Level, unweighted peak: 20 log₁₀(P / 20 µPa), with P
the overpressure. p₀ is 101,325 Pa; a₀ the speed of sound in air, taken at the powder's temperature
(the load has no air temperature). L is the barrel length from the breech face, Fansler's "effective
length of the barrel".

The estimate is flagged as an extrapolation, with unknown uncertainty, outside the five 7.62 mm firings
of the fit: λ/D from 39.8 to 63.8, δ from 0.437 to 0.712, distances from 15 calibers and below 400 (the
400-caliber gauges were left out of the peak fit). On the maintainer's 63 loads, 62 are outside:
pistols, revolvers and short-barrelled 300 BLK.

Fansler's E is the propellant's energy less the work on the projectile and the losses to the barrel,
the gas's kinetic energy included. In GRT's model, which has no covolume, that is approximately
E = p_m V / (k − 1) + ½ s m_c v₀² at the muzzle, with V = A x_eff + V_b − m_c / ρ_g (the solver's gas
volume) and p_m GRT's smoothed muzzle pressure. The kinetic term is GRT's effective-mass share s, not an
integral over the gas's velocity profile (½ ∫u² dm; s = 1/3 for a uniform gas with a linear velocity
profile). Unburnt powder's chemical energy is left out: whether it adds to the peak depends on how fast
it burns outside the muzzle.

## Checks

| Case | Model | Measured |
|---|---|---|
| Fansler's carbine shot c13p6 (λ/D 39.8, δ 0.437), 1 m, 90° | 168.1 dB | (in his fit's data; checks the code, not the accuracy) |
| A .308 load of the local corpus (not committed): 168 gr, 20″, 761 m/s, 0.6 m left of the muzzle | 174.6 dB | 176 dB: Remington 700 .308, 168 gr, 2,670 ft/s (CDC/NIOSH, "The reduction of gunshot noise and auditory risk through the use of firearm suppressors and low-velocity ammunition", PMC8588962, tables 1–2) |
| A .223 load of the local corpus: 50 gr, 16″, 946 m/s, 0.6 m left (outside the data) | 173.9 dB | 176 dB: Remington 700 .223, 55 gr, 3,240 ft/s (same study) |

Different rifles, ammunition and rated velocities: the checks show a plausible magnitude, not a
validation of the prediction error.

Reviewed by Codex (`gpt-6.1-sol`, xhigh) on 2026-10-14: formula and coefficients confirmed; the gas
volume made consistent with the solver, the uncertainty restated (1.75 dB RMS, not ±2 dB), handguns
flagged as unvalidated extrapolation, and the label made explicit (bare muzzle, free field).

## Limits

- Fitted on rifle barrels: pistols and revolvers (4–5″, larger bores, 90–110 calibers at 1 m) are an
  extrapolation in barrel length and bore. A revolver's cylinder gap adds its own blast, not modelled.
- Not included: the bullet's ballistic crack (supersonic), the action, reflections from the ground or
  walls, suppressors and muzzle devices (brakes raise the level beside and behind the gun).
- Unburnt powder burning outside the muzzle (flash) adds energy that E leaves out.
