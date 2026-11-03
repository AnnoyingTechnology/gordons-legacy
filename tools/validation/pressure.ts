/**
 * The pressure study (issues #22 and #31): both engines against published pressure measurements, on
 * identical inputs, scored by the protocol fixed in #31 before any data was seen.
 *
 *     node tools/validation/pressure.ts [--rs14 <RS14 datasheet.pdf>] [--western <Western guide 8.0.pdf>]
 *                                      [--hodgdon-m1 <Hodgdon M1 Garand sheet.pdf>] [--hodgdon-subsonic <Hodgdon subsonic sheet.pdf>]
 *                                      [--conditions <file.json>]... [--components <folder>]...
 *                                      [--details] [--json <results.json>] [--export <conditions.json>]
 *
 * With none of the source options, the study reads `pressure/published-conditions.json`: the rows the
 * readers took from the four documents, each condition citing its source (title, address, SHA-256,
 * date read). Committing them was decided by the maintainer on 2026-11-03; the PDFs are not committed.
 *
 * - `--rs14`, `--western`, `--hodgdon-m1`, `--hodgdon-subsonic`: the makers' PDFs as downloaded from their sites (see `docs/model/pressure-sources.md`).
 *   Their SHA-256 is checked, so that another edition is noticed instead of read wrongly. Reading them
 *   needs `pdftotext` (Poppler) on the path.
 * - `--export`: writes the conditions read, with their sources, in the format `--conditions` reads; this
 *   is how `published-conditions.json` is made again after a reader changes.
 * - `--conditions`: conditions of your own, a JSON array of `PressureCondition` with a `sources` list
 *   (`{ "sources": [...], "conditions": [...] }`).
 * - `--components`: a folder of GRT files (`.grtload`, `.caliber`, `.propellant`, `.projectile`) whose
 *   components join the community corpus. They stay on your machine; `not_mine` folders are skipped.
 * - `--details`: every condition with its inputs and both engines' results.
 * - `--json`: the derived results (log ratios, statuses, input provenance), without the published values.
 *
 * Velocity agreement alone never qualifies an engine: a model can match velocities with pressures that
 * are too low. And no result here says a load is safe: it compares two simulators with a few published
 * measurements under the stated conditions.
 */
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { grtTraditional, researchEngine, type Engine } from '@gordons-legacy/engine';
import { units } from '@gordons-legacy/formats';
import { addLocalFiles, communityPool, type ComponentPool } from './pressure/component-pool.ts';
import type { PressureCondition, PressureSource } from './pressure/conditions.ts';
import { logRatio, type LogRatioSummary } from './pressure/scoring.ts';
import { HODGDON_M1_SOURCE, hodgdonConditions } from './pressure/sources/hodgdon-m1-garand.ts';
import { HODGDON_SUBSONIC_SOURCE, subsonicConditions } from './pressure/sources/hodgdon-subsonic.ts';
import { RS14_SOURCE, rs14Conditions } from './pressure/sources/reload-swiss-rs14.ts';
import { WESTERN_8_SOURCE, westernConditions } from './pressure/sources/western-powders-8.ts';
import { PERTURBATIONS, runConditions, summarizeStudy, type ConditionResult, type GroupSummary } from './pressure/study.ts';

const ENGINES: [Engine, Engine] = [grtTraditional, researchEngine];

interface Arguments {
  rs14?: string;
  western?: string;
  hodgdonM1?: string;
  hodgdonSubsonic?: string;
  conditions: string[];
  components: string[];
  details: boolean;
  json?: string;
  export?: string;
}

/** The committed rows of the four documents, read when no document is given. */
export const PUBLISHED_CONDITIONS = new URL('./pressure/published-conditions.json', import.meta.url);

function parseArguments(args: string[]): Arguments {
  const parsed: Arguments = { conditions: [], components: [], details: false };
  for (let index = 0; index < args.length; index++) {
    const value = args[index + 1];
    switch (args[index]) {
      case '--rs14':
        if (value) parsed.rs14 = value;
        index++;
        break;
      case '--western':
        if (value) parsed.western = value;
        index++;
        break;
      case '--hodgdon-m1':
        if (value) parsed.hodgdonM1 = value;
        index++;
        break;
      case '--hodgdon-subsonic':
        if (value) parsed.hodgdonSubsonic = value;
        index++;
        break;
      case '--conditions':
        if (value) parsed.conditions.push(value);
        index++;
        break;
      case '--components':
        if (value) parsed.components.push(value);
        index++;
        break;
      case '--json':
        if (value) parsed.json = value;
        index++;
        break;
      case '--export':
        if (value) parsed.export = value;
        index++;
        break;
      case '--details':
        parsed.details = true;
        break;
      default:
        throw new Error(`unknown argument ${args[index]}`);
    }
  }
  return parsed;
}

/** The text of a maker's PDF, after checking it is the edition the reader was written for. */
function documentText(path: string, source: PressureSource, mode: '-layout' | '-raw'): string {
  const hash = createHash('sha256').update(readFileSync(path)).digest('hex');
  if (hash !== source.sha256) {
    throw new Error(`${path} is not the document ${source.id} was read from (SHA-256 ${hash}, expected ${source.sha256}). Check the edition before reading it.`);
  }
  return execFileSync('pdftotext', [mode, path, '-'], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
}

/** A conditions file: `{ sources, conditions }`, as `--export` writes it. */
export function readConditionsFile(path: string | URL): { sources: PressureSource[]; conditions: PressureCondition[] } {
  return JSON.parse(readFileSync(path, 'utf8')) as { sources: PressureSource[]; conditions: PressureCondition[] };
}

function percent(summary: LogRatioSummary | undefined, field: 'geometricMeanBias' | 'lowest' | 'median' | 'highest'): string {
  return summary ? `${summary[field] >= 0 ? '+' : ''}${summary[field].toFixed(1)} %` : '—';
}

function printGroup(summary: GroupSummary): void {
  const [first, second] = summary.pressure;
  const counted = first ?? second;
  console.log(`\n${summary.group}: ${counted?.conditions ?? 0} conditions in ${counted?.series ?? 0} series`);
  ENGINES.forEach((engine, index) => {
    const pressure = summary.pressure[index];
    const velocity = summary.velocity[index];
    console.log(
      `  ${engine.name.padEnd(22)} pressure: bias ${percent(pressure, 'geometricMeanBias').padStart(8)}, ` +
        `median ${percent(pressure, 'median').padStart(8)}, range ${percent(pressure, 'lowest')} to ${percent(pressure, 'highest')}, ` +
        `under-predicted in ${pressure ? (pressure.underPredicted * 100).toFixed(0) : '—'} % of series, ` +
        `loss L5 ${pressure ? pressure.loss.factor5.toFixed(3) : '—'} (L2 ${pressure ? pressure.loss.factor2.toFixed(3) : '—'}, L10 ${pressure ? pressure.loss.factor10.toFixed(3) : '—'}), ` +
        `mean |log error| ${pressure ? pressure.meanAbsoluteLogError.toFixed(3) : '—'}` +
        `\n  ${''.padEnd(22)} velocity: bias ${percent(velocity, 'geometricMeanBias').padStart(8)}, median ${percent(velocity, 'median').padStart(8)}`,
    );
  });
  for (const [factor, difference] of summary.lossDifferences) {
    if (!difference) continue;
    console.log(
      `  paired L${factor}(${ENGINES[1].name}) − L${factor}(${ENGINES[0].name}): ${difference.mean.toFixed(3)}, ` +
        `exploratory 95 % interval over ${difference.series} series ${difference.low.toFixed(3)} to ${difference.high.toFixed(3)} (negative favours ${ENGINES[1].name})`,
    );
  }
}

/**
 * Each scored group's comparison again with every assumed input moved, on the conditions both engines
 * simulate in the baseline **and** in the variant, so that a change of eligibility can't pass for a
 * change of result. An interval that comes to include zero is not a reversal: the point estimate is.
 */
function printSensitivity(conditions: PressureCondition[], pool: ComponentPool, sources: PressureSource[], baseline: ConditionResult[]): void {
  console.log('\nSensitivity to the assumed inputs (one at a time; published inputs never change; whole groups only):');
  const pairedIds = new Set(baseline.filter((result) => result.status === 'paired').map((result) => result.condition.id));
  const rows = PERTURBATIONS.map((perturbation) => {
    const results = runConditions(conditions, pool, ENGINES, perturbation);
    const common = results.filter((result) => result.status === 'paired' && pairedIds.has(result.condition.id));
    return {
      name: perturbation.name,
      lost: pairedIds.size - common.length,
      summaries: summarizeStudy(common, sources).filter((summary) => !summary.group.includes(',')),
    };
  });
  for (const group of rows[0]!.summaries.map((summary) => summary.group)) {
    console.log(`  ${group}:`);
    for (const { name, lost, summaries } of rows) {
      const summary = summaries.find((candidate) => candidate.group === group);
      if (!summary) continue;
      const bias = summary.pressure.map((pressure) => percent(pressure, 'geometricMeanBias').padStart(8)).join('  ');
      const difference = summary.lossDifference ? `${summary.lossDifference.mean.toFixed(3)} (${summary.lossDifference.low.toFixed(3)} to ${summary.lossDifference.high.toFixed(3)})` : '—';
      const dropped = lost > 0 ? `  (${lost} baseline conditions no longer paired)` : '';
      console.log(`    ${name.padEnd(40)} pressure bias ${bias}   paired L5 difference ${difference}${dropped}`);
    }
  }
}

function printDetails(results: ConditionResult[]): void {
  for (const result of results) {
    console.log(`\n${result.condition.id} (${result.condition.location})`);
    if (result.status === 'missing') {
      for (const reason of result.missing) console.log(`  missing: ${reason}`);
      continue;
    }
    for (const input of result.inputs) console.log(`  ${input.status.padEnd(13)} ${input.path}: ${input.note}`);
    result.outcomes.forEach((outcome, index) => {
      const name = ENGINES[index]!.name.padEnd(22);
      if ('refused' in outcome) return console.log(`  ${name} refused: ${outcome.refused.join(', ')}`);
      const pressure = result.condition.pressure ? ` (${signed(logRatio(outcome.pressure, result.condition.pressure.value))})` : '';
      const velocity = result.condition.velocity ? ` (${signed(logRatio(outcome.velocity, result.condition.velocity.value))})` : '';
      console.log(`  ${name} ${(outcome.pressure / units.BAR).toFixed(0)} bar${pressure}, ${outcome.velocity.toFixed(0)} m/s${velocity}`);
    });
  }
}

function signed(r: number): string {
  const value = 100 * (Math.exp(r) - 1);
  return `${value >= 0 ? '+' : ''}${value.toFixed(1)} %`;
}

/** The derived results only: what each engine got relative to the measurement, never the measurement. */
function derivedResults(results: ConditionResult[], summaries: GroupSummary[]) {
  return {
    engines: ENGINES.map((engine) => engine.id),
    conditions: results.map((result) => ({
      id: result.condition.id,
      series: result.condition.series,
      status: result.status,
      ...(result.status === 'missing'
        ? { missing: result.missing }
        : {
            inputs: result.inputs.map(({ path, status }) => ({ path, status })),
            pressureLogRatio: result.outcomes.map((outcome) => ('pressure' in outcome && result.condition.pressure ? logRatio(outcome.pressure, result.condition.pressure.value) : null)),
            velocityLogRatio: result.outcomes.map((outcome) => ('velocity' in outcome && result.condition.velocity ? logRatio(outcome.velocity, result.condition.velocity.value) : null)),
            refused: result.outcomes.map((outcome) => ('refused' in outcome ? outcome.refused : null)),
          }),
    })),
    summaries,
  };
}

function main(): void {
  const args = parseArguments(process.argv.slice(2));
  let pool: ComponentPool = communityPool();
  for (const folder of args.components) pool = addLocalFiles(pool, folder);

  const sources: PressureSource[] = [];
  const conditions: PressureCondition[] = [];
  const unread: string[] = [];
  const read = (source: PressureSource, extracted: { conditions: PressureCondition[]; unread: string[] }) => {
    sources.push(source);
    conditions.push(...extracted.conditions);
    unread.push(...extracted.unread.map((line) => `${source.id}, ${line}`));
    console.log(`${source.id}: ${extracted.conditions.length} conditions read, ${extracted.unread.length} row-like lines not read`);
  };
  if (args.rs14) read(RS14_SOURCE, rs14Conditions(documentText(args.rs14, RS14_SOURCE, '-layout')));
  if (args.western) read(WESTERN_8_SOURCE, westernConditions(documentText(args.western, WESTERN_8_SOURCE, '-raw')));
  if (args.hodgdonM1) read(HODGDON_M1_SOURCE, hodgdonConditions(documentText(args.hodgdonM1, HODGDON_M1_SOURCE, '-layout')));
  if (args.hodgdonSubsonic) read(HODGDON_SUBSONIC_SOURCE, subsonicConditions(documentText(args.hodgdonSubsonic, HODGDON_SUBSONIC_SOURCE, '-layout')));
  const fromDocuments = Boolean(args.rs14 || args.western || args.hodgdonM1 || args.hodgdonSubsonic);
  if (args.export) {
    // One condition a line: 12,000 rows indented would be 17 MB, and a re-export still diffs row by row.
    const lines = conditions.map((condition) => JSON.stringify(condition));
    writeFileSync(args.export, `{"sources":${JSON.stringify(sources, null, 2)},\n"conditions":[\n${lines.join(',\n')}\n]}\n`);
    console.log(`${conditions.length} conditions from ${sources.length} documents written to ${args.export}`);
  }
  const files = !fromDocuments && args.conditions.length === 0 ? [PUBLISHED_CONDITIONS] : args.conditions;
  for (const path of files) {
    const file = readConditionsFile(path);
    sources.push(...file.sources);
    conditions.push(...file.conditions);
    if (path === PUBLISHED_CONDITIONS) console.log(`published-conditions.json: ${file.conditions.length} conditions from ${file.sources.map((source) => source.id).join(', ')}`);
  }
  if (conditions.length === 0) {
    console.error('No conditions: give --rs14, --western, --hodgdon-m1, --hodgdon-subsonic or --conditions (see the comment at the top of this file).');
    process.exitCode = 1;
    return;
  }

  const results = runConditions(conditions, pool, ENGINES);
  const summaries = summarizeStudy(results, sources);
  const count = (status: ConditionResult['status']) => results.filter((result) => result.status === status).length;
  console.log(`Pressure study: ${conditions.length} conditions from ${sources.map((source) => source.id).join(', ')}`);
  console.log(`  paired (both engines simulate them): ${count('paired')}`);
  console.log(`  unpaired (one engine refuses; never scored, since that would reward refusing): ${count('unpaired')}`);
  console.log(`  missing (a component or input we don't have): ${count('missing')}`);
  console.log(`R1's pressure is its breech pressure; GRT Traditional's is its single chamber pressure.`);
  for (const summary of summaries) printGroup(summary);

  const reasons = new Map<string, number>();
  for (const result of results) if (result.status === 'missing') for (const reason of result.missing) reasons.set(reason, (reasons.get(reason) ?? 0) + 1);
  if (reasons.size > 0) {
    console.log('\nWhy conditions are missing:');
    for (const [reason, times] of [...reasons].sort((a, b) => b[1] - a[1])) console.log(`  ${String(times).padStart(3)} × ${reason}`);
  }
  printSensitivity(conditions, pool, sources, results);
  if (args.details) {
    if (unread.length > 0) console.log(`\nRow-like lines not read:\n${unread.map((line) => `  ${line}`).join('\n')}`);
    printDetails(results);
  }
  if (args.json) writeFileSync(args.json, `${JSON.stringify(derivedResults(results, summaries), null, 2)}\n`);
}

if (import.meta.main) main();
