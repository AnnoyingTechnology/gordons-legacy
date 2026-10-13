import type { ComponentInfo } from './component-info.ts';

/**
 * A propellant powder model. Corresponds to GRT's `propellant` section in a load (without the charge) and
 * to `.propellant` files.
 */
export interface Propellant {
  /** Manufacturer. GRT `mname`. */
  maker: string;
  /** Product name. GRT `pname`. */
  product: string;
  /** Lot identifier or model version. GRT `lotid`. */
  lot: string;
  /** Specific heat of explosion, measured by calorimetry, J/kg. GRT `Qex` (kJ/kg). */
  heatOfExplosion: number;
  /** Ratio of specific heats cp/cv of the powder gas, dimensionless. GRT `k`. */
  heatCapacityRatio: number;
  /**
   * Covolume of the powder gas (Noble-Abel equation of state), m³/kg. GRT `eta`, given in cm³/g; loads
   * label it cm³/kg, which is a GRT labelling defect (see docs/formats/grtload.md).
   */
  covolume: number;
  /** Density of the powder material itself, kg/m³. GRT `pc`. */
  grainDensity: number;
  /** Bulk density of the poured powder, including the voids between grains, kg/m³. GRT `pcd`. */
  bulkDensity: number;
  /** How the powder burns. */
  burnModel: GrtBurnModel;
  /** Provenance, for component files. */
  info?: ComponentInfo;
  /** Source values without a field in this format, kept verbatim by name. */
  unmapped?: Record<string, string>;
}

/**
 * GRT's burn model: a dynamic vivacity scaled by a three-phase form function. The coefficients are kept
 * in GRT's own convention, because the model's equations define their units; docs/model/ will describe
 * them once the engine (milestone M2) reproduces GRT.
 */
export interface GrtBurnModel {
  kind: 'grt';
  /** Dynamic vivacity at the reference temperature of 21 °C. GRT `Ba`. */
  vivacity: number;
  /** Progressive/degressive coefficient of the form function. GRT `a0`. */
  a0: number;
  /** Second form-function coefficient; 0 in every file seen so far. GRT `a1`, loads only. */
  a1: number;
  /** Burnt fraction where progressive burning turns primary-degressive. GRT `z1`. */
  z1: number;
  /** Burnt fraction where primary-degressive burning turns secondary-degressive. GRT `z2`. */
  z2: number;
  /**
   * Change of vivacity per kelvin below 21 °C: (Ba(21 °C) − Ba(−20 °C)) / 41 K. 0 means GRT's internal
   * default. GRT `tcc`.
   */
  coldTemperatureCoefficient: number;
  /**
   * Change of vivacity per kelvin above 21 °C: (Ba(60 °C) − Ba(21 °C)) / 39 K. 0 means GRT's internal
   * default. GRT `tch`.
   */
  hotTemperatureCoefficient: number;
}
