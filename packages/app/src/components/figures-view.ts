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

/** GRT's grains per gram, which it uses for the power factor. */
const GRT_GRAINS_PER_GRAM = 15.432358353;
const FEET_PER_METRE = 1 / 0.3048;

/** Secondary results, as a compact list under the key figures (key-figures.ts). */
export function renderDetails(load: Load, shot: Simulation, context: UiContext): HTMLElement {
  const { t, quantity, number } = context;
  // IPSC's power factor: grains times feet per second, over 1000.
  const powerFactor = (load.projectile.mass * 1000 * GRT_GRAINS_PER_GRAM * (shot.muzzleVelocity * FEET_PER_METRE)) / 1000;
  const items: Array<{ label: string; value: string; help?: string; wide?: boolean }> = [
    ...(shot.optimalBarrelTime === undefined
      ? []
      : [{ label: t('results.obt'), value: formatObt(shot.optimalBarrelTime, context), help: t('results.obtHelp'), wide: true }]),
    ...(shot.muzzleSpinRate === undefined ? [] : [{ label: t('results.spinRate'), value: quantity(shot.muzzleSpinRate, 'spinRate') }]),
    { label: t('results.powerFactor'), value: number(powerFactor, 1) },
    { label: t('results.muzzlePressure'), value: quantity(shot.muzzlePressure, 'pressure') },
    { label: t('results.gasExitVelocity'), value: quantity(shot.recoil.gasExitVelocity, 'velocity') },
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
