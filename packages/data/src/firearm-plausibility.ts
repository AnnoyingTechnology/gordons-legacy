import type { Firearm } from '@gordons-legacy/formats';

/**
 * The figures a published gun can have at all (issue #30, docs/firearm-data.md). The load format accepts
 * any positive length and mass, as it must for a gun a user describes; a catalogue read off a maker's
 * site is held to what a gun can be, because a unit mix-up or a page's placeholder (Savage prints
 * `9999 lbs` where it holds no weight) would otherwise become the barrel or the mass the engine uses.
 *
 * The extractors (tools/data/firearms/) apply these ranges as they read a page, check-corpus.ts applies
 * them to a crawl, and `validateRepository` applies them to the published files, so that the data
 * repository's CI refuses a figure no gun has, whoever wrote the file.
 */

/** The shortest and longest a barrel can be, m: a 1.9" derringer to a 36" long-range rifle, with room. */
export const BARREL_LENGTH_RANGE = { shortest: 0.04, longest: 1.0 };

/** The shortest and longest turn of rifling, m: a 1:6" pistol barrel to a 1:40" muzzle-loader, with room. */
export const TWIST_LENGTH_RANGE = { shortest: 0.1, longest: 1.2 };

/**
 * The lightest and the heaviest a gun can be, kg. A pocket pistol is about 250 g and a .50 BMG rifle
 * about 14 kg, so anything outside this is not a gun's weight at all: a shipping weight, a figure in
 * the wrong unit, or a page's own placeholder (`9999 lbs` converts to a 4,535 kg rifle).
 */
export const GUN_MASS_RANGE = { lightest: 0.1, heaviest: 25 };

/** What in a gun's barrel length, twist and mass no gun can have, in words; empty when nothing is. */
export function implausibleFigures(firearm: Firearm): string[] {
  const problems: string[] = [];
  const { length, gunMass, twistLength } = firearm.barrel;
  if (!(length >= BARREL_LENGTH_RANGE.shortest && length <= BARREL_LENGTH_RANGE.longest)) {
    problems.push(`a barrel of ${(length * 1000).toFixed(1)} mm is not a barrel`);
  }
  if (gunMass !== undefined && !(gunMass >= GUN_MASS_RANGE.lightest && gunMass <= GUN_MASS_RANGE.heaviest)) {
    problems.push(`a gun of ${gunMass.toFixed(3)} kg is not a gun`);
  }
  if (twistLength !== undefined && !(twistLength >= TWIST_LENGTH_RANGE.shortest && twistLength <= TWIST_LENGTH_RANGE.longest)) {
    problems.push(`a turn of ${(twistLength * 1000).toFixed(1)} mm is not a twist`);
  }
  return problems;
}
