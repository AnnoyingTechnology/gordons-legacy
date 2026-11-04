/**
 * Writes the table of what the pressure study has seen of each powder model, for the application to
 * show beside a load (packages/app/src/analysis/pressure-evidence.ts):
 *
 *     node tools/validation/pressure-evidence.ts
 *
 * It runs the study on the committed published rows with the community components alone, as the
 * application has them, and keeps the piezoelectric conditions both engines simulate: crusher readings
 * are no pressure, and a source that states no method is not scored either (issue #31's protocol).
 * Run it again after the study's inputs change; a test fails while the table is out of date.
 */
import { writeFileSync } from 'node:fs';
import { grtTraditional, researchEngine, type Engine } from '@gordons-legacy/engine';
import { powderModelKey, type PressureEvidence, type PressureEvidenceTable } from '../../packages/app/src/analysis/pressure-evidence.ts';
import { communityPool, findPowder, type ComponentPool } from './pressure/component-pool.ts';
import type { PressureCondition, PressureSource } from './pressure/conditions.ts';
import { runConditions } from './pressure/study.ts';
import { PUBLISHED_CONDITIONS, readConditionsFile } from './pressure.ts';

export const EVIDENCE_TABLE = new URL('../../packages/app/src/data/pressure-evidence.json', import.meta.url);

const ENGINES: [Engine, Engine] = [grtTraditional, researchEngine];

/** The study's record of each engine against each powder model it could simulate. */
export function evidenceTable(conditions: PressureCondition[], sources: PressureSource[], pool: ComponentPool): PressureEvidenceTable {
  const piezo = new Set(sources.filter((source) => source.method.startsWith('piezo')).map((source) => source.id));
  const titles = new Map(sources.map((source) => [source.id, source.title]));
  const models = new Map<string, { maker: string; product: string; ratios: number[][]; series: Set<string>; sources: Set<string> }>();
  for (const result of runConditions(conditions, pool, ENGINES)) {
    if (result.status !== 'paired' || !piezo.has(result.condition.source) || !result.condition.pressure) continue;
    const powder = findPowder(pool, result.condition.powder.maker, result.condition.powder.product);
    if (!('found' in powder)) continue;
    const key = powderModelKey(powder.found.value);
    const model = models.get(key) ?? { maker: powder.found.value.maker, product: powder.found.value.product, ratios: [], series: new Set(), sources: new Set() };
    const measured = result.condition.pressure.value;
    model.ratios.push(result.outcomes.map((outcome) => ('pressure' in outcome ? outcome.pressure / measured : Number.NaN)));
    model.series.add(result.condition.series);
    model.sources.add(titles.get(result.condition.source) ?? result.condition.source);
    models.set(key, model);
  }
  const statistics = (ratios: number[]): Pick<PressureEvidence, 'conditions' | 'bias' | 'lowest' | 'highest'> => ({
    conditions: ratios.length,
    bias: round(Math.exp(ratios.reduce((sum, ratio) => sum + Math.log(ratio), 0) / ratios.length) - 1),
    lowest: round(Math.min(...ratios) - 1),
    highest: round(Math.max(...ratios) - 1),
  });
  return {
    note: 'Made by tools/validation/pressure-evidence.ts from tools/validation/pressure/published-conditions.json.gz; piezoelectric conditions both engines simulate, community components alone.',
    models: [...models.entries()]
      .sort(([, a], [, b]) => `${a.maker} ${a.product}`.localeCompare(`${b.maker} ${b.product}`))
      .map(([key, model]) => ({
        key,
        maker: model.maker,
        product: model.product,
        engines: Object.fromEntries(
          ENGINES.map((engine, index) => [
            engine.id,
            { ...statistics(model.ratios.map((ratios) => ratios[index]!)), series: model.series.size, sources: [...model.sources].sort() },
          ]),
        ),
      })),
  };
}

/** Four significant figures: enough for a percentage shown to one decimal, and a stable file. */
function round(value: number): number {
  return Number(value.toPrecision(4));
}

/** The table as the file holds it. */
export function evidenceText(table: PressureEvidenceTable): string {
  return `${JSON.stringify(table, null, 2)}\n`;
}

function main(): void {
  const { conditions, sources } = readConditionsFile(PUBLISHED_CONDITIONS);
  const table = evidenceTable(conditions, sources, communityPool());
  writeFileSync(EVIDENCE_TABLE, evidenceText(table));
  for (const model of table.models) {
    const grt = model.engines[grtTraditional.id]!;
    console.log(`${model.maker} ${model.product}: ${grt.conditions} conditions in ${grt.series} series, GRT Traditional ${(grt.bias * 100).toFixed(1)} %`);
  }
}

if (import.meta.main) main();
