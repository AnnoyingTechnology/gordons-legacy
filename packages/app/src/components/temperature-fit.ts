import {
  DEFAULT_COLD_COEFFICIENT,
  DEFAULT_HOT_COEFFICIENT,
  fitTemperatureCoefficients,
  type TemperatureCoefficients,
} from '@gordons-legacy/engine';
import type { Load } from '@gordons-legacy/formats';
import { html, LitElement, nothing } from 'lit';
import { displayUnit, formatNumber, parseNumber } from '../units/units.ts';
import type { UiContext } from './context.ts';

const REFERENCE_CELSIUS = 21;

type Entry = 'coldTemperature' | 'coldVelocity' | 'normalVelocity' | 'hotTemperature' | 'hotVelocity';

/**
 * GRT's temperature-coefficient assistant: velocities measured with the load's charge, cold, at 21 °C
 * and hot, give the powder's coefficients. Fires `load-change` when the user applies them.
 */
export class TemperatureFit extends LitElement {
  static override properties = {
    load: { attribute: false },
    context: { attribute: false },
    entries: { state: true },
    result: { state: true },
  };

  declare load: Load;
  declare context: UiContext;
  declare entries: Record<Entry, string>;
  declare result: TemperatureCoefficients | undefined;

  constructor() {
    super();
    this.entries = { coldTemperature: '', coldVelocity: '', normalVelocity: '', hotTemperature: '', hotVelocity: '' };
    this.result = undefined;
  }

  protected override createRenderRoot(): HTMLElement {
    return this;
  }

  protected override render() {
    const { t } = this.context;
    const temperature = displayUnit('temperature', this.context.units);
    const velocity = displayUnit('velocity', this.context.units);
    const input = (entry: Entry, label: string) => html`<input
      type="text"
      inputmode="decimal"
      aria-label=${label}
      .value=${this.entries[entry]}
      @input=${(event: Event) => {
        this.entries = { ...this.entries, [entry]: (event.target as HTMLInputElement).value };
        this.result = undefined;
      }}
    />`;
    const normal = formatNumber(temperature.fromSi(REFERENCE_CELSIUS + 273.15), 0, 'en');
    return html`
      <div class="temperature-fit">
        <h4>${t('temperatureFit.title')}</h4>
        <p class="note">${t('temperatureFit.help')}</p>
        <table class="data-table">
          <thead>
            <tr><td></td><th>${t('field.temperature')} (${temperature.symbol})</th><th>${t('measurements.mean')} (${velocity.symbol})</th></tr>
          </thead>
          <tbody>
            <tr><td>${t('temperatureFit.cold')}</td><td>${input('coldTemperature', t('temperatureFit.cold'))}</td><td>${input('coldVelocity', t('temperatureFit.cold'))}</td></tr>
            <tr><td>${t('temperatureFit.normal')}</td><td>${normal}</td><td>${input('normalVelocity', t('temperatureFit.normal'))}</td></tr>
            <tr><td>${t('temperatureFit.hot')}</td><td>${input('hotTemperature', t('temperatureFit.hot'))}</td><td>${input('hotVelocity', t('temperatureFit.hot'))}</td></tr>
          </tbody>
        </table>
        <button type="button" @click=${this.fit}>${t('temperatureFit.fit')}</button>
        ${this.result ? this.renderResult(this.result) : nothing}
      </div>
    `;
  }

  private renderResult(result: TemperatureCoefficients) {
    const { t, number } = this.context;
    const shown = (value: number | undefined) => (value === undefined ? t('temperatureFit.none') : number(value, 4));
    return html`
      <p>
        ${t('temperatureFit.cold')}: <strong>${shown(result.cold)}</strong> · ${t('temperatureFit.hot')}:
        <strong>${shown(result.hot)}</strong>
        ${result.cold !== undefined || result.hot !== undefined
          ? html`<button type="button" @click=${() => this.apply(result)}>${t('temperatureFit.use')}</button>`
          : nothing}
      </p>
    `;
  }

  private fit = () => {
    const temperature = displayUnit('temperature', this.context.units);
    const velocity = displayUnit('velocity', this.context.units);
    const read = (entry: Entry, unit: typeof temperature) => {
      const value = parseNumber(this.entries[entry]);
      return value === undefined ? undefined : unit.toSi(value);
    };
    const normalVelocity = read('normalVelocity', velocity);
    if (normalVelocity === undefined) {
      this.result = {};
      return;
    }
    const measurement = (temperatureEntry: Entry, velocityEntry: Entry) => {
      const at = read(temperatureEntry, temperature);
      const measured = read(velocityEntry, velocity);
      return at === undefined || measured === undefined ? undefined : { temperature: at, velocity: measured };
    };
    this.result =
      fitTemperatureCoefficients(
        this.load,
        { temperature: REFERENCE_CELSIUS + 273.15, velocity: normalVelocity },
        measurement('coldTemperature', 'coldVelocity'),
        measurement('hotTemperature', 'hotVelocity'),
      ) ?? {};
  };

  private apply(result: TemperatureCoefficients): void {
    // A powder with both coefficients at 0 uses GRT's defaults: writing one side would leave the other at
    // a literal 0, so both start from the defaults.
    const current = this.load.propellant.burnModel;
    const defaults = current.coldTemperatureCoefficient === 0 && current.hotTemperatureCoefficient === 0;
    const burnModel = {
      ...current,
      ...(defaults ? { coldTemperatureCoefficient: DEFAULT_COLD_COEFFICIENT, hotTemperatureCoefficient: DEFAULT_HOT_COEFFICIENT } : {}),
      ...(result.cold === undefined ? {} : { coldTemperatureCoefficient: result.cold }),
      ...(result.hot === undefined ? {} : { hotTemperatureCoefficient: result.hot }),
    };
    this.dispatchEvent(new CustomEvent('load-change', { detail: { ...this.load, propellant: { ...this.load.propellant, burnModel } }, bubbles: true }));
  }
}

customElements.define('gl-temperature-fit', TemperatureFit);
