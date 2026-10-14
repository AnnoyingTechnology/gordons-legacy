import { grtTraditional, type Simulation } from '@gordons-legacy/engine';
import { standardMaxPressures, type Load } from '@gordons-legacy/formats';
import { vary } from './sensitivity.ts';
import { speedRegime } from './speed-of-sound.ts';

/**
 * One review of a simulated load, gathering every reason for concern in one place so that the UI shows
 * them the same way: over-pressure, little margin, a double charge that fits, compressed or low fills,
 * unburnt powder, the transonic band, and what a cold or hot day does to the load.
 *
 * No finding doesn't make a load safe: the review only knows what the model predicts, and the model is
 * not load data.
 */

/** How serious a finding is. */
export type ConcernLevel = 'danger' | 'caution' | 'note';

/** The overall level of a load: its most serious finding, or none. */
export type AssessmentLevel = ConcernLevel | 'none';

export type FindingCode =
  /** The peak pressure is above a maximum (the load's, CIP's or SAAMI's). */
  | 'aboveLimit'
  /** Within `NEAR_LIMIT_SHARE` of the lowest maximum: less margin than the model's own uncertainty. */
  | 'nearLimit'
  /** Ordinary bench variations together take the peak above the lowest maximum. */
  | 'benchVariationsAboveLimit'
  /**
   * A loading mistake, not the load itself: a second charge thrown into the case would fit and go
   * unnoticed. Caution when the doubled charge's simulated peak is above the maximum, else a note.
   */
  | 'doubleChargeFits'
  /** The poured charge is compressed by the projectile. */
  | 'compressed'
  /** The poured charge is heavily compressed, near the model's 120 % limit. */
  | 'heavilyCompressed'
  /** The powder fills little of the case: its position changes ignition, and velocity spreads. */
  | 'lowFill'
  /** A large share of the powder is still burning at the muzzle. */
  | 'incompleteBurn'
  /** The peak is a small fraction of the maximum: powders burn unevenly far below their working pressure. */
  | 'lowPressure'
  /** The muzzle velocity is in the transonic band. */
  | 'transonic'
  /** On a hot day the peak is above the lowest maximum. */
  | 'hotAboveLimit'
  /** On a hot day a subsonic load reaches the transonic band or beyond. */
  | 'hotTransonic'
  /** On a cold day a supersonic load slows into the transonic band or below. */
  | 'coldTransonic'
  /** On a cold day much more powder is still burning at the muzzle. */
  | 'coldIncompleteBurn';

/** A maximum pressure the load is checked against. */
export interface PressureLimit {
  /** `load`: the load's own maximum, when it differs from both standards' values. */
  source: 'CIP' | 'SAAMI' | 'load';
  /** Pa. */
  pressure: number;
}

export interface Finding {
  code: FindingCode;
  level: ConcernLevel;
  /** For climate findings, the day concerned. */
  climate?: 'cold' | 'hot';
  /** The limit concerned, for pressure findings. */
  limit?: PressureLimit;
  /** Peak pressure concerned, Pa. */
  pressure?: number;
  /** Case fill, 0 to 1.2. */
  fill?: number;
  /** Fraction of the charge burnt at the muzzle, 0 to 1. */
  burnt?: number;
  /** Powder temperature concerned, K. */
  temperature?: number;
  /** Muzzle velocity concerned, m/s. */
  velocity?: number;
}

export interface Assessment {
  level: AssessmentLevel;
  /** Most serious first. */
  findings: Finding[];
  /** The limits checked, lowest first. */
  limits: PressureLimit[];
  /** Powder temperatures of the cold and hot days, K. */
  climate: { cold: number; hot: number };
}

/** Share of the lowest maximum from which the margin is thinner than the model's uncertainty. */
export const NEAR_LIMIT_SHARE = 0.9;
/**
 * Up to this case fill, a double charge fills at most 110 % of the case: it pours in below the mouth
 * (the fill counts only the volume under the seated bullet) and seating compresses it only a little, so
 * nothing at the bench gives it away.
 */
export const DOUBLE_CHARGE_FILL = 0.55;
/** Below this case fill, the fill is low. */
export const LOW_FILL = 0.6;
/** Above this case fill, the compression is heavy (the model refuses loads above 1.2, as GRT does). */
export const HEAVY_COMPRESSION_FILL = 1.1;
/** Below this burnt fraction at the muzzle, much of the powder leaves unburnt. */
export const INCOMPLETE_BURN = 0.85;
/** Below this share of the lowest maximum, the pressure is low for the powder to burn evenly. */
export const LOW_PRESSURE_SHARE = 0.35;
/**
 * The cold and hot days, °C: a load worked up between about 14 and 26 °C, then used in winter or in the
 * desert (the maintainer's choice: issue #13, then −15 °C for the cold day).
 */
export const COLD_DAY_CELSIUS = -15;
export const HOT_DAY_CELSIUS = 40;
const ZERO_CELSIUS = 273.15;

const LEVEL_ORDER: Record<ConcernLevel, number> = { danger: 0, caution: 1, note: 2 };

/** Reviews a load whose simulation `shot` succeeded. Runs a few more simulations (climate, double charge). */
export function assessLoad(load: Load, shot: Simulation): Assessment {
  const limits = pressureLimits(load);
  const lowest = limits[0]!;
  const findings: Finding[] = [];
  const peak = shot.maxPressure;

  const exceeded = limits.filter((limit) => peak > limit.pressure);
  for (const limit of exceeded) findings.push({ code: 'aboveLimit', level: 'danger', limit, pressure: peak });
  if (exceeded.length === 0) {
    if (peak >= NEAR_LIMIT_SHARE * lowest.pressure) findings.push({ code: 'nearLimit', level: 'caution', limit: lowest, pressure: peak });
    const varied = simulate(vary(load, 'combined'));
    if (varied && varied.maxPressure > lowest.pressure) {
      findings.push({ code: 'benchVariationsAboveLimit', level: 'caution', limit: lowest, pressure: varied.maxPressure });
    }
  }
  if (peak < LOW_PRESSURE_SHARE * lowest.pressure) findings.push({ code: 'lowPressure', level: 'note', limit: lowest, pressure: peak });

  const fill = shot.caseFill;
  if (fill <= DOUBLE_CHARGE_FILL) {
    const doubled = simulate({ ...load, charge: { ...load.charge, mass: 2 * load.charge.mass } });
    // A double charge that stays under the maximum in the model (slow powders, light loads) is only noted.
    const level = doubled && doubled.maxPressure <= lowest.pressure ? 'note' : 'caution';
    findings.push({ code: 'doubleChargeFits', level, fill, limit: lowest, ...(doubled ? { pressure: doubled.maxPressure } : {}) });
  }
  if (fill > HEAVY_COMPRESSION_FILL) findings.push({ code: 'heavilyCompressed', level: 'caution', fill });
  else if (fill > 1) findings.push({ code: 'compressed', level: 'note', fill });
  if (fill < LOW_FILL) findings.push({ code: 'lowFill', level: 'note', fill });
  if (shot.burntFractionAtMuzzle < INCOMPLETE_BURN) findings.push({ code: 'incompleteBurn', level: 'note', burnt: shot.burntFractionAtMuzzle });

  const temperature = load.charge.temperature;
  const regime = speedRegime(shot.muzzleVelocity, temperature);
  if (regime === 'transonic') findings.push({ code: 'transonic', level: 'note', velocity: shot.muzzleVelocity, temperature });

  const climate = { cold: COLD_DAY_CELSIUS + ZERO_CELSIUS, hot: HOT_DAY_CELSIUS + ZERO_CELSIUS };
  const hot = simulate(atTemperature(load, climate.hot));
  if (hot) {
    if (hot.maxPressure > lowest.pressure) {
      findings.push({ code: 'hotAboveLimit', level: 'caution', climate: 'hot', limit: lowest, pressure: hot.maxPressure, temperature: climate.hot });
    }
    if (regime === 'subsonic' && speedRegime(hot.muzzleVelocity, climate.hot) !== 'subsonic') {
      findings.push({ code: 'hotTransonic', level: 'note', climate: 'hot', velocity: hot.muzzleVelocity, temperature: climate.hot });
    }
  }
  const cold = simulate(atTemperature(load, climate.cold));
  if (cold) {
    if (regime === 'supersonic' && speedRegime(cold.muzzleVelocity, climate.cold) !== 'supersonic') {
      findings.push({ code: 'coldTransonic', level: 'note', climate: 'cold', velocity: cold.muzzleVelocity, temperature: climate.cold });
    }
    if (shot.burntFractionAtMuzzle >= INCOMPLETE_BURN && cold.burntFractionAtMuzzle < INCOMPLETE_BURN) {
      findings.push({ code: 'coldIncompleteBurn', level: 'note', climate: 'cold', burnt: cold.burntFractionAtMuzzle, temperature: climate.cold });
    }
  }

  findings.sort((a, b) => LEVEL_ORDER[a.level] - LEVEL_ORDER[b.level]);
  return { level: findings[0]?.level ?? 'none', findings, limits, climate };
}

/**
 * The maxima the load is checked against, lowest first: CIP's and SAAMI's when known, and the load's own
 * when it differs from both (by more than 0.5 %, which covers GRT's rounding of converted values).
 */
export function pressureLimits(load: Load): PressureLimit[] {
  const standards = standardMaxPressures(load.cartridge);
  const limits: PressureLimit[] = [];
  if (standards.cip !== undefined) limits.push({ source: 'CIP', pressure: standards.cip });
  if (standards.saami !== undefined) limits.push({ source: 'SAAMI', pressure: standards.saami });
  const own = load.cartridge.maxPressure;
  if (!limits.some((limit) => Math.abs(limit.pressure / own - 1) <= 0.005)) limits.push({ source: 'load', pressure: own });
  return limits.sort((a, b) => a.pressure - b.pressure);
}

function atTemperature(load: Load, temperature: number): Load {
  return { ...load, charge: { ...load.charge, temperature } };
}

function simulate(load: Load): Simulation | undefined {
  const result = grtTraditional.simulate(load);
  return result.ok ? result.simulation : undefined;
}
