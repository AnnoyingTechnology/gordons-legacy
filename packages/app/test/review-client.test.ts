import { expect, test, vi } from 'vitest';
import { grtTraditional } from '@gordons-legacy/engine';
import { exampleLoad } from '../src/state/example-load.ts';

// Vite's inline worker import has no meaning outside a build: the client is tested where workers don't exist.
vi.mock('../src/analysis/review-worker.ts?worker&inline', () => ({ default: class {} }));
const { ReviewClient } = await import('../src/analysis/review-client.ts');

test('without a worker, a review asked for and then superseded is never delivered (#32)', async () => {
  const client = new ReviewClient();
  const load = exampleLoad({ title: 'Load', note: '' })!;
  const first = client.review(load, grtTraditional);
  const second = client.review({ ...load, charge: { ...load.charge, mass: load.charge.mass * 0.96 } }, grtTraditional);
  expect(await first).toBe('superseded');
  const outcome = await second;
  expect(typeof outcome === 'object' && outcome !== null && 'assessment' in outcome).toBe(true);
});
