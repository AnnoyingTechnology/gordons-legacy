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

/**
 * The study's records of each engine against each powder model it could simulate, one per document.
 * The mean counts each charge series once (the mean of the series' mean log ratios), as the study does;
 * the range is over single conditions.
 */
export function evidenceTable(conditions: PressureCondition[], sources: PressureSource[], pool: ComponentPool): PressureEvidenceTable {
  const piezo = new Set(sources.filter((source) => source.method.startsWith('piezo')).map((source) => source.id));
  const titles = new Map(sources.map((source) => [source.id, source.title]));
  // Model → document → series → the conditions' ratios, one per engine.
  const models = new Map<string, { maker: string; product: string; documents: Map<string, Map<string, number[][]>> }>();
  for (const result of runConditions(conditions, pool, ENGINES)) {
    if (result.status !== 'paired' || !piezo.has(result.condition.source) || !result.condition.pressure) continue;
    const powder = findPowder(pool, result.condition.powder.maker, result.condition.powder.product);
    if (!('found' in powder)) continue;
    const key = powderModelKey(powder.found.value);
    const model = models.get(key) ?? { maker: powder.found.value.maker, product: powder.found.value.product, documents: new Map() };
    const title = titles.get(result.condition.source) ?? result.condition.source;
    const document = model.documents.get(title) ?? new Map<string, number[][]>();
    const measured = result.condition.pressure.value;
    const ratios = result.outcomes.map((outcome) => ('pressure' in outcome ? outcome.pressure / measured : Number.NaN));
    document.set(result.condition.series, [...(document.get(result.condition.series) ?? []), ratios]);
    model.documents.set(title, document);
    models.set(key, model);
  }
  const record = (source: string, series: number[][][], engine: number): PressureEvidence => {
    const ratios = series.flat().map((ratios) => ratios[engine]!);
    const seriesMeans = series.map((conditions) => conditions.reduce((sum, ratios) => sum + Math.log(ratios[engine]!), 0) / conditions.length);
    return {
      source,
      conditions: ratios.length,
      series: series.length,
      bias: round(Math.exp(seriesMeans.reduce((sum, mean) => sum + mean, 0) / seriesMeans.length) - 1),
      lowest: round(Math.min(...ratios) - 1),
      highest: round(Math.max(...ratios) - 1),
    };
  };
  return {
    note: 'Made by tools/validation/pressure-evidence.ts from tools/validation/pressure/published-conditions.json.gz; piezoelectric conditions both engines simulate, community components alone; one record per document, each charge series counted once in the mean.',
    models: [...models.entries()]
      .sort(([, a], [, b]) => `${a.maker} ${a.product}`.localeCompare(`${b.maker} ${b.product}`))
      .map(([key, model]) => ({
        key,
        maker: model.maker,
        product: model.product,
        engines: Object.fromEntries(
          ENGINES.map((engine, index) => [
            engine.id,
            [...model.documents.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([source, series]) => record(source, [...series.values()], index)),
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
    for (const record of model.engines[grtTraditional.id]!) {
      console.log(`${model.maker} ${model.product}, ${record.source}: ${record.conditions} conditions in ${record.series} series, GRT Traditional ${(record.bias * 100).toFixed(1)} %`);
    }
  }
}

if (import.meta.main) main();
