import { units } from '@gordons-legacy/formats';
import { describe, expect, it } from 'vitest';
import { loadFor, readRows } from '../../../tools/validation/pressure.ts';

/**
 * The reading of published pressure rows (tools/validation/pressure.ts, issue #22). The rows below are
 * **made up**: they exercise the plumbing, not the engine. No published table is reproduced here, and
 * none should be: the comparison runs against a file the user holds.
 */

const CSV = `cartridge,powder,bulletMass,bulletName,coal,charge,barrel,velocity,pressure,standard,source
.308 Win,Winchester StaBALL Match,180,,2.800,40.0,24,2400,55000,psi,fictitious row
.308 Win,Winchester StaBALL Match,180,,2.800,41.0,24,2450,45000,cup,fictitious row
.308 Win,No Such Powder,180,,2.800,40.0,24,2400,55000,psi,fictitious row
.500 Nonexistent,Winchester StaBALL Match,180,,2.800,40.0,24,2400,55000,psi,fictitious row
`;

describe('published pressure rows', () => {
  const rows = readRows(CSV);

  it('reads every row and converts its units', () => {
    expect(rows).toHaveLength(4);
    const [first] = rows;
    expect(first!.charge).toBeCloseTo(40 * units.GRAIN, 12);
    expect(first!.barrel).toBeCloseTo(24 * units.INCH, 12);
    expect(first!.overallLength).toBeCloseTo(2.8 * units.INCH, 12);
    expect(first!.velocity).toBeCloseTo(2400 * units.FOOT_PER_SECOND, 12);
    expect(first!.pressure).toBeCloseTo(55000 * units.PSI, 6);
    expect(first!.pressure / 1e5).toBeCloseTo(3792, 0);
  });

  it('keeps CUP as published, since it is not a pressure', () => {
    expect(rows[1]!.standard).toBe('cup');
    expect(rows[1]!.pressure).toBe(45000);
  });

  it('builds the load a row describes from the community corpus', () => {
    const load = loadFor(rows[0]!);
    expect('missing' in load).toBe(false);
    if ('missing' in load) return;
    expect(load.cartridge.name).toContain('.308 Win');
    expect(load.charge.mass).toBeCloseTo(40 * units.GRAIN, 12);
    expect(load.barrel.length).toBeCloseTo(24 * units.INCH, 12);
    expect(load.cartridge.overallLength).toBeCloseTo(2.8 * units.INCH, 12);
    expect(load.projectile.mass).toBeCloseTo(180 * units.GRAIN, 12);
    expect(load.propellant.product).toBe('StaBALL Match');
    // The case capacity is the caliber file's, not the table's: a known limit of this comparison.
    expect(load.cartridge.caseCapacity).toBeGreaterThan(0);
  });

  it('says what is missing instead of guessing', () => {
    expect(loadFor(rows[2]!)).toEqual({ missing: 'no powder model for No Such Powder' });
    expect(loadFor(rows[3]!)).toEqual({ missing: 'no caliber file for .500 Nonexistent' });
  });
});
