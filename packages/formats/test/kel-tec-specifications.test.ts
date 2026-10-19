import { describe, expect, it } from 'vitest';
import { models, readPage } from '../../../tools/data/firearms/kel-tec.ts';

/**
 * Reading a maker's published specifications (tools/data/firearms/kel-tec.ts, issue #30). The pages below
 * are in the shape Kel-Tec's firearm pages are — a block per model, each with a heading and a list of
 * specifications whose figure is printed twice, in inches or ounces and then in millimetres or grams —
 * with invented figures.
 *
 * What this maker's shape costs: the record keeps both printed strings with a `|` between them rather
 * than choosing one, and takes the figure printed to the finer step; their metric twist contradicts
 * their imperial one (`1:7 | 1:356 mm` is a turn in 7" and a turn in 14"), so a twist that disagrees
 * with itself is left out; and the integrally suppressed carbine prints its barrel as `OAL 16.2",
 * Rifled 4.25"`, where neither figure is the barrel the engine means.
 */
function specification(label: string, standard: string, metric: string): string {
  return `<div class="specification"><label>${label}</label>
    <p class="specification__standard">${standard}</p>
    <p class="specification__metric">${metric}</p></div>`;
}

function model(heading: string, rows: Array<[string, string, string]>): string {
  return `<div class="model">${rows.map(([label, standard, metric]) => specification(label, standard, metric)).join('')}<h3>${heading}</h3></div>`;
}

const BLACK = model('EX-3AT &#8211; Black', [
  ['Caliber', '.380 Auto', ''],
  ['Weight (Unloaded)', '9.66 oz', '273.9 g'],
  ['Barrel Length', '2.68&quot;', '68mm'],
]);
const CARBINE = model('EX-9 Carbine', [
  ['Caliber', '9mm Luger', ''],
  ['Weight (Unloaded)', '5.1 lbs', '2.3 kg'],
  ['Barrel Length', '16.1&quot;', '409mm'],
  ['Twist', '1:10&quot;', '1:254 mm'],
]);
const PAGE = `<html><body><h1>Example Firearms</h1>${BLACK}${CARBINE}</body></html>`;

const URL = 'https://example.invalid/firearm/pistols/ex-3at/';

function gunsOf(markup: string) {
  return new Map(
    readPage(markup, URL, '2026-10-19').flatMap((reading) => ('firearm' in reading ? [[reading.firearm.name, reading.firearm] as const] : [])),
  );
}

function reasonsOf(markup: string): string[] {
  return readPage(markup, URL, '2026-10-19').flatMap((reading) => ('skipped' in reading ? [reading.skipped] : []));
}

describe('reading a published specification', () => {
  it('reads each model of a page with its own specifications', () => {
    const listed = models(PAGE);
    expect(listed.map((entry) => entry.heading)).toEqual(['EX-3AT – Black', 'EX-9 Carbine']);
    expect(listed[0]!.specifications).toEqual([
      { label: 'Caliber', standard: '.380 Auto', metric: '' },
      { label: 'Weight (Unloaded)', standard: '9.66 oz', metric: '273.9 g' },
      { label: 'Barrel Length', standard: '2.68"', metric: '68mm' },
    ]);
    expect(models('<html><body>a holster</body></html>')).toEqual([]);
  });

  it('writes one gun per model, keeping both printed strings and the finer figure', () => {
    const guns = gunsOf(PAGE);
    const pistol = guns.get('Kel-Tec EX-3AT – Black');
    expect(pistol?.cartridge).toBe('.380 Auto');
    expect(pistol?.barrel.length).toBe(0.068072); // the inch column: a hundredth of an inch is finer than the whole millimetre beside it
    expect(pistol?.barrel.gunMass).toBe(0.2739); // and here the gram column wins: a tenth of a gram is finer than a hundredth of an ounce
    expect(pistol?.source?.published).toMatchObject({ caliber: '.380 Auto', barrelLength: '2.68" | 68mm', weight: '9.66 oz | 273.9 g' });
    expect(pistol?.source).toMatchObject({ kind: 'published', publisher: 'Kel-Tec CNC Industries, Inc.', url: URL, massBasis: 'unstated' });
  });

  it('reads a twist where the two columns agree', () => {
    expect(gunsOf(PAGE).get('Kel-Tec EX-9 Carbine')?.barrel.twistLength).toBe(0.254);
    expect(gunsOf(PAGE).get('Kel-Tec EX-9 Carbine')?.source?.published).toMatchObject({ twist: '1:10" | 1:254 mm' });
  });

  it('reads no twist where the two columns contradict each other', () => {
    // `1:7 | 1:356 mm`: a turn in 7 inches is 178 mm, so one of the two is wrong and neither is taken.
    const disagreeing = `<html><body>${model('EX-11', [['Caliber', '5.56 NATO'], ['Weight (Unloaded)', '5.0 lbs', '2.3 kg'], ['Barrel Length', '16.1&quot;', '409mm'], ['Twist', '1:7', '1:356 mm']] as Array<[string, string, string]>)}</body></html>`;
    const gun = gunsOf(disagreeing).get('Kel-Tec EX-11');
    expect(gun?.barrel.twistLength).toBeUndefined();
    expect(gun?.source?.published).toMatchObject({ twist: '1:7 | 1:356 mm' }); // the page's words, kept for the reader
  });

  it('says a mass is loaded where the page publishes no other', () => {
    const loadedOnly = `<html><body>${model('EX-15', [['Caliber', '9mm Luger'], ['Weight (Loaded)', '3.0 lbs', '1.4 kg'], ['Barrel Length', '4.5&quot;', '114mm']] as Array<[string, string, string]>)}</body></html>`;
    expect(gunsOf(loadedOnly).get('Kel-Tec EX-15')?.source?.massBasis).toBe('loaded');
  });

  it('leaves out a shotgun, a rimfire and a barrel that is a barrel and a suppressor', () => {
    const others = `<html><body>
      ${model('EX-S12', [['Caliber', '12 Gauge'], ['Barrel Length', '18.5&quot;', '470mm']] as Array<[string, string, string]>)}
      ${model('EX-30 WMR', [['Caliber', '.22 WMR'], ['Barrel Length', '16.1&quot;', '409mm']] as Array<[string, string, string]>)}
      ${model('EX CQB', [['Caliber', '9mm Luger'], ['Barrel Length', 'OAL 16.2&quot;, Rifled 4.25&quot;', '']] as Array<[string, string, string]>)}
    </body></html>`;
    expect(reasonsOf(others)).toEqual([
      'EX-S12: no loadable cartridge (12 Gauge)',
      'EX-30 WMR: no loadable cartridge (.22 WMR)',
      'EX CQB: no barrel length printed',
    ]);
    expect(reasonsOf('<html><body>a magazine</body></html>')).toEqual(['no model with specifications']);
  });
});
