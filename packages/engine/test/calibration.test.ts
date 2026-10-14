import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { importGrtLoad, type Load } from '@gordons-legacy/formats';
import { describe, expect, it } from 'vitest';
import { calibrateToVelocity, chargeForLeadTime, grtTraditional } from '../src/index.ts';

const FIXTURE = join(import.meta.dirname, '../../formats/test/fixtures/cc0/loads/327_Federal_Magnum_by_dpeppe01_2022.12.12.grtload');

function load(): Load {
  const result = importGrtLoad(readFileSync(FIXTURE, 'utf8'));
  if (!result.ok) throw new Error('fixture');
  return result.value;
}

function simulate(input: Load) {
  const result = grtTraditional.simulate(input);
  if (!result.ok) throw new Error('simulation');
  return result.simulation;
}

describe('calibrateToVelocity', () => {
  it('adjusts k and Ba together until the rounded muzzle velocity matches', () => {
    // The fixture simulates 410.8 m/s; suppose the chronograph said 400 m/s.
    const calibration = calibrateToVelocity(load(), 400)!;
    expect(calibration.reached).toBe(true);
    expect(Math.round(calibration.simulation.muzzleVelocity * 10) / 10).toBe(400);
    const original = load().propellant;
    const kChange = calibration.load.propellant.heatCapacityRatio / original.heatCapacityRatio - 1;
    const baChange = calibration.load.propellant.burnModel.vivacity / original.burnModel.vivacity - 1;
    expect(kChange).toBeLessThan(0);
    expect(kChange).toBeCloseTo(baChange, 12);
  });

  it('stops at GRT\'s 4.5 % bound when the velocity is out of reach', () => {
    const calibration = calibrateToVelocity(load(), 600)!;
    expect(calibration.reached).toBe(false);
    expect(calibration.load.propellant.burnModel.vivacity / load().propellant.burnModel.vivacity).toBeLessThan(1.05);
  });
});

describe('chargeForLeadTime', () => {
  it('finds the charge whose lead time crosses the target, to the nearest 0.01 grain', () => {
    const original = simulate(load());
    // A lead time 5 % shorter needs more powder.
    const target = original.leadTime! * 0.95;
    const calibration = chargeForLeadTime(load(), target)!;
    expect(calibration.reached).toBe(true);
    expect(calibration.load.charge.mass).toBeGreaterThan(load().charge.mass);
    const finerStep = simulate({ ...calibration.load, charge: { ...calibration.load.charge, mass: calibration.load.charge.mass + 0.01 * 0.00006479891 } });
    // The target lies between this charge and the next 0.01 grain.
    expect(Math.sign(calibration.simulation.leadTime! - target)).not.toBe(Math.sign(finerStep.leadTime! - target));
  });

  it('carries on with finer steps when a coarse one loses the lead time', () => {
    // 1 grain less leaves the peak so low that the 150 bar initial pressure is above 10 % of it, so the
    // fixture has no lead time there; the 0.5-grain steps still find node #16 (0.4923 ms).
    const calibration = chargeForLeadTime(load(), 0.4923e-3)!;
    expect(calibration.reached).toBe(true);
    expect(calibration.load.charge.mass).toBeLessThan(load().charge.mass);
    expect(calibration.simulation.leadTime! * 1000).toBeCloseTo(0.4923, 3);
  });
});
