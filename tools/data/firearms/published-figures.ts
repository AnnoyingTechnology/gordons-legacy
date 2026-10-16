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
 * The figures a record may keep the maker's words for. The set is closed on purpose: `check-corpus.ts`
 * checks a record's SI values against these keys, and an extractor that invented its own — `drall` for a
 * twist, `weightAsPrinted` for a weight — filed the maker's string where nothing would ever read it, so
 * the figure went out unchecked. Both happened on 2026-10-16.
 *
 * The string itself is the page's, **verbatim**: the characters the maker printed, nothing added and
 * nothing reformatted. It is the only evidence that the SI value beside it was read correctly, and a
 * string we have touched cannot contradict us. Where a spelling is hard to read — `3.250 g` for three
 * thousand grams, `10"` for one turn in ten inches, `16 1/2"` — the checker learns to read it; the
 * record does not learn to rewrite it.
 *
 * Some pages print no single string for a figure, and then a string has to be assembled. That is
 * allowed only where the page's own parts are kept whole, and the module that does it says so in its
 * header: a figure whose unit the page holds in another field or another column (`508` under a
 * `metricUnit` of `mm`, Kel-Tec's two columns written `16.1" | 409mm`), or several of the page's strings
 * listed together (`massVaries`). Nothing is converted, rounded, reworded or re-spelled on the way in.
 * `quoted-figures.ts` finds every string that is not on its page, so an assembled one has to be
 * explained rather than noticed by a user.
 */
export interface PublishedStrings {
  /** The barrel length as printed: `20.00" | 50.8 cm`, `610 mm (Magnum)`, `16 1/2"`. */
  barrelLength?: string | undefined;
  /** The weight as printed: `6 lbs 7 oz`, `ca. 3,1 kg`, `830 gr`, `9999 lbs`. */
  weight?: string | undefined;
  /** The twist as printed: `1:9,5"`, `10"`, `1:203 mm`, `1:10” twist`. */
  twist?: string | undefined;
  /** The cartridge in the maker's own words, where the record carries a conventional name: `9MM`. */
  caliber?: string | undefined;
  /** The other masses a page prints for one model, where the record takes one of them (sako.ts). */
  massVaries?: string | undefined;
  /**
   * The maker's own number for the configuration the figures belong to (`SRS-M2-16-308`): an
   * identifier and not a figure, so nothing checks it against a value. It is kept because a page that
   * lists several configurations is only citable with it — a reader has to find the same line again.
   */
  partNumber?: string | undefined;
}

/**
 * The maker's own strings for `FirearmSource.published`, spaces collapsed and empty ones left out, so
 * that a record never claims a figure its page did not carry.
 */
export function publishedFigures(figures: PublishedStrings): Record<string, string> {
  const entries = Object.entries(figures)
    .map(([key, value]) => [key, (value ?? '').replace(/\s+/g, ' ').trim()] as const)
    .filter(([, value]) => value !== '');
  return Object.fromEntries(entries);
}
