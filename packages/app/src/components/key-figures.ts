import type { Simulation } from '@gordons-legacy/engine';
import type { Load } from '@gordons-legacy/formats';
import { html, nothing, type TemplateResult } from 'lit';
import { NEAR_LIMIT_SHARE, type Assessment } from '../analysis/load-assessment.ts';
import { speedOfSound } from '../analysis/speed-of-sound.ts';
import { icon, type IconName } from '../icons/icons.ts';
import { cartridgeDrawing } from './cartridge-drawing.ts';
import type { UiContext } from './context.ts';
import { limitName, pressureGauge, speedScale } from './gauges.ts';

/**
 * The results that matter most, by rank: muzzle velocity and peak pressure first, each on its scale;
 * then energy, recoil and the other figures a reloader looks for; then the case, drawn filled to scale,
 * beside the secondary results (`details`).
 */
export function keyFigures(load: Load, shot: Simulation, assessment: Assessment, context: UiContext, details: Node): TemplateResult {
  const { t, quantity, number } = context;
  const lowest = assessment.limits[0]!;
  const share = shot.maxPressure / lowest.pressure;
  const above = shot.maxPressure > lowest.pressure;
  const temperature = load.charge.temperature;
  const mach = shot.muzzleVelocity / speedOfSound(temperature);
  const gun = shot.recoil.gun;
  return html`
    <div class="key-figures">
      <section class="key-card primary">
        <h4>${icon('velocity')} ${t('results.muzzleVelocity')}</h4>
        <div class="key-value">${quantity(shot.muzzleVelocity, 'velocity')}</div>
        <div class="key-detail">${t('speed.mach', { mach: number(mach, 2), temperature: quantity(temperature, 'temperature', 0) })}</div>
        ${speedScale(shot.muzzleVelocity, temperature, context)}
      </section>
      <section class="key-card primary ${above ? 'critical' : ''}">
        <h4>${icon('pressure')} ${t('results.peakPressure')}</h4>
        <div class="key-value">${quantity(shot.maxPressure, 'pressure')}</div>
        <div class="key-detail">
          ${above ? html`<strong>▲ ${t('results.aboveMaximum')}:</strong> ` : nothing}
          ${t('gauge.ofLimit', { percent: number(share * 100, 0), limit: `${limitName(lowest, context)} ${quantity(lowest.pressure, 'pressure')}` })}
        </div>
        ${pressureGauge(shot.maxPressure, assessment.limits, NEAR_LIMIT_SHARE, context)}
      </section>
      ${card('energy', t('results.muzzleEnergy'), quantity(shot.muzzleEnergy, 'energy'), t('results.efficiencyDetail', { percent: number(shot.efficiency * 100, 1) }))}
      ${gun
        ? card('recoil', t('results.recoilEnergy'), quantity(gun.energy, 'energy'), t('results.recoilDetail', {
            impulse: quantity(shot.recoil.totalImpulse, 'impulse'),
            velocity: quantity(gun.velocity, 'velocity', 2),
          }))
        : card('recoil', t('results.recoilImpulse'), quantity(shot.recoil.totalImpulse, 'impulse'), t('results.recoilNeedsGunMass'))}
      ${card('chart', t('results.barrelTime'), quantity(shot.barrelTime, 'time'), shot.leadTime === undefined ? '' : `${t('results.leadTime')} ${quantity(shot.leadTime, 'time')}`)}
      ${card(
        'propellant',
        t('results.burnt'),
        `${number(shot.burntFractionAtMuzzle * 100, 1)} %`,
        shot.burnout ? t('results.burnout', { travel: quantity(shot.burnout.travel, 'length', 1) }) : t('results.stillBurning'),
      )}
      <section class="key-card fill-card">
        <h4>${icon('cartridge')} ${t('results.caseFill')}</h4>
        ${cartridgeDrawing(load, shot, context)}
      </section>
      <section class="key-card details-card">${details}</section>
    </div>
  `;
}

function card(name: IconName, label: string, value: string, detail: string): TemplateResult {
  return html`
    <section class="key-card">
      <h4>${icon(name)} ${label}</h4>
      <div class="key-value">${value}</div>
      ${detail ? html`<div class="key-detail">${detail}</div>` : nothing}
    </section>
  `;
}
