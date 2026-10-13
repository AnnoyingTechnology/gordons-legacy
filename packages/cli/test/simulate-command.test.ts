import { fileURLToPath } from 'node:url';
import { expect, test } from 'vitest';
import { simulateCommand } from '../src/simulate-command.ts';

const FIXTURE = fileURLToPath(
  new URL('../../formats/test/fixtures/cc0/loads/327_Federal_Magnum_by_dpeppe01_2022.12.12.grtload', import.meta.url),
);

test('summarizes a simulated .grtload, with the safety notice', () => {
  const { output, exitCode } = simulateCommand([FIXTURE]);
  expect(exitCode).toBe(0);
  expect(output).toContain('Peak pressure    1961.5 bar');
  expect(output).toContain('Muzzle velocity  410.8 m/s');
  expect(output).toContain('not load data');
});

test('prints the full simulation as JSON', () => {
  const { output } = simulateCommand(['--json', FIXTURE]);
  const shot = JSON.parse(output);
  expect(shot.engine).toBe('grt-traditional');
  expect(shot.curve.pressure).toHaveLength(2000);
});

test('explains its usage', () => {
  expect(simulateCommand([]).exitCode).toBe(2);
});
