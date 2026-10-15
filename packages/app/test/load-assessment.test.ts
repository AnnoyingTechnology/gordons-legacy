import { readFileSync } from 'node:fs';
import { grtTraditional } from '@gordons-legacy/engine';
import { importGrtLoad, units, type Load } from '@gordons-legacy/formats';
import { describe, expect, test } from 'vitest';
import { assessLoad, pressureLimits } from '../src/analysis/load-assessment.ts';
import { communityComponents } from '../src/state/components.ts';

function fixture(path: string): Load {
  const result = importGrtLoad(readFileSync(new URL(`../../formats/test/fixtures/${path}`, import.meta.url), 'utf8'));
  if (!result.ok) throw new Error(path);
  return result.value;
}

function assess(load: Load) {
  const result = grtTraditional.simulate(load);
  if (!result.ok) throw new Error('not simulated');
  return assessLoad(load, result.simulation, grtTraditional);
}

const codes = (load: Load) => assess(load).findings.map((finding) => finding.code);

const blackout = fixture('maintainer/300_blackout_Hornady_110gr_vmax_full_patate.grtload');
const special = fixture('maintainer/TESTED_38sp_rhino_XTP_158gr_31g_A1.grtload');

describe('pressure', () => {
  test('a load above its maximum is a danger, named after the standard', () => {
    const hot = { ...blackout, charge: { ...blackout.charge, mass: blackout.charge.mass * 1.1 } };
    const assessment = assess(hot);
    expect(assessment.level).toBe('danger');
    expect(assessment.findings[0]).toMatchObject({ code: 'aboveLimit', limit: { source: 'CIP', pressure: 3900 * units.BAR } });
  });

  test('a SAAMI maximum below the CIP one is checked too', () => {
    const load = { ...blackout, cartridge: { ...blackout.cartridge, standardMaxPressures: { saami: 3792 * units.BAR } } };
    expect(pressureLimits(load).map((limit) => limit.source)).toEqual(['SAAMI', 'CIP']);
  });

  test("a load maximum slightly below a standard's is kept, so the lowest is always enforced", () => {
    const own = { ...blackout, cartridge: { ...blackout.cartridge, maxPressure: 3885 * units.BAR } };
    expect(pressureLimits(own)[0]).toEqual({ source: 'load', pressure: 3885 * units.BAR });
    const rounded = { ...blackout, cartridge: { ...blackout.cartridge, maxPressure: 3910 * units.BAR } };
    expect(pressureLimits(rounded)).toEqual([{ source: 'CIP', pressure: 3900 * units.BAR }]);
  });

  test("the load's own maximum is listed only when it differs from the standards'", () => {
    expect(pressureLimits(blackout)).toEqual([{ source: 'CIP', pressure: 3900 * units.BAR }]);
    const own = { ...blackout, cartridge: { ...blackout.cartridge, maxPressure: 3500 * units.BAR } };
    expect(pressureLimits(own).map((limit) => limit.source)).toEqual(['load', 'CIP']);
  });

  test('at 88 % of the maximum, ordinary bench variations reach above it', () => {
    // The maintainer's hottest 300 BLK load: 1 % more powder, 0.5 mm deeper, 2 % less capacity and a
    // 1 % heavier bullet together reach 103 % (PROGRESS.md, 2026-10-14).
    expect(codes(blackout)).toContain('benchVariationsAboveLimit');
    expect(codes(blackout)).not.toContain('nearLimit');
  });

  test('within 10 % of the maximum is a caution', () => {
    // .38 Special at 94 % of CIP's 1,500 bar.
    expect(codes(special)).toContain('nearLimit');
  });
});

describe('fill', () => {
  test('at 50 % fill a double charge fits, and its pressure is given', () => {
    const finding = assess(special).findings.find((candidate) => candidate.code === 'doubleChargeFits')!;
    expect(finding.level).toBe('caution');
    expect(finding.pressure).toBeGreaterThan(2 * special.cartridge.maxPressure);
    expect(codes(special)).toContain('lowFill');
  });

  test('a compressed charge is noted', () => {
    expect(codes(blackout)).toContain('compressed');
  });
});

describe('climate', () => {
  test('a load just under its maximum leaves its limits a few degrees hotter', () => {
    // 3.5 % more powder: about 99 % of the maximum at 21 °C.
    const load = { ...special, charge: { ...special.charge, mass: special.charge.mass * 1.035 } };
    const assessment = assess(load);
    expect(assessment.findings.some((finding) => finding.code === 'aboveLimit')).toBe(false);
    const hot = assessment.findings.find((finding) => finding.code === 'temperatureLimit' && finding.side === 'hot')!;
    expect(hot).toMatchObject({ level: 'note', temperatureState: 'aboveLimit' });
    expect(hot.temperature! - 273.15).toBeGreaterThan(21);
    expect(hot.temperature! - 273.15).toBeLessThan(40);
  });
});

test('findings are ordered from the most serious', () => {
  const levels = assess(special).findings.map((finding) => finding.level);
  const order = { danger: 0, caution: 1, note: 2 };
  expect(levels.map((level) => order[level])).toEqual([...levels.map((level) => order[level])].sort());
});

test('a double charge that stays under the maximum is only noted', () => {
  // A light .38 Special charge, 40 % of the original: doubled (80 %), it peaks near 960 bar, under 1,500.
  const light = { ...special, charge: { ...special.charge, mass: special.charge.mass * 0.4 } };
  const finding = assess(light).findings.find((candidate) => candidate.code === 'doubleChargeFits');
  expect(finding?.pressure).toBeLessThan(special.cartridge.maxPressure);
  expect(finding?.level).toBe('note');
});

describe('notes from GRT users’ complaints (issue #10)', () => {
  const plusP = fixture('maintainer/glock17_eng5_n340_115grain_xtp_PLUS-P.grtload');

  test("a case capacity equal to the caliber file's typical value is noted as probably not measured", () => {
    // 0.903 cm³ against V = 13.90 gr of water (0.901 cm³).
    expect(codes(plusP)).toContain('caseCapacityTypical');
    // The maintainer measured his 300 BLK cases: 1.513 cm³ against 1.581 typical.
    expect(codes(blackout)).not.toContain('caseCapacityTypical');
  });

  test('a capacity 20 % off the typical value is a caution: a wrong entry or unit?', () => {
    const wrong = { ...blackout, cartridge: { ...blackout.cartridge, caseCapacity: blackout.cartridge.caseCapacity * 1.25 } };
    expect(assess(wrong).findings.find((finding) => finding.code === 'caseCapacityFarFromTypical')).toMatchObject({ level: 'caution' });
  });

  test('a monolithic bullet is recognised by its name', () => {
    const copper = { ...blackout, projectile: { ...blackout.projectile, name: 'Barnes, TTSX 110gr' } };
    expect(codes(copper)).toContain('monolithicBullet');
    expect(codes(blackout)).not.toContain('monolithicBullet');
  });

  test('a fast powder burning out early in a long barrel is noted', () => {
    const redDot = communityComponents().find((entry) => entry.kind === 'propellant' && entry.value.product.includes('Red Dot'))!;
    // The 16-inch barrel of the maintainer's subsonic loads: it sweeps 12 times the case's capacity.
    const fast = {
      ...blackout,
      barrel: { ...blackout.barrel, length: 0.419 },
      propellant: redDot.value as Load['propellant'],
      charge: { ...blackout.charge, mass: 0.00035 },
    };
    const finding = assess(fast).findings.find((candidate) => candidate.code === 'earlyBurnoutLongBarrel');
    expect(finding?.share).toBeLessThan(0.2);
    expect(codes(blackout)).not.toContain('earlyBurnoutLongBarrel');
  });
});
