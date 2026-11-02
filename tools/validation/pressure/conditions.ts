/**
 * Published pressure measurements, one load condition each, as the pressure study reads them (issue #31,
 * "What counts as a condition"). A condition carries every input the engines read, each marked with
 * where its value comes from, and the measurement with the method and the quantity it is.
 *
 * All values are SI. The published text of each value is kept beside it, so that a reader can check the
 * conversion against the source without opening the code.
 */

/** Where an input's value comes from. Only `published` and `specification` are facts about the test. */
export type InputStatus =
  /** Printed with the measurement, by the same source. */
  | 'published'
  /** A maker's specification of the component (a bullet's length from its maker's page). */
  | 'specification'
  /** Not given by the source: a typical value, a community file's or a stated default. */
  | 'assumed';

/** One input of a condition. */
export interface ConditionInput {
  /** SI value. */
  value: number;
  status: InputStatus;
  /** The value as the source writes it (`10.5 gr`), or why it was assumed. */
  note: string;
}

/**
 * How a pressure was measured. Only the piezoelectric methods are scored against the engines; the others
 * are listed. Copper crushers (CUP, or the CIP crusher in bar) give a correlated reading, not a peak
 * pressure, and are never converted.
 */
export type PressureMethod =
  /** Piezoelectric transducer, CIP method (drilled case, channel-type transducer). */
  | 'piezo-cip'
  /** Piezoelectric transducer, SAAMI method (conformal transducer). */
  | 'piezo-saami'
  /** Strain gauge on the outside of the chamber (PressureTrace and similar), calibrated by its user. */
  | 'strain-gauge'
  /** Copper or lead crusher, in CUP, LUP or crusher bar. */
  | 'crusher'
  /** The source does not say. */
  | 'not-stated';

/**
 * What the published figure is. These are different quantities and are never pooled (issue #31, "Define
 * the measured quantity").
 */
export type PressureQuantity =
  /** Mean of the peak pressures of individual shots. */
  | 'mean-of-shot-peaks'
  /** The highest peak among the shots. */
  | 'highest-shot-peak'
  /** The source does not say. */
  | 'not-stated';

/**
 * Whether the powder model may have been fitted to this very source (issue #31, fitting provenance).
 * `suspected-overlap` is for conditions whose agreement suggests a calibration point without any record
 * establishing it; they are reported apart, and the group is shown with and without them.
 */
export type FittingProvenance = 'independent' | 'known-overlap' | 'suspected-overlap' | 'unknown';

/** A document that publishes measurements. */
export interface PressureSource {
  /** Stable identifier, used in condition identifiers: `reload-swiss-rs14-2024`. */
  id: string;
  title: string;
  publisher: string;
  /** Who fired the shots, when the source says. */
  laboratory: string;
  url: string;
  /** SHA-256 of the document the conditions were read from, so that a later edition is noticed. */
  sha256: string;
  method: PressureMethod;
  quantity: PressureQuantity;
  /** What the source says about its method, quoted or located (page, section). */
  methodNote: string;
}

/** One published load condition and what was measured with it. */
export interface PressureCondition {
  /** Stable identifier within the study: source, page and row. */
  id: string;
  /** The `PressureSource.id` it comes from. */
  source: string;
  /** Where in the source: page, table, row. */
  location: string;
  /**
   * The experiment the condition belongs to: the charges of one ladder share it. A series is scored as
   * one unit (issue #31, "a charge ladder is not a sample").
   */
  series: string;
  /** Caliber definition to build the cartridge from, by its exact name in the component pool. */
  caliber: string;
  /** Powder model by maker and product, as the component pool names it. */
  powder: { maker: string; product: string };
  projectile: {
    /** Maker and name as the source prints them: `Lapua Subsonic B416`. */
    name: string;
    mass: ConditionInput;
    /** Overall length, m; absent when only a component file of the pool can give it. */
    length?: ConditionInput;
    /** Key of the projectile in the pool or in the specification table. */
    key: string;
    construction: ProjectileConstruction;
  };
  charge: ConditionInput;
  overallLength: ConditionInput;
  barrelLength: ConditionInput;
  twistLength?: ConditionInput;
  /** Water capacity of the fired case; when absent, the caliber definition's typical capacity is assumed. */
  caseCapacity?: ConditionInput;
  /** Powder temperature, K; when absent, 21 °C is assumed. */
  temperature?: ConditionInput;
  /** The measured pressure, Pa, when the source gives one. */
  pressure?: ConditionInput;
  /** The measured velocity, m/s. */
  velocity?: ConditionInput;
  /** Distance from the muzzle at which the velocity was measured, m, when stated (`V5`: 5 m). */
  velocityDistance?: number;
  /** Number of shots, when stated. */
  shots?: number;
  fitting: FittingProvenance;
  /** Anything a reader must know about this row. */
  note?: string;
}

/**
 * A projectile's construction, which sets the shot-start pressure assumed for it: GRT's manual
 * (2021-09-29, p. 32, "Initial Pressure") gives typical ranges by construction.
 */
export type ProjectileConstruction =
  | 'pistol-jacketed'
  | 'pistol-lead'
  | 'rifle-jacketed'
  | 'rifle-lead'
  | 'rifle-solid-copper';

/**
 * The shot-start pressures GRT's manual gives for each construction (p. 32), Pa: the range, and the value
 * assumed within it. The midpoint is assumed where GRT gives a range; the range is used for the
 * sensitivity check.
 */
export const SHOT_START_PRESSURE: Record<ProjectileConstruction, { low: number; assumed: number; high: number }> = {
  'pistol-jacketed': { low: 80e5, assumed: 115e5, high: 150e5 },
  'pistol-lead': { low: 50e5, assumed: 65e5, high: 80e5 },
  'rifle-jacketed': { low: 250e5, assumed: 250e5, high: 250e5 },
  'rifle-lead': { low: 80e5, assumed: 115e5, high: 150e5 },
  'rifle-solid-copper': { low: 250e5, assumed: 500e5, high: 750e5 },
};

export function input(value: number, status: InputStatus, note: string): ConditionInput {
  return { value, status, note };
}
