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
  /**
   * How `maxPressure` is measured, for example `Piezo CIP`. GRT `method`. GRT writes `Piezo CIP` even
   * for SAAMI values (a .223 Rem. load with SAAMI's 3,792 bar says `Piezo CIP`), so don't rely on it.
   */
  pressureMeasurementMethod: string;
  /**
   * The maximum pressures published by CIP and SAAMI, Pa, entered by the user. Use `standardMaxPressures()`
   * to read them: it also takes the value of the caliber definition's own standard.
   */
  standardMaxPressures?: StandardMaxPressures;
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
 * A cartridge's maximum pressure under each standards body, Pa. The two bodies measure differently (CIP
 * with a transducer through a drilled case, SAAMI with a conformal transducer, and they define the
 * maximum statistically in different ways), so their values differ for the same cartridge and neither
 * converts to the other.
 */
export interface StandardMaxPressures {
  /** CIP's maximum mean pressure, Pmax. */
  cip?: number;
  /** SAAMI's maximum average pressure, MAP (piezo). */
  saami?: number;
}

/**
 * The cartridge's CIP and SAAMI maximum pressures as far as the load knows them: the user's entries,
 * else the caliber definition's maximum when its standard is CIP or SAAMI.
 */
export function standardMaxPressures(cartridge: Cartridge): StandardMaxPressures {
  const definition = cartridge.definition;
  const standard = definition?.standard.trim().toUpperCase();
  const fromDefinition = definition && definition.maxPressure > 0 ? definition.maxPressure : undefined;
  const cip = cartridge.standardMaxPressures?.cip ?? (standard === 'CIP' ? fromDefinition : undefined);
  const saami = cartridge.standardMaxPressures?.saami ?? (standard === 'SAAMI' ? fromDefinition : undefined);
  return { ...(cip === undefined ? {} : { cip }), ...(saami === undefined ? {} : { saami }) };
}

/**
 * The cartridge's outline as a standard's drawing gives it (CIP tables I to IV, maximum cartridge), m. Distances
 * are from the case head. GRT keeps these with the caliber definition, under the drawing's own letters.
 * A dimension the source doesn't give is 0, as in GRT.
 */
export interface CaseDimensions {
  /** L3: length of the case. */
  caseLength: number;
  /** L1: where the shoulder starts. */
  shoulderStart: number;
  /** L2: where the neck starts. */
  neckStart: number;
  /** L6: the longest cartridge allowed. */
  maximumOverallLength: number;
  /** R1: rim diameter. */
  rimDiameter: number;
  /** R: rim thickness. */
  rimThickness: number;
  /** E: where the body diameter P1 is measured, past the extractor groove; 0 for rimmed cases. */
  bodyBaseDistance: number;
  /** P1: body diameter at E. */
  bodyBaseDiameter: number;
  /** P2: body diameter where the shoulder starts. */
  shoulderDiameter: number;
  /** H1: neck diameter where the neck starts. */
  neckDiameter: number;
  /** H2: neck diameter at the mouth. */
  mouthDiameter: number;
  /** G1: projectile diameter at the mouth. */
  projectileDiameter: number;
}

/**
 * A caliber as defined by a standards body (CIP, SAAMI) or by a wildcat's author. Corresponds to GRT's
 * `.caliber` files and the `caliberfile` section of a load.
 *
 * GRT also stores the dimensioned drawing of the case and chamber (`L1`, `R1`, `P1`, `c_L3`…). The
 * cartridge's outline is mapped to `caseDimensions`; the rest (chamber, extractor groove, angles) stays
 * verbatim in `unmapped`.
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
  /** The cartridge's outline as the standard dimensions it, when given. */
  caseDimensions?: CaseDimensions;
  info: ComponentInfo;
  /** Source values without a field in this format, kept verbatim by name. */
  unmapped?: Record<string, string>;
}
