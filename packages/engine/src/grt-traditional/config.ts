/**
 * GRT's solver settings, with the defaults of GRT 2021.2030 (grt-traditional.md, Configuration
 * constants). GRT read them from its preferences; no setting was changed from these defaults in the
 * reference captures.
 */
export const CONFIG = {
  /** Weight of the new value in the first smoothing of the vivacity (`CORE_BAPHI_ALPHA_BA1`). */
  vivacityFirstSmoothing: 0.9,
  /** Weight of the new value in the second smoothing of the vivacity (`CORE_BAPHI_ALPHA_BAFIR`). */
  vivacitySecondSmoothing: 0.8,
  /** Vivacity increase per bar of initial pressure and unit of vivacity (`CORE_FAKTOR_FBA`). */
  vivacityInitialPressureFactor: 0.000329635,
  /** Internal friction coefficient (`CORE_FRICTION_INTERNAL_GAWIRK`). */
  internalFriction: 1.511101935815519,
  /** Rotation energy of the projectile included (`CORE_ETWIST_ENABLED`). */
  rotationEnergy: true,
  /** Primer energy, J, which GRT uses only for the time to cross the jump (`CORE_PRIMER_ENERGY_FACTOR`). */
  primerEnergy: 75.09815610370678,
  /** The OBT search includes half nodes (a GRT preference; on in the reference captures). */
  obtHalfNodes: true,
  /** Weight of the new pressure in the pressure smoothing while the powder burns. */
  pressureSmoothingBurning: 0.27,
  /** Weight of the new pressure after burnout. */
  pressureSmoothingAfterBurnout: 0.18,
} as const;
