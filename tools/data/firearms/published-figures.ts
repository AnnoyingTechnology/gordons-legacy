/**
 * What a maker printed, kept beside the SI value a record carries (issue #30, docs/firearm-data.md).
 *
 * Shared by every extractor, because the gate is the same for all of them: a figure nobody can
 * interpret is worse than no figure. A mass means nothing without knowing what it includes, and an SI
 * value alone hides a rounding or a unit mix-up that only the maker's own string would show.
 */

/**
 * What a published mass includes, for `FirearmSource.massBasis`. `unstated` is the honest answer when a
 * page gives one weight and does not say what it covers: such a figure is a starting point for the user
 * to check, not the mass of the gun as it recoils.
 */
export type MassBasis = 'without-magazine' | 'empty-magazine' | 'loaded' | 'unstated';

/**
 * The maker's own strings for `FirearmSource.published`, spaces collapsed and empty ones left out, so
 * that a record never claims a figure its page did not carry.
 *
 * The usual keys are `barrelLength`, `weight` and `twist`; a maker that prints something else the record
 * uses may add its own.
 */
export function publishedFigures(figures: Record<string, string | number | undefined>): Record<string, string> {
  const entries = Object.entries(figures)
    .map(([key, value]) => [key, typeof value === 'number' ? String(value) : (value ?? '').replace(/\s+/g, ' ').trim()] as const)
    .filter(([, value]) => value !== '');
  return Object.fromEntries(entries);
}
