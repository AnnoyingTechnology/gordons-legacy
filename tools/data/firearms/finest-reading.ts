/**
 * Which of a page's renderings of one measure to believe (issue #30, docs/firearm-data.md).
 *
 * A catalogue that prints a measure twice rounds the two differently: Ruger's `18.50"` barrel is
 * 469.9 mm and the span beside it says `46.9 cm`; Kel-Tec's `16.1" | 409mm`; Sabatti's `61 cm / 24"`.
 * Taking the metric figure by habit would throw away a digit the maker published, and taking the
 * imperial one would throw away a digit elsewhere. The rule is the same for every maker: the rendering
 * printed to the finer step is the more informative one, whichever unit it is in.
 *
 * How a maker writes a number — a comma decimal, a dot for thousands, two figures in one cell — is the
 * maker's own business and stays in their module. What is shared is only the comparison.
 */

/**
 * A figure as its maker printed it: the value in SI, and what its last printed digit is worth, also in
 * SI. `24"` has a step of one inch, `51.44 cm` a step of a tenth of a millimetre.
 */
export interface Reading {
  /** SI: metres or kilograms. */
  value: number;
  /** SI value of the last published digit: 0.01 inch is 2.54e-4 m, 1 mm is 1e-3 m. */
  step: number;
}

/** Of several readings of one measure, the one printed to the finest step; nothing, where none is. */
export function finest(readings: readonly (Reading | undefined)[]): Reading | undefined {
  const known = readings.filter((reading): reading is Reading => reading !== undefined);
  return known.length === 0 ? undefined : known.reduce((best, reading) => (reading.step < best.step ? reading : best));
}
