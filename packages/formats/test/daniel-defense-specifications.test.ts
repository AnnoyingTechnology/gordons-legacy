import { describe, expect, it } from 'vitest';
import { barrelLine, productPages, readPage, specificationTable } from '../../../tools/data/firearms/daniel-defense.ts';

/**
 * Reading Daniel Defense's published specifications (tools/data/firearms/daniel-defense.ts, issue #30).
 * The pages below are in the shape of the shop's product pages — Magento's "More Information" table and
 * a build list — with invented guns and figures.
 *
 * What this maker's shape costs: a barrel's page prints `Caliber` and `Barrel Length` like a rifle's, so
 * only the `Magazine` row tells a gun; the twist is in the build list's `BARREL:` line, except on the
 * DELTA 5 PRO pages, which print it in the barrel's cell (`24" 1:8"`); some titles carry the shop's name
 * twice; and a discontinued product keeps its table but loses its name.
 */
function productPage(title: string, rows: Record<string, string>, build: string[] = []): string {
  const table = Object.entries(rows)
    .map(([label, value]) => `<tr><th class="col label" scope="row">${label}</th><td class="col data" data-th="${label}">${value}</td></tr>`)
    .join(' ');
  return `<html><head><title>${title} | Daniel Defense</title></head><body>
    <div class="description">${build.map((line) => `<p>${line}</p>`).join('')}</div>
    <table class="additional-attributes">${table}</table></body></html>`;
}

const CARBINE = productPage(
  'Daniel Defense, M4, Carbine, Example, 5.56',
  { Caliber: '5.56mm NATO', 'Barrel Length': '16&quot;', 'Product Weight': '6.2 LBS', Magazine: 'DD Magazine' },
  ['BARREL: Chrome Moly Vanadium Steel, Cold Hammer Forged, 1:7 Twist, 16" Government Profile'],
);

function readingsOf(markup: string) {
  return readPage(markup, 'https://example.invalid/example.html', '2026-11-02');
}

function gunOf(markup: string) {
  const reading = readingsOf(markup)[0];
  return reading !== undefined && 'firearm' in reading ? reading.firearm : undefined;
}

function reasonOf(markup: string) {
  const reading = readingsOf(markup)[0];
  return reading !== undefined && 'skipped' in reading ? reading.skipped : undefined;
}

describe("reading Daniel Defense's product pages", () => {
  it('reads the specification table and the build list', () => {
    expect(specificationTable(CARBINE).get('barrel length')).toBe('16"');
    expect(barrelLine(CARBINE)).toMatch(/^BARREL: .*1:7 Twist/);
  });

  it("reads a gun's figures, the twist from the build list", () => {
    const gun = gunOf(CARBINE)!;
    expect(gun.name).toBe('Daniel Defense M4, Carbine, Example, 5.56');
    expect(gun.barrel.length).toBeCloseTo(16 * 0.0254, 9);
    expect(gun.barrel.twistLength).toBeCloseTo(7 * 0.0254, 9);
    expect(gun.barrel.gunMass).toBeCloseTo(6.2 * 0.45359237, 6);
    expect(gun.source?.published).toMatchObject({ barrelLength: '16"', twist: '1:7 Twist', weight: '6.2 LBS' });
  });

  it('reads a barrel cell that also holds the twist as one barrel and one twist, each quoted apart', () => {
    const gun = gunOf(productPage('DELTA 5 PRO, 24", 6.5 Creedmoor', { Caliber: '6.5 Creedmoor', 'Barrel Length': '24&quot; 1:8&quot;', Magazine: 'AICS' }))!;
    expect(gun.barrel.length).toBeCloseTo(24 * 0.0254, 9);
    expect(gun.barrel.twistLength).toBeCloseTo(8 * 0.0254, 9);
    expect(gun.source?.published).toMatchObject({ barrelLength: '24"', twist: '1:8"' });
  });

  it('tells a barrel from a gun by the magazine a gun ships with', () => {
    expect(reasonOf(productPage('16" Government Barrel', { Caliber: '5.56mm NATO', 'Barrel Length': '16&quot;' }))).toMatch(/not a gun/);
  });

  it("drops the shop's name however often a title repeats it, and leaves out a discontinued product", () => {
    expect(gunOf(productPage('DDM4 Example | Daniel Defense', { Caliber: '5.56mm NATO', 'Barrel Length': '16&quot;', Magazine: 'DD' }))!.name).toBe('Daniel Defense DDM4 Example');
    expect(reasonOf(productPage('Product Discontinued.', { Caliber: '5.56mm NATO', 'Barrel Length': '16&quot;', Magazine: 'DD' }))).toMatch(/discontinued/);
  });

  it("reads the product pages at the top of the site, not the categories", () => {
    expect(
      productPages(['https://danieldefense.com/ddm4-v7.html', 'https://danieldefense.com/rifles/ar-15-rifles.html', 'https://danieldefense.com/faq']),
    ).toEqual(['https://danieldefense.com/ddm4-v7.html']);
  });
});
