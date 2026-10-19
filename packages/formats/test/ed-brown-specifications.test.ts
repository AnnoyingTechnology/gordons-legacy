import { describe, expect, it } from 'vitest';
import { modelLinks, readPage, specBox } from '../../../tools/data/firearms/ed-brown.ts';

/**
 * Reading a maker's published specifications (tools/data/firearms/ed-brown.ts, issue #30). The pages
 * below are in the shape Ed Brown's model pages are — a heading and a spec box of label/value pairs —
 * with invented figures.
 *
 * What this maker's shape costs: the barrel label is `Barrel / slide length` on some pages and `Barrel
 * length` on others, the barrel value carries a word after the figure (`4.25" Commander`), and the
 * weight says what it includes (`with unloaded magazine`) — which is the one page shape in this folder
 * that lets a mass be anything but `unstated`.
 */
function specification(rows: Record<string, string>): string {
  return Object.entries(rows)
    .map(([label, value]) => `<div class="ebp1911-spec"><small>${label}</small><strong>${value}</strong></div>`)
    .join('');
}

function page(heading: string, rows: Record<string, string>): string {
  return `<html><body><h1 class="entry-title">${heading}</h1><div class="ebp1911-specs">${specification(rows)}</div></body></html>`;
}

const URL = 'https://example.invalid/1911-handguns/example-carry/';

const CARRY = page('Example Carry', {
  Caliber: '45 ACP',
  'Barrel / slide length': '4.25&quot; Commander',
  Weight: 'Approximately 35 oz. with unloaded magazine',
});

function gunOf(markup: string) {
  const reading = readPage(markup, URL, '2026-10-19')[0];
  return reading !== undefined && 'firearm' in reading ? reading.firearm : undefined;
}

function reasonOf(markup: string): string | undefined {
  const reading = readPage(markup, URL, '2026-10-19')[0];
  return reading !== undefined && 'skipped' in reading ? reading.skipped : undefined;
}

describe('reading a published specification', () => {
  it('reads the spec box as label and value, the labels in lower case', () => {
    const box = specBox(CARRY);
    expect(box.get('caliber')).toBe('45 ACP');
    expect(box.get('barrel / slide length')).toBe('4.25" Commander');
    expect(box.get('weight')).toBe('Approximately 35 oz. with unloaded magazine');
    expect(specBox('<html><body>prose only</body></html>').size).toBe(0);
  });

  it('lists the model pages of the listing, once each, from a relative link as from a full one', () => {
    const listing = `<a class="ebp1911-model-card__link" href="/1911-handguns/example-carry/">Carry</a>
      <a class="ebp1911-model-card__link" href="/1911-handguns/example-carry/">Carry again</a>
      <a class="ebp1911-model-card__link" href="https://www.edbrown.com/1911-handguns/example-target/">Target</a>
      <a href="/holsters/">Holsters</a>`;
    expect(modelLinks(listing)).toEqual([
      'https://www.edbrown.com/1911-handguns/example-carry/',
      'https://www.edbrown.com/1911-handguns/example-target/',
    ]);
  });

  it('writes the gun with the maker first, the page and the day', () => {
    const gun = gunOf(CARRY);
    expect(gun?.name).toBe('Ed Brown Example Carry');
    expect(gun?.model).toBe('Example Carry');
    expect(gun?.cartridge).toBe('45 ACP');
    expect(gun?.barrel.length).toBe(0.10795); // `4.25" Commander`: the word after the figure is not read
    expect(gun?.barrel.gunMass).toBe(0.992233);
    expect(gun?.source).toMatchObject({ kind: 'published', publisher: 'Ed Brown Products, Inc.', url: URL, retrieved: '2026-10-19' });
    expect(gun?.source?.published).toMatchObject({ caliber: '45 ACP', barrelLength: '4.25" Commander', weight: 'Approximately 35 oz. with unloaded magazine' });
  });

  it('says a mass is with an empty magazine only where the page says so', () => {
    expect(gunOf(CARRY)?.source?.massBasis).toBe('empty-magazine');
    const unsaid = page('Example Target', { Caliber: '45 ACP', 'Barrel length': '5&quot;', Weight: 'Approximately 39 oz.' });
    expect(gunOf(unsaid)?.source?.massBasis).toBe('unstated'); // a weight of nothing said is a starting point
    expect(gunOf(unsaid)?.barrel.length).toBe(0.127); // the other spelling of the label
  });

  it('leaves out a model that names no one cartridge, or no barrel, saying which and why', () => {
    expect(reasonOf(page('Example Kobra Carry', { Caliber: '45 ACP or 9mm', Weight: '35 oz.' }))).toBe(
      'Example Kobra Carry: no single loadable cartridge (45 ACP or 9mm)',
    );
    expect(reasonOf(page('Example FX2', { Weight: '35 oz.' }))).toBe('Example FX2: no single loadable cartridge (none printed)');
    expect(reasonOf(page('Example Carry', { Caliber: '45 ACP', Weight: '35 oz.' }))).toBe('Example Carry: no barrel length');
    expect(reasonOf('<html><body><h1 class="entry-title">Example</h1>prose only</body></html>')).toBe('no model heading or no spec box');
  });
});
