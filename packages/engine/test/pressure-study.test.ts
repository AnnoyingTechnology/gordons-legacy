import { grtTraditional, researchEngine, type Engine } from '@gordons-legacy/engine';
import { units } from '@gordons-legacy/formats';
import { describe, expect, it } from 'vitest';
import { conditionLoad } from '../../../tools/validation/pressure/condition-load.ts';
import { communityPool } from '../../../tools/validation/pressure/component-pool.ts';
import { input, type PressureCondition, type PressureSource } from '../../../tools/validation/pressure/conditions.ts';
import { asymmetricLoss, logRatio, pairedLossDifference, summarize } from '../../../tools/validation/pressure/scoring.ts';
import { readRs14Table, readRs14Temperatures } from '../../../tools/validation/pressure/sources/reload-swiss-rs14.ts';
import { hodgdonConditions, readHodgdonRows } from '../../../tools/validation/pressure/sources/hodgdon-m1-garand.ts';
import { readWesternRows } from '../../../tools/validation/pressure/sources/western-powders-8.ts';
import { PERTURBATIONS, runConditions, summarizeStudy } from '../../../tools/validation/pressure/study.ts';
import { PUBLISHED_CONDITIONS, readConditionsFile } from '../../../tools/validation/pressure.ts';

/**
 * The pressure study's machinery (tools/validation/pressure/, issues #22 and #31). Every table below is
 * **made up** in the shape of the makers' documents: the tests exercise the reading and the scoring, and
 * no published figure is reproduced here.
 */

describe('scoring by the #31 protocol', () => {
  it('measures an error as a log ratio, symmetric between twice and half', () => {
    expect(logRatio(2, 1)).toBeCloseTo(-logRatio(0.5, 1), 15);
  });

  it('costs an under-prediction five times an equal over-prediction', () => {
    const r = logRatio(1.1, 1);
    expect(asymmetricLoss(-r)).toBeCloseTo(5 * asymmetricLoss(r), 15);
    expect(asymmetricLoss(-r, 10)).toBeCloseTo(10 * r, 15);
  });

  it('takes a loss per condition, so that a series\' opposite errors do not cancel', () => {
    const summary = summarize([
      { series: 'ladder', value: 0.1 },
      { series: 'ladder', value: -0.1 },
    ])!;
    expect(summary.geometricMeanBias).toBeCloseTo(0, 12);
    expect(summary.meanAbsoluteLogError).toBeCloseTo(0.1, 12);
    expect(summary.loss.factor5).toBeCloseTo((0.1 + 0.5) / 2, 12);
  });

  it('counts a charge series once, however many charges it prints', () => {
    const ladder = [0.1, 0.1, 0.1, 0.1, 0.1].map((value) => ({ series: 'ladder', value }));
    const single = [{ series: 'single', value: -0.1 }];
    const summary = summarize([...ladder, ...single])!;
    expect(summary.conditions).toBe(6);
    expect(summary.series).toBe(2);
    // Two series, one at +0.1 and one at −0.1: the geometric mean bias is nil, not dominated by the ladder.
    expect(summary.geometricMeanBias).toBeCloseTo(0, 12);
    expect(summary.underPredicted).toBe(0.5);
  });

  it('puts a reproducible interval on the paired loss difference by resampling series', () => {
    const values = [
      { series: 'a', first: 0.05, second: -0.1 },
      { series: 'b', first: -0.02, second: -0.15 },
      { series: 'c', first: 0.1, second: 0.02 },
    ];
    const once = pairedLossDifference(values)!;
    expect(once).toEqual(pairedLossDifference(values));
    // The second engine under-reads everywhere the first did not: the loss favours the first.
    expect(once.mean).toBeGreaterThan(0);
    expect(once.low).toBeLessThanOrEqual(once.mean);
    expect(once.high).toBeGreaterThanOrEqual(once.mean);
    expect(once.series).toBe(3);
  });
});

describe("reading the RS14 datasheet's table", () => {
  // Shaped like `pdftotext -layout` output of the sheet's page 2; the figures are invented.
  const SHEET = [
    "Calibre                               Projectile               Primer              Start Load                       Max. Load",
    "38 Special                 120        WC HB          H&N         SP         2.0      150          400        4.0      230          700      30.0",
    "150 mm (1:19'')            150          HP           H&N                    2.5      160          500        4.4      240        1,100      38.0",
    "308 Win.                   200* B416 Subsonic        Lapua      LR         10.0      310        1,800      12.0       340        1,900      66.0",
    "450 mm (1:8'')             240    HPBT MK            Sierra                12.0      280        1,850      12.5       300        2,000      71.0",
    "                Temperature         °C          -30           21           50",
    "                V5 mean             m/s         300          310          320",
    "                Pmax                bar      1,700        1,800        1,850",
    "                Pmax SD             bar          30           40           80",
  ].join('\n');

  it('reads each row with its cartridge, barrel, projectile and both loads', () => {
    const { rows, unread } = readRs14Table(SHEET);
    expect(rows).toHaveLength(4);
    expect(unread).toEqual([]);
    expect(rows[1]).toMatchObject({ cartridge: '38 Special', barrel: "150 mm (1:19'')", mass: 150, type: 'HP', producer: 'H&N' });
    expect(rows[2]).toMatchObject({
      cartridge: '308 Win.',
      barrel: "450 mm (1:8'')",
      producer: 'Lapua',
      start: { charge: 10, velocity: 310, pressure: 1800 },
      maximum: { charge: 12, velocity: 340, pressure: 1900 },
      overallLength: 66,
      temperatureStudy: true,
    });
    // The primer column, printed on a cartridge's first row only, is not taken for the producer.
    expect(rows[0]!.producer).toBe('H&N');
  });

  it('reports a row it cannot read instead of dropping it', () => {
    const { unread } = readRs14Table(`${SHEET}\n308 Win.                   165     RN HS              H&N        LR         8.2      319        1,445      14.2       382`);
    expect(unread).toHaveLength(1);
  });

  it('refuses a temperature study whose rows do not line up', () => {
    expect(() => readRs14Temperatures(SHEET.replace(/ 80$/, ''))).toThrow(/line up/);
  });

  it('reads the temperature study under the table', () => {
    expect(readRs14Temperatures(SHEET)).toEqual([
      { celsius: -30, velocity: 300, pressure: 1700, pressureSd: 30 },
      { celsius: 21, velocity: 310, pressure: 1800, pressureSd: 40 },
      { celsius: 50, velocity: 320, pressure: 1850, pressureSd: 80 },
    ]);
  });
});

describe("reading the Western Powders guide's rows", () => {
  // Shaped like `pdftotext -raw` output, which spaces out every character of a row; invented figures.
  const GUIDE = [
    '300 WINCHESTER SHORT MAGNUM (WSM)',
    'Barrel: 2 4 ” ¦ Tw ist: 1 - 1 0 ” ¦ Primer: WIN WLR M ¦ Bullet D iameter: 0 .3 0 8 ”',
    'Case: WIN ¦ Max Case Length: 2 .1 0 0 ” ¦ Trim Length: 2 .0 9 0 ”',
    'ACCURATE MAGPRO',
    '2 4 0 SIE R R A H PBT MK 6 5 .0 2 , 4 0 0 7 2 .0 2 , 7 0 0 6 4 , 0 0 0 2 .8 6 0 C',
    '1 1 5 (L) LY MA N # 3 1 1 3 5 9 1 2 .4 1 , 8 3 5 1 3 .8 2 , 0 0 5 4 3 , 9 1 2 1 .6 3 5',
    '300 WINCHESTER SHORT MAGNUM (WSM) (continued)',
    'RAMSHOT BIG GAME (continued)',
    '2 0 0 N OSLE R PA R T 5 7 .0 9 5 0 6 2 .0 1 , 0 5 0 6 2 , 0 0 0 2 .8 5 0',
  ].join('\n');

  it('reads a row under its cartridge, powder, barrel and case', () => {
    const [row] = readWesternRows(GUIDE).rows;
    expect(row).toMatchObject({
      cartridge: '300 WINCHESTER SHORT MAGNUM (WSM)',
      powder: 'ACCURATE MAGPRO',
      caseMake: 'WIN',
      mass: 240,
      projectile: 'SIERRAHPBTMK',
      start: { charge: 65, velocity: 2400 },
      maximum: { charge: 72, velocity: 2700, pressure: 64000 },
      overallLength: 2.86,
      compressed: true,
    });
  });

  it('keeps the cartridge across a page break and reads velocities under 1,000 ft/s', () => {
    const { rows } = readWesternRows(GUIDE);
    expect(rows[1]).toMatchObject({ cartridge: '300 WINCHESTER SHORT MAGNUM (WSM)', powder: 'RAMSHOT BIG GAME', start: { velocity: 950 } });
  });

  it('reports, rather than reads, a row whose mould number would be read as a charge', () => {
    const { rows, unread } = readWesternRows(GUIDE);
    expect(rows.map((row) => row.mass)).toEqual([240, 200]);
    expect(unread).toHaveLength(1);
    expect(unread[0]).toContain('LY MA N');
  });
});

describe("reading Hodgdon's M1 Garand sheet", () => {
  // Shaped like `pdftotext -layout` output of the sheet; invented figures.
  const SHEET = [
    '    BULLET          WEIGHT   POWDER     DIA.    OAL      START CHG   START FPS   START PRESS.   PSI/CUP   MAX CHG   MAX FPS   MAX PRESS.   PSI/CUP',
    ' 150 GR. NOS BT      150      Varget    .308"   3.250"      46.0       2,800        42,000       CUP        47.0     2,840      44,000      CUP',
    ' 150 GR. NOS BT      150     IMR 4166   .308"   3.250"      46.5       2,750        49,000        PSI       48.0     2,810      52,000       PSI',
    '165 GR. HDY GMX      165     IMR 4166   .308"   3.225"      45.0       2,600        49,500        PSI       46.0     2,650      52,500       PSI',
    '165 GR. SIE SPBT    165      Varget    .308"   3.300"      46.8        2,718',
  ].join('\n');

  it('reads each row, with the unit of each pressure, and lists a row it cannot read', () => {
    const { rows, unread } = readHodgdonRows(SHEET);
    expect(rows).toHaveLength(3);
    expect(rows[1]).toMatchObject({
      bullet: '150 GR. NOS BT',
      powder: 'IMR 4166',
      overallLength: 3.25,
      start: { charge: 46.5, velocity: 2750, pressure: 49000, unit: 'PSI' },
      maximum: { charge: 48, velocity: 2810, pressure: 52000, unit: 'PSI' },
    });
    expect(unread).toHaveLength(1);
  });

  it('keeps the velocity of a CUP row and never takes its CUP for a pressure', () => {
    const [start] = hodgdonConditions(SHEET).conditions;
    expect(start!.powder).toEqual({ maker: 'Hodgdon', product: 'Varget' });
    expect(start!.pressure).toBeUndefined();
    expect(start!.velocity!.value).toBeCloseTo(2800 * units.FOOT_PER_SECOND, 9);
  });

  it('assumes the barrel, which the sheet does not name, and marks the series the model was fitted to', () => {
    const { conditions } = hodgdonConditions(SHEET);
    expect(conditions[2]!.barrelLength).toMatchObject({ status: 'assumed', value: 24 * units.INCH });
    expect(conditions[2]!.powder).toEqual({ maker: 'IMR', product: '4166' });
    expect(conditions.map((condition) => condition.fitting)).toEqual(["unknown", "unknown", "unknown", "unknown", "suspected-overlap", "suspected-overlap"]);
  });
});

const SOURCE: PressureSource = {
  id: 'invented',
  title: 'Invented test data',
  publisher: 'nobody',
  laboratory: 'none',
  url: '',
  sha256: '',
  method: 'piezo-cip',
  quantity: 'mean-of-shot-peaks',
  methodNote: '',
};

function condition(changes: Partial<PressureCondition> = {}): PressureCondition {
  return {
    id: 'invented/1',
    source: 'invented',
    location: 'nowhere',
    series: 'invented/series',
    caliber: '.308 Win. Lapua #1',
    powder: { maker: 'Reload Swiss', product: 'RS 14' },
    projectile: { name: 'Lapua B416', mass: input(200 * units.GRAIN, 'published', '200 gr'), key: 'lapua-b416-200', construction: 'rifle-jacketed' },
    charge: input(10.5 * units.GRAIN, 'published', '10.5 gr'),
    overallLength: input(66.6 * units.MILLIMETRE, 'published', '66.6 mm'),
    barrelLength: input(0.45, 'published', '450 mm'),
    pressure: input(1900 * units.BAR, 'published', '1900 bar'),
    velocity: input(320, 'published', '320 m/s'),
    fitting: 'unknown',
    ...changes,
  };
}

describe('building the load of a condition', () => {
  const pool = communityPool();

  it('marks what the source gives as published and the rest as assumed', () => {
    const built = conditionLoad(condition(), pool);
    if ('missing' in built) throw new Error(built.missing.join('; '));
    const status = (path: string) => built.inputs.find((record) => record.path === path)?.status;
    expect(status('charge.mass')).toBe('published');
    expect(status('cartridge.overallLength')).toBe('published');
    expect(status('cartridge.caseCapacity')).toBe('assumed');
    expect(status('charge.temperature')).toBe('assumed');
    expect(status('projectile.shotStartPressure')).toBe('assumed');
    expect(built.load.charge.temperature).toBeCloseTo(units.celsiusToKelvin(21), 12);
  });

  it('uses a published capacity and temperature when the source gives them', () => {
    const built = conditionLoad(
      condition({ caseCapacity: input(3.5e-6, 'published', '54 gr H2O'), temperature: input(units.celsiusToKelvin(-30), 'published', '-30 °C') }),
      pool,
    );
    if ('missing' in built) throw new Error(built.missing.join('; '));
    expect(built.load.cartridge.caseCapacity).toBe(3.5e-6);
    expect(built.load.charge.temperature).toBeCloseTo(243.15, 12);
  });

  it('never substitutes a component it does not hold', () => {
    const built = conditionLoad(
      condition({
        caliber: '.308 Win. Nonexistent',
        powder: { maker: 'Nobody', product: 'Nothing' },
        projectile: { name: 'Unknown', mass: input(200 * units.GRAIN, 'published', '200 gr'), key: 'unknown-200', construction: 'rifle-jacketed' },
      }),
      pool,
    );
    expect(built).toEqual({
      missing: [
        'no caliber definition ".308 Win. Nonexistent" in the component pool',
        'no powder model "Nobody Nothing" in the component pool',
        'no length for the projectile "Unknown": not in the specification table, and no projectile "unknown-200" in the component pool',
      ],
    });
  });
});

describe('paired eligibility', () => {
  const pool = communityPool();
  const fixed = (id: string, pressure: number): Engine => ({
    id,
    name: id,
    simulate: () => ({ ok: true, simulation: { maxPressure: pressure, muzzleVelocity: 320 } as never }),
  });
  const refusing: Engine = { id: 'refusing', name: 'refusing', simulate: () => ({ ok: false, problems: [{ code: 'not-modelled', path: '' }] }) };

  it('scores a condition only when both engines simulate it, and keeps the refusal visible', () => {
    const results = runConditions([condition()], pool, [fixed('first', 1900e5), refusing]);
    expect(results[0]).toMatchObject({ status: 'unpaired', outcomes: [{ pressure: 1900e5 }, { refused: ['not-modelled'] }] });
    const [summary] = summarizeStudy(results, [SOURCE]);
    // An engine that refuses the hard loads must not score better on what remains.
    expect(summary!.pressure).toEqual([undefined, undefined]);
  });

  it('compares the two engines on the same paired conditions', () => {
    const results = runConditions([condition()], pool, [fixed('exact', 1900e5), fixed('cool', 1710e5)]);
    const [summary] = summarizeStudy(results, [SOURCE]);
    expect(summary!.group).toBe('piezoelectric');
    expect(summary!.pressure[0]!.geometricMeanBias).toBeCloseTo(0, 10);
    expect(summary!.pressure[1]!.geometricMeanBias).toBeCloseTo(-10, 10);
    expect(summary!.lossDifference!.mean).toBeCloseTo(asymmetricLoss(Math.log(0.9)), 12);
  });

  it('reports conditions the powder model was fitted to apart, never as evidence', () => {
    const fitted = runConditions([condition({ id: 'fitted', series: 'fitted', fitting: 'known-overlap' })], pool, [fixed('a', 1900e5), fixed('b', 1900e5)]);
    const groups = summarizeStudy(fitted, [SOURCE]).map((summary) => summary.group);
    expect(groups).toEqual(['piezoelectric, powder model fitted to these conditions (not evidence)']);
  });

  it('moves only assumed inputs in the sensitivity check', () => {
    const published = condition({ caseCapacity: input(3.5e-6, 'published', '54 gr H2O') });
    const capacities = PERTURBATIONS.map((perturbation) => {
      const built = conditionLoad(published, pool, perturbation.shotStart);
      if ('missing' in built) throw new Error(built.missing.join('; '));
      return perturbation.adjust(built.load, built.inputs).cartridge.caseCapacity;
    });
    expect(new Set(capacities)).toEqual(new Set([3.5e-6]));
  });
});

describe('the published rows, as committed (maintainer, 2026-11-03)', () => {
  // The rows the readers took from the four documents; the results below are those of the PDFs
  // themselves, with the community components alone. A change to an engine or to the study shows here.
  const { sources, conditions } = readConditionsFile(PUBLISHED_CONDITIONS);
  const results = runConditions(conditions, communityPool(), [grtTraditional, researchEngine]);
  const piezoelectric = summarizeStudy(results, sources).find((summary) => summary.group === 'piezoelectric')!;

  it('holds every row of the four documents, each citing its source', () => {
    expect(sources.map((source) => source.id)).toEqual(['reload-swiss-rs14-2023', 'western-powders-8.0', 'hodgdon-m1-garand', 'hodgdon-subsonic']);
    expect(conditions).toHaveLength(12316);
    expect(conditions.every((condition) => sources.some((source) => source.id === condition.source))).toBe(true);
  });

  it('gives the study its results: GRT Traditional over the piezoelectric measurements, R1 under them', () => {
    expect(results.filter((result) => result.status === 'paired')).toHaveLength(22);
    const [grt, research] = piezoelectric.pressure;
    expect(grt!.loss.factor5).toBeCloseTo(0.318, 3);
    expect(research!.loss.factor5).toBeCloseTo(0.805, 3);
    expect(research!.underPredicted).toBe(1);
  });
});
