import { seatingDepth, type Load, type ProjectileBase } from '@gordons-legacy/formats';

/**
 * The quantities GRT's model works with, in the units GRT uses for them. Most are SI; the initial
 * pressure and bore resistance are in bar, the heat of explosion in kJ/kg and the temperature in °C,
 * because GRT's formulas convert them in specific places (docs/model/grt-traditional.md, Inputs).
 */
export interface GrtInputs {
  /** m_p, kg. */
  projectileMass: number;
  /** m_c, kg. */
  chargeMass: number;
  /** s. */
  sebertFactor: number;
  /** A, m². */
  boreArea: number;
  /** D_g, m. */
  grooveDiameter: number;
  /** D_p, m. */
  projectileDiameter: number;
  /** L_p, m. */
  projectileLength: number;
  /** d, m. */
  seatingDepth: number;
  base: ProjectileBase;
  /** V_case, m³. */
  caseCapacity: number;
  /** L_case, m. */
  caseLength: number;
  /** x_e, m. */
  barrelLength: number;
  /** Jump to the lands, m; 0 without one. */
  jumpToLands: number;
  /** L_tw, m; 0 when unknown, which disables rotation energy. */
  twistLength: number;
  /** p_s, bar. */
  initialPressure: number;
  /** f_r, bar; 0 when there is no adjustment. */
  boreResistance: number;
  /** Q, kJ/kg. */
  heatOfExplosion: number;
  /** k. */
  heatCapacityRatio: number;
  /** ρ_g, kg/m³. */
  grainDensity: number;
  vivacity: number;
  a0: number;
  a1: number;
  z1: number;
  z2: number;
  coldTemperatureCoefficient: number;
  hotTemperatureCoefficient: number;
  /** T, °C. */
  temperature: number;
  shotshell: boolean;
  gasLeaks: GrtLeak[];
}

/** An opening in the bore (grt-traditional.md, Gas leaks). */
export interface GrtLeak {
  /** GRT's leak type: 0 cylinder gap, 1 round hole, 2 rectangular hole, 3 slot. */
  type: number;
  /** Distance from the breech face to the opening, m. */
  position: number;
  /** Width along the bore, m. */
  width: number;
  /** Height, m. */
  height: number;
}

const PASCALS_PER_BAR = 1e5;
const JOULES_PER_KILOJOULE = 1e3;
const ZERO_CELSIUS = 273.15;

export function grtInputs(load: Load): GrtInputs {
  const { cartridge, barrel, projectile, propellant, charge } = load;
  return {
    projectileMass: projectile.mass,
    chargeMass: charge.mass,
    sebertFactor: cartridge.sebertFactor,
    boreArea: cartridge.effectiveBoreArea,
    grooveDiameter: cartridge.grooveDiameter,
    projectileDiameter: projectile.diameter,
    projectileLength: projectile.length,
    seatingDepth: seatingDepth(load),
    base: projectile.base,
    caseCapacity: cartridge.caseCapacity,
    caseLength: cartridge.caseLength,
    barrelLength: barrel.length,
    jumpToLands: barrel.jumpToLands ?? 0,
    twistLength: barrel.twistLength ?? 0,
    initialPressure: projectile.shotStartPressure / PASCALS_PER_BAR,
    boreResistance: (projectile.boreResistanceAdjustment ?? 0) / PASCALS_PER_BAR,
    heatOfExplosion: propellant.heatOfExplosion / JOULES_PER_KILOJOULE,
    heatCapacityRatio: propellant.heatCapacityRatio,
    grainDensity: propellant.grainDensity,
    vivacity: propellant.burnModel.vivacity,
    a0: propellant.burnModel.a0,
    a1: propellant.burnModel.a1,
    z1: propellant.burnModel.z1,
    z2: propellant.burnModel.z2,
    coldTemperatureCoefficient: propellant.burnModel.coldTemperatureCoefficient,
    hotTemperatureCoefficient: propellant.burnModel.hotTemperatureCoefficient,
    temperature: charge.temperature - ZERO_CELSIUS,
    shotshell: cartridge.shotshell,
    gasLeaks: barrel.gasLeaks.map(({ type, position, width, height }) => ({ type, position, width, height })),
  };
}
