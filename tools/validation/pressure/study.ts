/**
 * Runs the pressure study: every condition simulated by both engines with identical inputs, the paired
 * eligibility worked out, and the statistics of `scoring.ts` computed per measurement method and per
 * pressure band. Pure: reading documents and printing are the command's (`../pressure.ts`).
 */
import type { Engine } from '@gordons-legacy/engine';
import { units, type Load } from '@gordons-legacy/formats';
import { conditionLoad, type InputRecord, type ShotStartChoice } from './condition-load.ts';
import type { ComponentPool } from './component-pool.ts';
import type { PressureCondition, PressureMethod, PressureSource } from './conditions.ts';
import { logRatio, pairedLossDifference, summarize, type LogRatioSummary } from './scoring.ts';

/** What one engine made of a condition. */
export type EngineOutcome = { pressure: number; velocity: number } | { refused: string[] };

/** One condition through the study. */
export type ConditionResult =
  | { condition: PressureCondition; status: 'missing'; missing: string[] }
  | {
      condition: PressureCondition;
      /** `paired` when both engines simulated it; only those are compared. */
      status: 'paired' | 'unpaired';
      inputs: InputRecord[];
      /** The cartridge's maximum pressure in the caliber definition, Pa, and its standard. */
      limit: { pressure: number; standard: string };
      outcomes: [EngineOutcome, EngineOutcome];
    };

/** The methods scored against the engines, and how the rest are grouped in the report. */
export type MethodGroup = 'piezoelectric' | 'method not stated' | 'strain gauge' | 'crusher (listed, never scored)';

export function methodGroup(method: PressureMethod): MethodGroup {
  switch (method) {
    case 'piezo-cip':
    case 'piezo-saami':
      return 'piezoelectric';
    case 'strain-gauge':
      return 'strain gauge';
    case 'crusher':
      return 'crusher (listed, never scored)';
    case 'not-stated':
      return 'method not stated';
  }
}

/**
 * Bands of measured pressure (issue #31: stratify by pressure, never by either engine's prediction).
 * The three absolute bands partition the conditions. The near-maximum band overlaps them: 90 % or more
 * of the maximum in the caliber file, counted only when the file's standard is the body whose method
 * measured the pressure (a SAAMI measurement against a SAAMI maximum), since CIP and SAAMI maxima
 * differ and neither converts to the other.
 */
export type PressureBand = 'near maximum (≥ 90 % of the same body’s maximum in the caliber file)' | '3,000 bar or more' | '2,000–3,000 bar' | 'under 2,000 bar';

const NEAR_MAXIMUM: PressureBand = 'near maximum (≥ 90 % of the same body’s maximum in the caliber file)';
const METHOD_BODY: Partial<Record<PressureMethod, string>> = { 'piezo-cip': 'CIP', 'piezo-saami': 'SAAMI' };

export function pressureBands(measured: number, limit: { pressure: number; standard: string }, method: PressureMethod): PressureBand[] {
  const bands: PressureBand[] = [];
  const sameBody = METHOD_BODY[method] !== undefined && METHOD_BODY[method] === limit.standard.trim().toUpperCase();
  if (sameBody && limit.pressure > 0 && measured >= 0.9 * limit.pressure) bands.push(NEAR_MAXIMUM);
  if (measured >= 3000 * units.BAR) bands.push('3,000 bar or more');
  else if (measured >= 2000 * units.BAR) bands.push('2,000–3,000 bar');
  else bands.push('under 2,000 bar');
  return bands;
}

/**
 * A change to the assumed inputs, for the sensitivity check: if a plausible error in what the sources
 * don't give flips the comparison, the comparison is unresolved (issue #31, "Sensitivity to the
 * reference"). Published inputs are never changed.
 */
export interface Perturbation {
  name: string;
  shotStart: ShotStartChoice;
  adjust: (load: Load, inputs: InputRecord[]) => Load;
}

const isAssumed = (inputs: InputRecord[], path: string) => inputs.some((input) => input.path === path && input.status !== 'published');

/** The assumptions as made, then each one moved by a plausible error in both directions. */
export const PERTURBATIONS: Perturbation[] = [
  { name: 'as assumed', shotStart: 'assumed', adjust: (load) => load },
  ...([-0.02, 0.02] as const).map((share) => ({
    name: `case capacity ${share > 0 ? '+' : '−'}2 %`,
    shotStart: 'assumed' as const,
    adjust: (load: Load, inputs: InputRecord[]) =>
      isAssumed(inputs, 'cartridge.caseCapacity') ? { ...load, cartridge: { ...load.cartridge, caseCapacity: load.cartridge.caseCapacity * (1 + share) } } : load,
  })),
  ...([-0.5, 0.5] as const).map((millimetres) => ({
    name: `projectile length ${millimetres > 0 ? '+' : '−'}0.5 mm`,
    shotStart: 'assumed' as const,
    adjust: (load: Load, inputs: InputRecord[]) =>
      isAssumed(inputs, 'projectile.length') ? { ...load, projectile: { ...load.projectile, length: load.projectile.length + millimetres * units.MILLIMETRE } } : load,
  })),
  ...([-5, 5] as const).map((kelvins) => ({
    name: `powder temperature ${kelvins > 0 ? '+' : '−'}5 °C`,
    shotStart: 'assumed' as const,
    adjust: (load: Load, inputs: InputRecord[]) =>
      isAssumed(inputs, 'charge.temperature') ? { ...load, charge: { ...load.charge, temperature: load.charge.temperature + kelvins } } : load,
  })),
  { name: "shot start, low end of GRT's range", shotStart: 'low', adjust: (load) => load },
  { name: "shot start, high end of GRT's range", shotStart: 'high', adjust: (load) => load },
];

export function runConditions(conditions: PressureCondition[], pool: ComponentPool, engines: [Engine, Engine], perturbation: Perturbation = PERTURBATIONS[0]!): ConditionResult[] {
  return conditions.map((condition) => {
    const built = conditionLoad(condition, pool, perturbation.shotStart);
    if ('missing' in built) return { condition, status: 'missing', missing: built.missing };
    const load = perturbation.adjust(built.load, built.inputs);
    const outcomes = engines.map((engine): EngineOutcome => {
      const result = engine.simulate(load);
      return result.ok
        ? { pressure: result.simulation.maxPressure, velocity: result.simulation.muzzleVelocity }
        : { refused: result.problems.map((problem) => problem.code) };
    }) as [EngineOutcome, EngineOutcome];
    const definition = built.load.cartridge.definition;
    return {
      condition,
      status: outcomes.every((outcome) => 'pressure' in outcome) ? 'paired' : 'unpaired',
      inputs: built.inputs,
      limit: { pressure: definition?.maxPressure ?? 0, standard: definition?.standard ?? '' },
      outcomes,
    };
  });
}

/** The statistics of one group of paired conditions. */
export interface GroupSummary {
  group: string;
  /** Pressure log ratios per engine. */
  pressure: [LogRatioSummary | undefined, LogRatioSummary | undefined];
  /** Velocity log ratios per engine. */
  velocity: [LogRatioSummary | undefined, LogRatioSummary | undefined];
  /** L(second) − L(first) at factor 5, the primary comparison; negative favours the second engine. */
  lossDifference: ReturnType<typeof pairedLossDifference>;
  /** The same at the factors 5, 2 and 10, as #31 asks the policy choice to be shown. */
  lossDifferences: Array<[number, ReturnType<typeof pairedLossDifference>]>;
}

type Simulated = { pressure: number; velocity: number };
type Paired = Exclude<ConditionResult, { status: 'missing' }> & { status: 'paired'; outcomes: [Simulated, Simulated] };

function isPaired(result: ConditionResult): result is Paired {
  return result.status === 'paired';
}

export function summarizeGroup(group: string, results: ConditionResult[]): GroupSummary {
  const simulated = results.filter(isPaired);
  const withPressure = simulated.filter((result) => result.condition.pressure);
  const withVelocity = simulated.filter((result) => result.condition.velocity);
  const pressureRatios = (engine: 0 | 1) =>
    withPressure.map((result) => ({ series: result.condition.series, value: logRatio(result.outcomes[engine].pressure, result.condition.pressure!.value) }));
  const velocityRatios = (engine: 0 | 1) =>
    withVelocity.map((result) => ({ series: result.condition.series, value: logRatio(result.outcomes[engine].velocity, result.condition.velocity!.value) }));
  const paired = withPressure.map((result) => ({
    series: result.condition.series,
    first: logRatio(result.outcomes[0].pressure, result.condition.pressure!.value),
    second: logRatio(result.outcomes[1].pressure, result.condition.pressure!.value),
  }));
  const lossDifferences = [5, 2, 10].map((factor): [number, ReturnType<typeof pairedLossDifference>] => [factor, pairedLossDifference(paired, factor)]);
  return {
    group,
    pressure: [summarize(pressureRatios(0)), summarize(pressureRatios(1))],
    velocity: [summarize(velocityRatios(0)), summarize(velocityRatios(1))],
    lossDifference: lossDifferences[0]![1],
    lossDifferences,
  };
}

/**
 * Every group the report shows: by method, then each scored method by source and by pressure band.
 *
 * Conditions whose powder model is known to have been fitted to them are left out of every group and
 * shown apart (issue #31: known overlap is excluded from confirmatory inference). Conditions only
 * suspected of it are shown apart too, and the method's group once more with them included, since the
 * suspicion came from their results (post hoc) and must not decide the comparison on its own.
 */
export function summarizeStudy(results: ConditionResult[], sources: PressureSource[]): GroupSummary[] {
  const methodOfSource = (result: ConditionResult) => sources.find((source) => source.id === result.condition.source)?.method ?? 'not-stated';
  const methodOf = (result: ConditionResult) => methodGroup(methodOfSource(result));
  const fittingOf = (result: ConditionResult) => result.condition.fitting;
  const summaries: GroupSummary[] = [];
  const groups: MethodGroup[] = ['piezoelectric', 'method not stated', 'strain gauge'];
  for (const group of groups) {
    const ofMethod = results.filter((result) => methodOf(result) === group);
    const known = ofMethod.filter((result) => fittingOf(result) === 'known-overlap');
    const suspected = ofMethod.filter((result) => fittingOf(result) === 'suspected-overlap');
    if (known.some(isPaired)) summaries.push(summarizeGroup(`${group}, powder model fitted to these conditions (not evidence)`, known));
    if (suspected.some(isPaired)) {
      summaries.push(summarizeGroup(`${group}, possible fitting overlap only (set apart after seeing the results)`, suspected));
      summaries.push(summarizeGroup(`${group}, including the possible fitting overlap`, ofMethod.filter((result) => fittingOf(result) !== 'known-overlap')));
    }
    const inGroup = ofMethod.filter((result) => fittingOf(result) !== 'known-overlap' && fittingOf(result) !== 'suspected-overlap');
    if (inGroup.length === 0) continue;
    summaries.push(summarizeGroup(group, inGroup));
    // Each publication on its own as well: one laboratory's habits are not another's.
    const ids = [...new Set(inGroup.map((result) => result.condition.source))];
    if (ids.length > 1) {
      for (const id of ids) {
        const fromSource = inGroup.filter((result) => result.condition.source === id);
        if (fromSource.some(isPaired)) summaries.push(summarizeGroup(`${group}, ${id}`, fromSource));
      }
    }
    const bands: PressureBand[] = [NEAR_MAXIMUM, '3,000 bar or more', '2,000–3,000 bar', 'under 2,000 bar'];
    for (const band of bands) {
      const inBand = inGroup.filter(
        (result) =>
          result.status !== 'missing' && result.condition.pressure && pressureBands(result.condition.pressure.value, result.limit, methodOfSource(result)).includes(band),
      );
      if (inBand.some(isPaired)) summaries.push(summarizeGroup(`${group}, ${band}`, inBand));
    }
  }
  return summaries;
}
