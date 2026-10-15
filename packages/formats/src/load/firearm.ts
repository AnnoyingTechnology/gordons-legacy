import type { Barrel } from './barrel.ts';

export const FIREARM_FORMAT = 'gordons-legacy.firearm';
export const FIREARM_SCHEMA_VERSION = 1;

/**
 * A gun, described once and used by every load fired in it (issue #24). What the simulation needs of a
 * gun is its barrel, so that is what a firearm carries, beside what tells one gun from another.
 *
 * Saved as its own JSON document, so that a gun can be kept, backed up and shared without a load.
 */
export interface Firearm {
  format: typeof FIREARM_FORMAT;
  schemaVersion: typeof FIREARM_SCHEMA_VERSION;
  /** What the user calls it; it becomes the load's barrel name. */
  name: string;
  /** Who made it, for example `Glock`. */
  maker?: string;
  /** The model as the maker names it, for example `17 Gen5`. */
  model?: string;
  /** The cartridge it is chambered for, free text: `9 mm Luger`. Used to offer the right guns first. */
  cartridge?: string;
  /** Barrel length, twist, gun mass, jump to lands and gas leaks: the values the engine reads. */
  barrel: Barrel;
  /** What the user knows about it and wants kept with it. */
  notes?: string;
  /** Where the figures come from. Without it they are taken to be the user's own. */
  source?: FirearmSource;
}

/**
 * Where a gun's figures come from. A published barrel length is nominal and often differs from the
 * bolt face to muzzle length the simulation needs, so the two are told apart.
 */
export interface FirearmSource {
  /** `measured`: by the user, on this gun. `published`: a specification, nominal. */
  kind: 'measured' | 'published';
  /** Who published them, for example `Glock Ges.m.b.H.`. */
  publisher?: string;
  /** The page they were read from. */
  url?: string;
  /** When they were read, YYYY-MM-DD. */
  retrieved?: string;
  /**
   * Which mass the publisher gave, when they say which: `without-magazine`, `empty-magazine`, `loaded`,
   * or `unstated` when the page gives one figure and does not say what it includes. The simulation wants
   * the gun as it recoils, so an unstated figure is a starting point, not that number.
   */
  massBasis?: string;
  /**
   * The figures as the publisher printed them, keyed by what they describe:
   * `{ "barrelLength": "18.50 in", "weight": "7 lbs. 8 oz." }`. Kept beside the SI values so a rounding
   * or a unit mix-up can be traced without fetching the page again.
   */
  published?: Record<string, string>;
}
