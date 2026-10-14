import type { Simulation } from '@gordons-legacy/engine';
import type { Load } from '@gordons-legacy/formats';
import { element } from '../dom.ts';
import type { UiContext } from './context.ts';

/** Says, wherever a fitted load's results show, that a velocity fit doesn't validate its pressure. */
export function renderFitNotice(fit: NonNullable<Load['propellant']['calibration']>, context: UiContext): HTMLElement {
  const { t, quantity } = context;
  const text = t('calibration.banner', {
    target: quantity(fit.targetVelocity, 'velocity'),
    charge: quantity(fit.chargeMass, 'chargeMass'),
    achieved: quantity(fit.achievedVelocity, 'velocity'),
    before: quantity(fit.peakPressureBefore, 'pressure'),
    after: quantity(fit.peakPressureAfter, 'pressure'),
  });
  return element('p', { class: 'warning fit-notice' }, [
    text,
    ...(fit.reached ? [] : [' ', element('strong', {}, [t('calibration.notReached')])]),
  ]);
}

export function renderFigures(load: Load, shot: Simulation, context: UiContext): HTMLElement {
  const { t, quantity, number } = context;
  const figure = (label: string, value: string, detail?: string, critical = false) =>
    element('div', { class: critical ? 'figure critical' : 'figure' }, [
      element('div', { class: 'figure-label' }, [label]),
      element('div', { class: 'figure-value' }, [value]),
      ...(detail ? [element('div', { class: 'figure-detail' }, [detail])] : []),
    ]);
  const share = (shot.maxPressure / load.cartridge.maxPressure) * 100;
  // Above the cartridge's maximum, the figure says so in words and with a marker, not by colour alone.
  const aboveMaximum = shot.maxPressure > load.cartridge.maxPressure;
  const ofMaximum = t('results.ofMaximum', { percent: number(share, 0), maximum: quantity(load.cartridge.maxPressure, 'pressure') });
  return element('div', { class: 'figures' }, [
    figure(
      t('results.peakPressure'),
      quantity(shot.maxPressure, 'pressure'),
      aboveMaximum ? `▲ ${t('results.aboveMaximum')}: ${ofMaximum}` : ofMaximum,
      aboveMaximum,
    ),
    figure(t('results.muzzleVelocity'), quantity(shot.muzzleVelocity, 'velocity')),
    figure(t('results.barrelTime'), quantity(shot.barrelTime, 'time')),
    figure(
      t('results.burnt'),
      `${number(shot.burntFractionAtMuzzle * 100, 1)} %`,
      shot.burnout ? t('results.burnout', { travel: quantity(shot.burnout.travel, 'length', 1) }) : t('results.stillBurning'),
    ),
  ]);
}

/** GRT's grains per gram, which it uses for the power factor. */
const GRT_GRAINS_PER_GRAM = 15.432358353;
const FEET_PER_METRE = 1 / 0.3048;

/** Secondary results, as a compact list under the key figures. */
export function renderDetails(load: Load, shot: Simulation, context: UiContext): HTMLElement {
  const { t, quantity, number } = context;
  // IPSC's power factor: grains times feet per second, over 1000.
  const powerFactor = (load.projectile.mass * 1000 * GRT_GRAINS_PER_GRAM * (shot.muzzleVelocity * FEET_PER_METRE)) / 1000;
  const items: Array<{ label: string; value: string; help?: string; wide?: boolean }> = [
    {
      label: t('results.caseFill'),
      value: `${number(shot.caseFill * 100, 1)} %${shot.caseFill > 1 ? ` (${t('results.compressed')})` : ''}`,
    },
    { label: t('results.muzzleEnergy'), value: quantity(shot.muzzleEnergy, 'energy') },
    { label: t('results.efficiency'), value: `${number(shot.efficiency * 100, 1)} %` },
    ...(shot.leadTime === undefined
      ? []
      : [{ label: t('results.leadTime'), value: quantity(shot.leadTime, 'time'), help: t('results.leadTimeHelp') }]),
    ...(shot.optimalBarrelTime === undefined
      ? []
      : [{ label: t('results.obt'), value: formatObt(shot.optimalBarrelTime, context), help: t('results.obtHelp'), wide: true }]),
    ...(shot.muzzleSpinRate === undefined ? [] : [{ label: t('results.spinRate'), value: quantity(shot.muzzleSpinRate, 'spinRate') }]),
    { label: t('results.powerFactor'), value: number(powerFactor, 1) },
    { label: t('results.recoilImpulse'), value: quantity(shot.recoil.totalImpulse, 'impulse') },
    { label: t('results.gasExitVelocity'), value: quantity(shot.recoil.gasExitVelocity, 'velocity') },
    ...(shot.recoil.gun === undefined
      ? []
      : [
          { label: t('results.recoilEnergy'), value: quantity(shot.recoil.gun.energy, 'energy') },
          { label: t('results.recoilVelocity'), value: quantity(shot.recoil.gun.velocity, 'velocity', 2) },
        ]),
  ];
  return element('dl', { class: 'result-details' }, items.map(({ label, value, help, wide }) =>
    element('div', { ...(help ? { title: help } : {}), ...(wide ? { class: 'wide' } : {}) }, [
      element('dt', {}, [label]),
      element('dd', {}, [value]),
    ]),
  ));
}

/** `#15 ½ · 0.465 ms (+0.8 %)`: the node, its time, and how much longer the lead time is. */
function formatObt(obt: NonNullable<Simulation['optimalBarrelTime']>, context: UiContext): string {
  const whole = Math.trunc(obt.node);
  const node = `#${whole}${obt.node !== whole ? ' ½' : ''}`;
  const offset = -obt.deviation * 100;
  return `${node} · ${context.quantity(obt.time, 'time')} (${offset >= 0 ? '+' : '−'}${context.number(Math.abs(offset), 1)} %)`;
}
