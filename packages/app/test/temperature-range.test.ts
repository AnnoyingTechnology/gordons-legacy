import { readFileSync } from 'node:fs';
import { grtTraditional } from '@gordons-legacy/engine';
import { importGrtLoad, type Load } from '@gordons-legacy/formats';
import { expect, test } from 'vitest';
import { temperatureRange, withinSpan } from '../src/analysis/temperature-range.ts';

function fixture(path: string): Load {
  const result = importGrtLoad(readFileSync(new URL(`../../formats/test/fixtures/${path}`, import.meta.url), 'utf8'));
  if (!result.ok) throw new Error(path);
  return result.value;
}

const special = fixture('maintainer/TESTED_38sp_rhino_XTP_158gr_31g_A1.grtload');

function range(load: Load) {
  const result = grtTraditional.simulate(load);
  if (!result.ok) throw new Error('simulation');
  return temperatureRange(load, result.simulation, load.cartridge.maxPressure);
}

test('the spans cover −50 to 50 °C without gaps', () => {
  const spans = range(special);
  expect(spans[0]!.from).toBeCloseTo(223.15, 6);
  expect(spans[spans.length - 1]!.to).toBeCloseTo(323.15, 6);
  for (let index = 1; index < spans.length; index++) expect(spans[index]!.from).toBe(spans[index - 1]!.to);
});

test('a hot load leaves its limits within half a degree of where the peak crosses the maximum', () => {
  const hot = { ...special, charge: { ...special.charge, mass: special.charge.mass * 1.035 } };
  const spans = range(hot);
  const own = withinSpan(spans, hot.charge.temperature)!;
  const above = spans[spans.indexOf(own) + 1]!;
  expect(above.state).toBe('aboveLimit');
  const peakAt = (temperature: number) => {
    const result = grtTraditional.simulate({ ...hot, charge: { ...hot.charge, temperature } });
    return result.ok ? result.simulation.maxPressure : NaN;
  };
  expect(peakAt(own.to - 0.5)).toBeLessThanOrEqual(hot.cartridge.maxPressure);
  expect(peakAt(own.to + 0.5)).toBeGreaterThan(hot.cartridge.maxPressure);
});
