import type { Barrel } from './barrel.ts';
import type { Cartridge } from './cartridge.ts';
import type { MeasurementSeries } from './measurement.ts';
import type { Projectile } from './projectile.ts';
import type { Propellant } from './propellant.ts';

export const LOAD_FORMAT = 'gordons-legacy.load';
export const LOAD_SCHEMA_VERSION = 1;

/**
 * A load: everything needed to simulate one cartridge in one gun, plus the user's notes and
 * measurements. This is the document saved to disk as JSON. All quantities are in SI base units.
 */
export interface Load {
  format: typeof LOAD_FORMAT;
  schemaVersion: typeof LOAD_SCHEMA_VERSION;
  title: string;
  cartridge: Cartridge;
  barrel: Barrel;
  projectile: Projectile;
  propellant: Propellant;
  charge: Charge;
  /** A series of charges simulated together, when enabled. */
  ladder?: Ladder;
  measurements: MeasurementSeries[];
  notes: Note[];
  pictures: Picture[];
  /** Where the load was imported from, when it was. */
  importedFrom?: ImportOrigin;
  /** Source values without a field in this format, kept verbatim by their path in the source. */
  unmapped?: Record<string, string>;
}

/** The powder charge. */
export interface Charge {
  /** Powder mass, kg. GRT `mc` (grams). */
  mass: number;
  /** Powder temperature at firing, K. GRT `pt` (°C). */
  temperature: number;
}

/** Charges simulated in steps above the main charge. GRT `laddercnt` and `laddermc`. */
export interface Ladder {
  /** Number of charges, from 2 to 10. */
  steps: number;
  /** Mass added at each step, kg. */
  massIncrement: number;
}

/** A free-text note. GRT `note`. */
export interface Note {
  title: string;
  text: string;
  showInReport: boolean;
  /** True when GRT used the note as a report template, with placeholders such as `Result.MaxPressure`. */
  isReportTemplate: boolean;
}

/** An image attached to the load. GRT `gallery/picture`. */
export interface Picture {
  name: string;
  /** Media type of `data`, for example `image/jpeg`. */
  mediaType: string;
  /** Pixels. */
  width: number;
  /** Pixels. */
  height: number;
  /** Image bytes, base64-encoded. */
  data: string;
}

export interface ImportOrigin {
  /** Source format, for example `grtload`. */
  format: string;
  /** Version of the program that wrote the file, when recorded, for example `2021.2030-NIGHTLY`. */
  writerVersion?: string;
  /** Name of the imported file, when known. */
  fileName?: string;
}

/**
 * Depth of the projectile's base below the case mouth, m: case length plus projectile length minus
 * overall length.
 */
export function seatingDepth(load: Pick<Load, 'cartridge' | 'projectile'>): number {
  return load.cartridge.caseLength + load.projectile.length - load.cartridge.overallLength;
}
