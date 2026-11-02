import { describe, expect, it } from 'vitest';
import { listings, modelFromTitle, modelPages, readPage } from '../../../tools/data/firearms/barrett.ts';

/**
 * Reading Barrett's published rifle specifications (tools/data/firearms/barrett.ts, issue #30). The
 * pages below are in the shape of Barrett's model pages — one spec container per barrel configuration,
 * one spec list per chambering — with invented figures.
 *
 * What this maker's shape costs: a configuration is named by a code (`fluted`, `heavy`) or by its barrel
 * length (`29`); a list may print several barrels for one chambering, separated by line breaks, which is
 * a choice and not a gun; and figures carry their millimetres beside the inches.
 */
function spec(figures: Record<string, string>): string {
  const items = Object.entries(figures)
    .map(([name, value]) => `<li class="${name}"><span class="spec-title">${name}</span>${value}</li>`)
    .join(' ');
  return `<li class="spec-listing clearfix"> <ul class="spec-list clearfix"> ${items} </ul> </li>`;
}

function page(title: string, containers: Record<string, Array<Record<string, string>>>): string {
  const body = Object.entries(containers)
    .map(([name, specs]) => `<ul class="spec-container " name="${name}" > ${specs.map(spec).join(' ')} </ul>`)
    .join(' </div> <div> ');
  return `<html><head><title>${title} - Barrett Firearms</title></head><body><div>${body}</div></body></html>`;
}

const MODEL = page('EXAMPLE&reg;', {
  fluted: [
    { caliber: '338 Lapua Magnum', barrel: '26" (660 mm)', twist: '1 : 9.4" (240 mm)', weight: '14.5 lbs (6.6 kg)' },
    { caliber: '338 Lapua Magnum', barrel: '20" (508 mm)<br /> 24" (609.6 mm)', twist: '1 : 9.4"', weight: '12.9 lbs<br /> 13.9 lbs' },
  ],
  heavy: [{ caliber: '308 Winchester', barrel: '17" (432 mm)', twist: '1 : 10" (254 mm)', weight: '12.1 lbs (5.48 kg)' }],
});

function readingsOf(markup: string) {
  return readPage(markup, 'https://example.invalid/products/firearms/example/', '2026-11-02');
}

describe("reading Barrett's model pages", () => {
  it('reads every chambering of every configuration, line breaks kept apart', () => {
    const found = listings(MODEL);
    expect(found.map((listing) => listing.configuration)).toEqual(['fluted', 'fluted', 'heavy']);
    expect(found[1]!.figures.get('barrel')).toBe('20" (508 mm) / 24" (609.6 mm)');
  });

  it('names each gun with its configuration, the finer of two printed figures kept', () => {
    const guns = readingsOf(MODEL).flatMap((reading) => ('firearm' in reading ? [reading.firearm] : []));
    expect(modelFromTitle(MODEL)).toBe('EXAMPLE');
    expect(guns.map((gun) => gun.name)).toEqual(['Barrett EXAMPLE 338 Lapua Magnum (fluted)', 'Barrett EXAMPLE 308 Winchester (heavy)']);
    expect(guns[0]!.barrel.length).toBeCloseTo(0.66, 9);
    // The twist is read from its inches, the ratio's own unit.
    expect(guns[0]!.barrel.twistLength).toBeCloseTo(9.4 * 0.0254, 9);
    expect(guns[1]!.barrel.gunMass).toBeCloseTo(5.48, 9);
  });

  it('leaves out a chambering sold with several barrels', () => {
    const reasons = readingsOf(MODEL).flatMap((reading) => ('skipped' in reading ? [reading.skipped] : []));
    expect(reasons).toEqual(['EXAMPLE (fluted) 338 Lapua Magnum: no single barrel length (20" (508 mm) / 24" (609.6 mm))']);
  });

  it('names a configuration given as a barrel length by its inches', () => {
    const guns = readingsOf(
      page('M99', { '29': [{ caliber: '50 BMG', barrel: '29" (737 mm)' }], '20': [{ caliber: '50 BMG', barrel: '20" (523 mm)' }] }),
    ).flatMap((reading) => ('firearm' in reading ? [reading.firearm] : []));
    expect(guns.map((gun) => gun.name).sort()).toEqual(['Barrett M99 50 BMG 20"', 'Barrett M99 50 BMG 29"']);
  });

  it('finds the model pages by the home page links', () => {
    expect(modelPages('<a href="https://barrett.net/products/firearms/model-99/">99</a><a href="https://barrett.net/products/accessories/">A</a>')).toEqual([
      'https://barrett.net/products/firearms/model-99/',
    ]);
  });
});
