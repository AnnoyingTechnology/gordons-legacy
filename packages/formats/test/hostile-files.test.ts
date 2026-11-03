import { describe, expect, it } from 'vitest';
import { importGrtCaliber, importGrtLoad, importGrtrace, ladderChargeMasses, MAXIMUM_SHOT_GROUP_HITS, parseLoad, serializeLoad } from '@gordons-legacy/formats';
import { parseGrtNumber } from '../src/grt/grt-number.ts';
import { readFixture } from './fixtures.ts';

/**
 * Files a user opens are untrusted (issue #32): a damaged or crafted file must come back as typed
 * issues, quickly, never as an exception, a hang or a value outside the documented invariants. Each
 * case below was found by an audit (Codex, 2026-11-02) and is kept as the example it was.
 */

const grt = (inner: string) => `<GordonsReloadingTool>${inner}</GordonsReloadingTool>`;

describe('a hostile GRT file', () => {
  it('reports a character reference that is no character, instead of throwing', () => {
    const result = importGrtCaliber(grt('<caliberfile><var name="cipname" value="&#x110000;"/></caliberfile>'));
    expect(result.ok).toBe(false);
  });

  it('reports elements nested thousands deep, instead of overflowing the stack', () => {
    const result = importGrtCaliber('<a>'.repeat(5000) + '</a>'.repeat(5000));
    expect(result.ok).toBe(false);
  });

  it('rejects a number of thirty thousand digits at once', () => {
    const started = performance.now();
    expect(parseGrtNumber(`${'1'.repeat(32000)}!`)).toBeUndefined();
    expect(performance.now() - started).toBeLessThan(100);
    expect(parseGrtNumber('12.5e3')).toBe(12500);
    expect(parseGrtNumber('.5')).toBe(0.5);
    expect(parseGrtNumber('5.')).toBe(5);
  });
});

describe('a hostile GRTrace file', () => {
  it('reads tens of thousands of shots in linear time and memory', () => {
    const traces = Array.from({ length: 30000 }, (_, index) => ({ Velocity: 100, PowderCharge: 1 + (index % 3000) }));
    const started = performance.now();
    const result = importGrtrace(JSON.stringify({ Type: 'GRTrace', Config: { Propellant: 'x'.repeat(8000) }, Traces: traces }));
    expect(result.ok).toBe(true);
    expect(performance.now() - started).toBeLessThan(2000);
  });

  it('takes a text field that is not text for no text, instead of throwing', () => {
    const result = importGrtrace(JSON.stringify({ Type: 'GRTrace', Traces: [{ Velocity: 300, PowderCharge: 20 }], DateTime: { toString: 0 } }));
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value.title).toBe('PressureTrace');
  });
});

describe('a hostile saved load', () => {
  const valid = JSON.parse(serializeLoad((() => {
    const imported = importGrtLoad(readFixture('cc0/loads/327_Federal_Magnum_by_dpeppe01_2022.12.12.grtload'));
    if (!imported.ok) throw new Error('fixture');
    return imported.value;
  })())) as Record<string, Record<string, unknown>>;

  it('refuses a ladder of more steps than GRT has, and never makes more charges than that', () => {
    const result = parseLoad(JSON.stringify({ ...valid, ladder: { steps: 1e308, massStep: 5e-324 } }));
    expect(result.ok).toBe(false);
    expect(ladderChargeMasses({ charge: { mass: 0.001, temperature: 294 }, ladder: { steps: 1e308, massStep: 5e-324 } })).toHaveLength(10);
  });

  it('refuses a shot group of more hits than any target holds', () => {
    const hits = Array.from({ length: MAXIMUM_SHOT_GROUP_HITS + 1 }, (_, index) => ({ x: index * 0.001, y: 0 }));
    const group = { title: 'Group', distance: 100, hits, note: '' };
    expect(parseLoad(JSON.stringify({ ...valid, shotGroups: [group] })).ok).toBe(false);
    expect(parseLoad(JSON.stringify({ ...valid, shotGroups: [{ ...group, hits: hits.slice(1) }] })).ok).toBe(true);
  });

  it('refuses a variant tag that names an inherited property', () => {
    const result = parseLoad(JSON.stringify({ ...valid, propellant: { ...valid['propellant'], burnModel: { kind: '__proto__' } } }));
    expect(result.ok).toBe(false);
  });
});
