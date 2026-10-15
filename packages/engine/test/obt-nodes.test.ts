import { describe, expect, it } from 'vitest';
import { obtNodeTimes } from '../src/index.ts';

/**
 * GRT's optimal-barrel-time nodes (docs/model/grt-traditional.md, Optimal barrel time). Beside the
 * values themselves, these pin what the coefficients mean: the spacing between nodes is the time a
 * longitudinal wave takes to cross the barrel once, at the speed of sound in steel. A change that broke
 * that would be a change to the model, not a refactor.
 *
 * None of this says a load on a node shoots better; that claim is unvalidated and labelled as such.
 */

const INCH = 0.0254;
/** Longitudinal (dilatational) wave speed in steel, m/s. */
const STEEL = 5900;

function spacing(barrelLength: number): number {
  const nodes = obtNodeTimes(barrelLength).filter(({ node }) => Number.isInteger(node));
  const tenth = nodes.find(({ node }) => node === 10)!;
  const twelfth = nodes.find(({ node }) => node === 12)!;
  return (twelfth.time - tenth.time) / 2;
}

describe('the optimal-barrel-time nodes', () => {
  it.each([16, 20, 24, 28, 32])('spaces a %i-inch barrel’s nodes by one crossing of the barrel', (inches) => {
    const length = inches * INCH;
    const implied = length / spacing(length);
    expect(implied).toBeGreaterThan(5800);
    expect(implied).toBeLessThan(6050);
    expect(implied / STEEL).toBeCloseTo(1, 1);
  });

  it('gives the times GRT gives', () => {
    // A 24-inch barrel, even node 10: d + 10c + 24(b + 10a) with GRT's even coefficients.
    const nodes = obtNodeTimes(24 * INCH);
    expect(nodes.find(({ node }) => node === 10)?.time).toBeCloseTo(0.00172193, 8);
    expect(nodes.find(({ node }) => node === 15)?.time).toBeCloseTo(0.00225868, 8);
    // Half nodes are there too, between the whole ones.
    const half = nodes.find(({ node }) => node === 10.5)?.time ?? 0;
    expect(half).toBeGreaterThan(nodes.find(({ node }) => node === 10)!.time);
    expect(half).toBeLessThan(nodes.find(({ node }) => node === 11)!.time);
  });

  it('is not a round trip at a single speed, which is what rules out the simplest reading', () => {
    const length = 24 * INCH;
    const nodes = obtNodeTimes(length);
    const speedAt = (node: number) => (node * 2 * length) / nodes.find((entry) => entry.node === node)!.time;
    // A round trip at a fixed speed would give the same figure at every node; these differ by a quarter.
    expect(speedAt(20) / speedAt(10)).toBeGreaterThan(1.2);
  });
});
