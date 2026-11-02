import { describe, expect, it } from 'vitest';
import { caliberTabs, modelFromTitle, modelPages, partRows, readPage } from '../../../tools/data/firearms/proof-research.ts';

/**
 * Reading PROOF Research's published rifle specifications (tools/data/firearms/proof-research.ts, issue
 * #30). The page below is in the shape of PROOF's model pages — a caliber tab list and, per caliber, one
 * row of spans per part number — with invented figures.
 *
 * What this maker's shape costs: the cartridge is a tab, not a cell; part numbers differing only by hand
 * or colour are one gun; the barrel's unit is its column header's (`in Inches`); and the twist is
 * written `8 PXT` on most pages and a bare `8` on others.
 */
const HEADER = ['Part Number', 'Action', 'Barrel Length in Inches', 'Twist Rate', 'Contour', 'Muzzle Thread', 'Color', 'Price'];

function block(caliber: number, rows: string[][]): string {
  const spans = (cells: string[]) => cells.map((cell) => `<span> ${cell} </span>`).join(' ');
  return `<div class="caliber-row full mix caliber-${caliber} first"> <div class="desktop"> <div class="caliber-row-header-wrap">
    <div class="caliber-row-header"> ${spans(HEADER)} </div> </div> <div class="caliber-row-data-wrap">
    ${rows.map((row) => `<div class="caliber-row-data"> ${spans(row)} </div>`).join(' ')} </div> </div> </div>`;
}

const PAGE = `<html><head><title>Proof Research |   Proof Research Example Hunter</title></head><body>
  <ul class="tab-list"><li><span class="active" data-mix-filter=".caliber-0"> 6.5 CM </span></li>
  <li><span class="" data-mix-filter=".caliber-1"> 300 PRC </span></li></ul>
  <div class="caliber-rows mixitup">
  ${block(0, [
    ['100', 'Right Hand', '22', '8 PXT', 'Sendero', '5/8-24', 'Black', '$5,899'],
    ['101', 'Left Hand', '22', '8 PXT', 'Sendero', '5/8-24', 'Green', '$5,899'],
  ])}
  ${block(1, [
    ['200', 'Right Hand', '22', '9', 'Sendero', '5/8-24', 'Black', '$5,899'],
    ['201', 'Right Hand', '26', '9', 'Sendero', '5/8-24', 'Black', '$5,999'],
  ])}
  </div></body></html>`;

describe("reading PROOF Research's model pages", () => {
  it('maps the caliber tabs and reads every part row', () => {
    expect([...caliberTabs(PAGE)]).toEqual([['caliber-0', '6.5 CM'], ['caliber-1', '300 PRC']]);
    expect(partRows(PAGE)).toHaveLength(4);
    expect(modelFromTitle(PAGE)).toBe('Example Hunter');
  });

  it('makes one gun per cartridge, barrel and twist, whatever the hand or colour', () => {
    const guns = readPage(PAGE, 'https://example.invalid/rifles/example/', '2026-11-02').flatMap((reading) => ('firearm' in reading ? [reading.firearm] : []));
    expect(guns.map((gun) => gun.name)).toEqual([
      'PROOF Research Example Hunter 6.5 CM 22"',
      'PROOF Research Example Hunter 300 PRC 22"',
      'PROOF Research Example Hunter 300 PRC 26"',
    ]);
    expect(guns[0]!.barrel.length).toBeCloseTo(22 * 0.0254, 9);
    expect(guns[0]!.barrel.twistLength).toBeCloseTo(8 * 0.0254, 9);
    expect(guns[1]!.barrel.twistLength).toBeCloseTo(9 * 0.0254, 9);
    expect(guns[0]!.source?.published).toMatchObject({ barrelLength: '22', twist: '8 PXT' });
  });

  it('finds the model pages from the home page, relative links included', () => {
    expect(modelPages('<a href="/rifles/glacier/">G</a><a href="/rifles/elevation">E</a><a href="https://proofresearch.com/rifles/">All</a>')).toEqual([
      'https://proofresearch.com/rifles/glacier/',
      'https://proofresearch.com/rifles/elevation/',
    ]);
  });
});
