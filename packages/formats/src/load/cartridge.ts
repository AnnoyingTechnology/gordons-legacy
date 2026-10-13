import type { ComponentInfo } from './component-info.ts';

/**
 * The cartridge as loaded: the caliber's specification values, adjusted by the reloader for their own
 * cases and barrel. Corresponds to GRT's `caliber` section.
 *
 * The seating depth isn't stored: it follows from the case length, the projectile length and the
 * overall length (see `seatingDepth()` in `load.ts`).
 */
export interface Cartridge {
  /** Caliber name, for example `.300 AAC Blackout`. GRT `CaliberName`. */
  name: string;
  /** Groove diameter of the barrel, m. GRT `Dz`. */
  grooveDiameter: number;
  /** Cross-section on which the gas pressure acts, which depends on the rifling, m². GRT `Aeff`. */
  effectiveBoreArea: number;
  /** Maximum permitted mean pressure from the caliber standard, Pa. GRT `pMaxZul`. */
  maxPressure: number;
  /** How `maxPressure` is measured, for example `Piezo CIP`. GRT `method`. */
  pressureMeasurementMethod: string;
  /** Length of the prepared case, m. GRT `caselen`. */
  caseLength: number;
  /** Water capacity of a fired case, m³. GRT `casevol`. */
  caseCapacity: number;
  /** Cartridge overall length, base to tip, m. GRT `oal`. */
  overallLength: number;
  /**
   * Sebert factor: share of the charge mass that moves with the projectile, used to account for the
   * kinetic energy of the powder gas. Dimensionless, usually 0.1 to 1. GRT `sebert`.
   */
  sebertFactor: number;
  /** True for shotshells. GRT `shotshell`. */
  shotshell: boolean;
  /** The caliber definition the cartridge was based on, when known. GRT `caliberfile`. */
  definition?: CaliberDefinition;
}

/**
 * A caliber as defined by a standards body (CIP, SAAMI) or by a wildcat's author. Corresponds to GRT's
 * `.caliber` files and the `caliberfile` section of a load.
 *
 * GRT also stores the dimensioned drawing of the case and chamber (`L1`, `R1`, `P1`, `c_L3`…). Their
 * meanings aren't all known yet, so importers keep them verbatim in `unmapped` until the cartridge
 * designer (milestone M5) needs them.
 */
export interface CaliberDefinition {
  /** Official name, for example `6 mm ARC`. GRT `cipname`. */
  name: string;
  /** Other names, comma-separated as in the source. GRT `altname`. */
  alternativeNames: string;
  /** Defining body, for example `CIP`, `SAAMI` or `WildCat`. GRT `standard`. */
  standard: string;
  /** Country of origin, for example `US`. GRT `ciporigin`. */
  countryOfOrigin: string;
  /** Case type as given by the standard, for example `1 rimless`. GRT `ciptype`. */
  caseType: string;
  /** Date of the standard, as written in the source. GRT `cipdate`. */
  standardDate: string;
  /** Date of the standard's last revision, as written in the source. GRT `ciprevdate`. */
  revisionDate: string;
  /** Link to the specification document. GRT `cippdf`. */
  specificationUrl: string;
  /** Maximum mean pressure from the standard, Pa. GRT `Pmax`. */
  maxPressure: number;
  /** Default Sebert factor for the caliber; see `Cartridge.sebertFactor`. GRT `sebert`. */
  sebertFactor: number;
  info: ComponentInfo;
  /** Source values without a field in this format, kept verbatim by name. */
  unmapped?: Record<string, string>;
}
