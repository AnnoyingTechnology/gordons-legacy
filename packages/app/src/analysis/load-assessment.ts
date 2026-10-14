import { grtTraditional, type Simulation } from '@gordons-legacy/engine';
import { standardMaxPressures, type Load } from '@gordons-legacy/formats';
import { vary } from './sensitivity.ts';
import { speedRegime } from './speed-of-sound.ts';
import { INCOMPLETE_BURN, temperatureRange, withinSpan, type TemperatureSpan, type TemperatureState } from './temperature-range.ts';

export { INCOMPLETE_BURN } from './temperature-range.ts';

/**
 * One review of a simulated load, gathering every reason for concern in one place so that the UI shows
 * them the same way: over-pressure, little margin, a double charge that fits, compressed or low fills,
 * unburnt powder, the transonic band, and the powder temperatures where the load leaves its limits.
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
  /** The bench variations couldn't be simulated: unchecked, which is not the same as no finding. */
  | 'benchVariationsUnchecked'
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
  /** The case capacity is the caliber file's typical value, probably not measured. */
  | 'caseCapacityTypical'
  /** The case capacity is far from the caliber file's typical value: a wrong entry or unit? */
  | 'caseCapacityFarFromTypical'
  /** The bullet looks monolithic (all copper or brass) by its name. */
  | 'monolithicBullet'
  /** The powder burns out early in a long barrel, where the model over-predicted measured velocities. */
  | 'earlyBurnoutLongBarrel'
  /**
   * Past a powder temperature, colder or hotter than the load's, the load leaves its limits in the
   * simulation (analysis/temperature-range.ts): `side`, `temperature` and `temperatureState` say how.
   */
  | 'temperatureLimit';

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
  /** For temperature findings, on which side of the load's temperature. */
  side?: 'cold' | 'hot';
  /** For temperature findings, what happens past `temperature`. */
  temperatureState?: Exclude<TemperatureState, 'within'>;
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
  /** A relative difference, or a share of the barrel's travel. */
  share?: number;
}

export interface Assessment {
  level: AssessmentLevel;
  /** Most serious first. */
  findings: Finding[];
  /** The limits checked, lowest first. */
  limits: PressureLimit[];
  /** The powder temperatures from −50 to 50 °C, in spans of one state each. */
  temperatures: TemperatureSpan[];
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
/** Within this of the caliber file's typical capacity, the load's capacity is taken as not measured. */
export const TYPICAL_CAPACITY_MATCH = 0.003;
/** Beyond this difference from the typical capacity, the entry is suspicious (cases of different makes differ by a few percent). */
export const FAR_FROM_TYPICAL_CAPACITY = 0.1;
/**
 * Early burnout in a long barrel: the charge burns out within this share of the travel, and the barrel
 * sweeps at least `LONG_EXPANSION` times the case's capacity. In the maintainer's chronograph data
 * (docs/model/validation.md), such loads (fast powders in 300 BLK subsonic and 9 mm carbine loads) were
 * over-predicted by +4 to +29 % (median +15 %), the others by about ±7 %.
 */
export const EARLY_BURNOUT_SHARE = 0.2;
export const LONG_EXPANSION = 10;
/**
 * Common monolithic (all-copper or brass) bullet lines, recognised by name: projectile files rarely say
 * what a bullet is made of.
 */
const MONOLITHIC_NAMES =
  /\b(TSX|TTSX|LRX|TAC-?X|XPB|GMX|CX|Monoflex|E-?Tip|Naturalis|Hammer|Cutting Edge|Raptor|Lehigh|Peregrine|Powerhead|Ecostrike|Trophy Copper|Copper Impact|GS Custom|Bulldozer|Flatline|Monolithic|all[- ]copper|solid copper)\b/i;

/** Below this share of the lowest maximum, the pressure is low for the powder to burn evenly. */
export const LOW_PRESSURE_SHARE = 0.35;

const LEVEL_ORDER: Record<ConcernLevel, number> = { danger: 0, caution: 1, note: 2 };

/**
 * Reviews a load whose simulation `shot` succeeded. Runs about 30 more simulations: the temperature range,
 * the bench variations and a double charge.
 */
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
    if (!varied) findings.push({ code: 'benchVariationsUnchecked', level: 'note' });
    else if (varied.maxPressure > lowest.pressure) {
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

  const typical = load.cartridge.definition?.typicalCaseCapacity;
  if (typical !== undefined) {
    const difference = load.cartridge.caseCapacity / typical - 1;
    if (Math.abs(difference) <= TYPICAL_CAPACITY_MATCH) findings.push({ code: 'caseCapacityTypical', level: 'note' });
    else if (Math.abs(difference) > FAR_FROM_TYPICAL_CAPACITY) findings.push({ code: 'caseCapacityFarFromTypical', level: 'caution', share: difference });
  }
  if (MONOLITHIC_NAMES.test(`${load.projectile.name} ${load.projectile.product} ${load.projectile.material ?? ''}`)) {
    findings.push({ code: 'monolithicBullet', level: 'note' });
  }
  const travel = shot.curve.travel[shot.curve.travel.length - 1]! - shot.curve.travel[0]!;
  const expansion = (load.cartridge.effectiveBoreArea * travel) / load.cartridge.caseCapacity;
  if (shot.burnout && travel > 0 && (shot.burnout.travel - shot.curve.travel[0]!) / travel <= EARLY_BURNOUT_SHARE && expansion >= LONG_EXPANSION) {
    findings.push({ code: 'earlyBurnoutLongBarrel', level: 'note', share: (shot.burnout.travel - shot.curve.travel[0]!) / travel });
  }

  const temperature = load.charge.temperature;
  const regime = speedRegime(shot.muzzleVelocity, temperature);
  if (regime === 'transonic') findings.push({ code: 'transonic', level: 'note', velocity: shot.muzzleVelocity, temperature });

  const temperatures = temperatureRange(load, shot, lowest.pressure);
  const own = withinSpan(temperatures, temperature);
  if (own) {
    const index = temperatures.indexOf(own);
    const colder = temperatures[index - 1];
    const hotter = temperatures[index + 1];
    if (colder && colder.state !== 'within') {
      findings.push({ code: 'temperatureLimit', level: 'note', side: 'cold', temperature: own.from, temperatureState: colder.state });
    }
    if (hotter && hotter.state !== 'within') {
      findings.push({ code: 'temperatureLimit', level: 'note', side: 'hot', temperature: own.to, temperatureState: hotter.state });
    }
  }

  findings.sort((a, b) => LEVEL_ORDER[a.level] - LEVEL_ORDER[b.level]);
  return { level: findings[0]?.level ?? 'none', findings, limits, temperatures };
}

/**
 * The maxima the load is checked against, lowest first: CIP's and SAAMI's when known, and the load's own.
 * The load's own is left out only when a standard's value is at most it and within 0.5 % of it (GRT's
 * rounding of converted values), so that the lowest maximum is always enforced. Values that aren't
 * finite and positive are ignored.
 */
export function pressureLimits(load: Load): PressureLimit[] {
  const standards = standardMaxPressures(load.cartridge);
  const valid = (pressure: number | undefined): pressure is number => pressure !== undefined && Number.isFinite(pressure) && pressure > 0;
  const limits: PressureLimit[] = [];
  if (valid(standards.cip)) limits.push({ source: 'CIP', pressure: standards.cip });
  if (valid(standards.saami)) limits.push({ source: 'SAAMI', pressure: standards.saami });
  const own = load.cartridge.maxPressure;
  const covered = limits.some((limit) => limit.pressure <= own && own / limit.pressure - 1 <= 0.005);
  if (valid(own) && !covered) limits.push({ source: 'load', pressure: own });
  return limits.sort((a, b) => a.pressure - b.pressure);
}

function simulate(load: Load): Simulation | undefined {
  const result = grtTraditional.simulate(load);
  return result.ok ? result.simulation : undefined;
}
