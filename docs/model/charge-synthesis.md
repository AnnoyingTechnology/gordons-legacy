# Powder search and tolerance synthesis

GRT's "parametric powder search & generic tolerance synthesis" (manual 2021-09-29, pp. 53–55), as the
app reproduces it. Safety-critical: these tools turn powder models into charges.

## Powder factors and search

GRT ranks powders by factors of its own (manual p. 46), reproduced in `analysis/powder-factors.ts` and
checked against the values GRT stored in all 12 community powder files:

- brisance Br = √(2 (k − 1)) · Ba · Qex / 10⁴ (Qex in kJ/kg, Ba in GRT's units);
- progressivity Bp = Br · φ(z1), φ(z) = (1 + a0 z)^0.3571, the progressive branch of the form function;
- combined Brp = √((Br² + Bp²) / 2), which GRT recommends for similarity searches.

The component picker lists powders by Brp (GRT's relative burning-rate table) and can keep those within
±x % of the load's powder (the parametric search). A powder at the same level is not a substitute.

## Tolerance synthesis

`analysis/charge-synthesis.ts`. For each powder, the load (case, bullet, barrel) with that powder is
simulated across the case-fill window, and each charge is checked against every filter: peak within a
share of the lowest maximum (CIP, SAAMI or the load's), fill window, optional velocity window.

- 41 charges are sampled across the fill window; the full predicate is evaluated at each.
- Each run of passing samples is a match; its edges are refined by bisection only between a failing and a
  passing sample. Nothing assumes that pressure or velocity rise with the charge.
- The ends are rounded inward to the charge resolution shown (0.001 g or 0.01 gr), simulated again and
  kept only if they still pass. Charges between two ends were sampled, not all checked.
- The fill is GRT's (m / ρ_bulk) / V_b; for another powder it scales by the bulk densities (same V_b).
- Defaults are arbitrary filters, not validated bounds: peak 35–85 % of the lowest maximum (GRT highlights
  from −15 %), fill 60–100 %.

The panel shows each end with its own review and engine warnings, the powder's origin, author, date, lot
and fit status; a run is hidden as soon as the load, the filters, the powders or the charge unit change.
"Inspect simulation" opens a candidate load at a match's lowest charge with nothing measured (no
chronograph series, groups, pictures or ladder) and a note of its derivation.

Reviewed by Codex (`gpt-6.1-sol`, xhigh) on 2026-10-14: the first version (monotonic bisection on the
end points, single review of the highest charge, stale results, measurements copied to the candidate,
de-duplication that could drop a lower maximum, unchecked criteria, rounded charges re-simulated) was
blocked; this design answers each point. A second pass found three remaining blockers (runs not stale
when the powders change, end findings hidden behind a badge, incomplete fits shown as fitted), fixed; the
third pass found no release blocker.
