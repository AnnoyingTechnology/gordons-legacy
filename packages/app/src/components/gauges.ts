import { html, nothing } from 'lit';
import { styleMap } from 'lit/directives/style-map.js';
import type { PressureLimit } from '../analysis/load-assessment.ts';
import { speedOfSound, TRANSONIC_BAND } from '../analysis/speed-of-sound.ts';
import { withinSpan, type TemperatureSpan } from '../analysis/temperature-range.ts';
import { niceTicks } from '../charts/ticks.ts';
import { displayUnit } from '../units/units.ts';
import type { UiContext } from './context.ts';

/**
 * Horizontal scales that place a result among its references: the muzzle velocity against the speed of
 * sound, the peak pressure against the maxima, the powder temperatures where the load stays within limits. Plain HTML positioned in percent, so that text stays
 * crisp at any width.
 */

/**
 * The speed scale's fixed range, m/s, the same for every load so that loads compare at a glance: from a
 * .22 Short or a .38 Special wadcutter (about 200 m/s) to the fastest civilian cartridges (.220 Swift,
 * .204 Ruger, about 1,250 m/s). Faster or slower loads are pinned to the end with an arrow.
 */
export const SPEED_SCALE = { from: 150, to: 1300 } as const;

/** Where `value` sits between `from` and `to`, as a CSS percentage. */
const percent = (value: number, from: number, to: number) => `${(((value - from) / (to - from)) * 100).toFixed(3)}%`;

/** The muzzle velocity on the speed scale, with the transonic band at the powder's temperature. */
export function speedScale(velocity: number, temperature: number, context: UiContext) {
  const { t, quantity, number } = context;
  const unit = displayUnit('velocity', context.units);
  const { from, to } = SPEED_SCALE;
  const sound = speedOfSound(temperature);
  const bandFrom = TRANSONIC_BAND.from * sound;
  const bandTo = TRANSONIC_BAND.to * sound;
  const clamped = Math.min(to, Math.max(from, velocity));
  const outside = velocity > to ? 'above' : velocity < from ? 'below' : undefined;
  const ticks = niceTicks(unit.fromSi(from), unit.fromSi(to), 6)
    .map((value) => ({ value, si: unit.toSi(value) }))
    .filter(({ si }) => si >= from && si <= to);
  const label = t('speed.soundAt', { temperature: quantity(temperature, 'temperature', 0), velocity: quantity(sound, 'velocity') });
  return html`
    <div class="scale speed-scale" role="img" aria-label=${`${quantity(velocity, 'velocity')}; ${label}`}>
      <div class="scale-track">
        <div class="scale-band transonic" style=${styleMap({ left: percent(bandFrom, from, to), width: percent(bandTo - bandFrom, 0, to - from) })}
          title=${t('speed.transonicHelp', { from: quantity(bandFrom, 'velocity'), to: quantity(bandTo, 'velocity') })}></div>
        <div class="scale-mark sound" style=${styleMap({ left: percent(sound, from, to) })}></div>
        <div class="scale-marker ${outside ?? ''}" style=${styleMap({ left: percent(clamped, from, to) })}>
          ${outside === 'above' ? '▶' : outside === 'below' ? '◀' : '▼'}
        </div>
      </div>
      <div class="scale-ticks">
        ${ticks.map(({ value, si }) => html`<span style=${styleMap({ left: percent(si, from, to) })}>${number(value, 0)}</span>`)}
        <span class="scale-unit">${unit.symbol}</span>
      </div>
      ${outside ? html`<div class="scale-caption"><strong>${t(outside === 'above' ? 'speed.above' : 'speed.below')}</strong></div>` : nothing}
    </div>
  `;
}

/**
 * The peak pressure as a bar against the maxima, each marked and named. The bar turns to the caution
 * colour within `nearShare` of the lowest maximum and to the critical colour above it, always with words
 * beside it, never by colour alone.
 */
export function pressureGauge(peak: number, limits: PressureLimit[], nearShare: number, context: UiContext) {
  const { quantity, number } = context;
  const unit = displayUnit('pressure', context.units);
  const lowest = limits[0]!.pressure;
  const top = Math.max(peak, ...limits.map((limit) => limit.pressure)) * 1.15;
  const state = peak > lowest ? 'above' : peak >= nearShare * lowest ? 'near' : 'within';
  const ticks = niceTicks(0, unit.fromSi(top), 6)
    .filter((value) => value >= 0 && unit.toSi(value) <= top);
  return html`
    <div class="scale pressure-gauge" role="img" aria-label=${quantity(peak, 'pressure')}>
      <div class="scale-track">
        <div class="scale-band over" style=${styleMap({ left: percent(lowest, 0, top), right: '0' })}></div>
        <div class="gauge-bar ${state}" style=${styleMap({ width: percent(peak, 0, top) })}></div>
        ${limits.map(
          (limit, index) => html`<div class="scale-mark limit" style=${styleMap({ left: percent(limit.pressure, 0, top) })}>
            <span class="limit-label ${index % 2 === 1 ? 'below' : ''}">${limitName(limit, context)} ${quantity(limit.pressure, 'pressure')}</span>
          </div>`,
        )}
      </div>
      <div class="scale-ticks">
        ${ticks.map((value) => html`<span style=${styleMap({ left: percent(unit.toSi(value), 0, top) })}>${number(value, 0)}</span>`)}
        <span class="scale-unit">${unit.symbol}</span>
      </div>
    </div>
  `;
}

/** `CIP Pmax`, `SAAMI MAP` or `maximum`. */
export function limitName(limit: PressureLimit, context: UiContext): string {
  return context.t(`limit.${limit.source}`);
}

/** Published load data are given for about 20 °C: the scale marks it. */
const REFERENCE_CELSIUS = 20;

/**
 * The powder temperatures from −50 to 50 °C (analysis/temperature-range.ts): plain where the load stays
 * within limits in the simulation, hatched where it doesn't (red above the maximum, amber where its speed
 * regime or its burn changes), ticks every 10 °C with 20 °C, the usual reference of published data,
 * marked, and the load's own temperature.
 */
export function temperatureScale(spans: readonly TemperatureSpan[], own: number, context: UiContext) {
  const { t, quantity, number } = context;
  const unit = displayUnit('temperature', context.units);
  const from = spans[0]!.from;
  const to = spans[spans.length - 1]!.to;
  const zero = 273.15;
  const ticks: number[] = [];
  for (let celsius = Math.ceil((from - zero) / 10) * 10; celsius <= to - zero + 1e-9; celsius += 10) ticks.push(celsius + zero);
  const within = withinSpan(spans, own);
  const states = [...new Set(spans.map((span) => span.state))].filter((state) => state !== 'within');
  const caption = within
    ? t('temperatureRange.within', { from: quantity(within.from, 'temperature', 0), to: quantity(within.to, 'temperature', 0) })
    : t('temperatureRange.notWithin');
  const stateName = (state: TemperatureSpan['state']) => t(state === 'within' ? 'temperatureRange.withinState' : `temperatureRange.${state}`);
  return html`
    <div class="scale temperature-scale" role="img" aria-label=${caption}>
      <div class="scale-track">
        ${spans.map(
          (span) => html`<div
            class="scale-band temperature-${span.state}"
            style=${styleMap({ left: percent(span.from, from, to), width: percent(span.to - span.from, 0, to - from) })}
            title=${`${quantity(span.from, 'temperature', 0)} – ${quantity(span.to, 'temperature', 0)}: ${stateName(span.state)}`}
          ></div>`,
        )}
        ${ticks.map(
          (tick) => html`<div class="scale-mark tick ${Math.abs(tick - zero - REFERENCE_CELSIUS) < 1e-6 ? 'reference' : ''}"
            style=${styleMap({ left: percent(tick, from, to) })}></div>`,
        )}
        <div class="scale-marker" style=${styleMap({ left: percent(Math.min(to, Math.max(from, own)), from, to) })}>▼</div>
      </div>
      <div class="scale-ticks">
        ${ticks.map(
          (tick) => html`<span class=${Math.abs(tick - zero - REFERENCE_CELSIUS) < 1e-6 ? 'reference' : ''}
            style=${styleMap({ left: percent(tick, from, to) })}>${number(unit.fromSi(tick), 0)}</span>`,
        )}
        <span class="scale-unit">${unit.symbol}</span>
      </div>
      <div class="scale-caption">
        <strong>${caption}</strong>
        ${states.map((state) => html` · <span class="swatch temperature-${state}"></span> ${stateName(state)}`)}
        · ▼ ${t('temperatureRange.own', { temperature: quantity(own, 'temperature', 0) })}
        · ${t('temperatureRange.reference', { temperature: quantity(REFERENCE_CELSIUS + zero, 'temperature', 0) })}
      </div>
    </div>
  `;
}
