import { describe, expect, it } from 'vitest';
import { firearmsFrom, length, mass, modelLinks, specifications, titleCase, titleOf, variants, weights } from '../../../tools/data/firearms/tanfoglio.ts';

/**
 * The reading of a maker's published specifications (tools/data/firearms/tanfoglio.ts, issue #30). The page
 * below is written here in the shape the maker's pages have: a table whose rows alternate labels and values,
 * then a list of variants. It is in Italian and its figures are made up.
 */

function labelRow(labels: string[]): string {
  return `<tr style="background-color: #e8e8e8;">${labels.map((label) => `<td><span><strong>${label}</strong><br></span></td>`).join('')}</tr>`;
}

function valueRow(values: string[]): string {
  return `<tr>${values.map((value) => `<td><span>${value}<br></span></td>`).join('')}</tr>`;
}

function page(title: string, weight: string, variantLabels: string[]): string {
  return `<html><body>
<h1 id="name"><span>${title}</span></h1>
<h1><span> CARATTERISTICHE TECNICHE </span></h1>
<table class="table">
${labelRow(['Lunghezza totale', 'Lunghezza canna', 'Peso', 'Fusto'])}
${valueRow(['200mm', '101,5mm', weight, 'Acciaio'])}
${labelRow(['Canna (rigatura)', 'Azione'])}
${valueRow(['Tradizionale', 'D.A.'])}
</table>
<h1><span> CALIBRI </span></h1>
${variantLabels.map((label) => `<div class="col"><a class="varianteArma" href="/x">${label}</a></div>`).join('')}
</body></html>`;
}

const PAGE = page('EXAMPLE F', '1100gr.', [
  'EXAMPLE F CAL. 9X19 BLACK',
  'EXAMPLE F CAL. 9X19 SILVER',
  'EXAMPLE F CAL..40 S&amp;W BLACK',
  'EXAMPLE F CAL. 9X19 K BLACK',
  'EXAMPLE F CAL..22 LR',
  'ANOTHER ONE CAL. 10MM AUTO',
]);

describe('reading a published specification', () => {
  it('finds the model links on the home page', () => {
    const home = '<a href="/it_IT/prodotti/COMBF/combat-f">x</a><a href="/it_IT/prodotti/COMBF/combat-f">y</a><a href="/it_IT/accessori/shop">z</a>';
    expect(modelLinks(home)).toEqual(['/it_IT/prodotti/COMBF/combat-f']);
  });

  it('pairs each label row with the row of values under it', () => {
    const table = specifications(PAGE);
    expect(table.get('lunghezza canna')).toBe('101,5mm');
    expect(table.get('peso')).toBe('1100gr.');
    expect(table.get('azione')).toBe('D.A.');
    expect(titleOf(PAGE)).toBe('EXAMPLE F');
  });

  it('reads millimetres with a comma decimal and grams written gr.', () => {
    expect(length('101,5mm')).toBeCloseTo(0.1015, 12);
    expect(length('4 in')).toBeUndefined();
    expect(mass('1100 gr.')).toBeCloseTo(1.1, 12);
    expect(mass('1100')).toBeUndefined();
  });

  it('gives one weight to a whole model, or one per chambering when they are annotated', () => {
    expect(weights('1125gr.').whole).toBe('1125gr.');
    const annotated = weights('1090 gr. (CAL.45ACP) - 1120 gr. (CAL.9mm)');
    expect(annotated.whole).toBeUndefined();
    expect([...annotated.perCartridge]).toEqual([['45ACP', '1090 gr.'], ['9MM', '1120 gr.']]);
  });

  it('knows the chamberings it maps and sets aside the variants with words it does not', () => {
    const { variants: known, unknown } = variants(PAGE);
    expect(known.map((variant) => variant.cartridge)).toEqual(['9x19 mm', '9x19 mm', '.40 S&W', '10mm Auto']);
    expect(unknown).toEqual(['EXAMPLE F CAL. 9X19 K BLACK', 'EXAMPLE F CAL..22 LR']);
  });

  it('keeps the roman numerals of a title in capitals', () => {
    expect(titleCase('STOCK III XTREME')).toBe('Stock III Xtreme');
    expect(titleCase('FT 1911 CUSTOM')).toBe('FT 1911 Custom');
  });

  it('builds one gun per distinct chambering of the model, with the page\'s barrel and weight', () => {
    const guns = firearmsFrom(PAGE, 'https://example.invalid/it_IT/prodotti/EXF/example-f', '2026-10-16');
    expect(guns.map((gun) => gun.name)).toEqual(['Tanfoglio Example F 9x19 mm', 'Tanfoglio Example F .40 S&W']);
    const first = guns[0]!;
    expect(first.barrel.length).toBeCloseTo(0.1015, 12);
    expect(first.barrel.gunMass).toBeCloseTo(1.1, 12);
    expect(first.source).toEqual({
      kind: 'published',
      publisher: 'Tanfoglio',
      url: 'https://example.invalid/it_IT/prodotti/EXF/example-f',
      retrieved: '2026-10-16',
      massBasis: 'unstated',
      published: { caliber: 'EXAMPLE F CAL. 9X19 BLACK', barrelLength: '101,5mm', weight: '1100gr.' },
    });
  });

  it('gives a weight only to the chamberings an annotation names', () => {
    const annotated = page('EXAMPLE 1911', '1090 gr. (CAL.45ACP) - 1120 gr. (CAL.9mm)', ['EXAMPLE 1911 CAL..45 ACP BLACK', 'EXAMPLE 1911 CAL. 9X19 BLACK', 'EXAMPLE 1911 CAL. 9X21 BLACK']);
    const guns = firearmsFrom(annotated, 'u', '2026-10-16');
    expect(guns.map((gun) => gun.barrel.gunMass)).toEqual([expect.closeTo(1.09, 12), expect.closeTo(1.12, 12), undefined]);
    expect(guns[2]!.source?.massBasis).toBeUndefined();
  });
});
