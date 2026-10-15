import { grtTraditional, type Simulation } from '@gordons-legacy/engine';
import type { Load } from '@gordons-legacy/formats';
import { html, LitElement, nothing } from 'lit';
import { LineChart } from '../charts/line-chart.ts';
import { element } from '../dom.ts';
import type { OpenDocument } from '../state/documents.ts';
import { displayUnit } from '../units/units.ts';
import type { UiContext } from './context.ts';
import { onChartLayoutChange, pairedChartSize } from './charts-view.ts';
import type { ChartAxis } from './results-view.ts';

/** The categorical palette has eight validated slots; more loads would need hues that fail its checks. */
export const MAXIMUM_COMPARED = 8;

interface Compared {
  name: string;
  load: Load;
  simulation: Simulation;
  color: string;
}

/**
 * Several open loads side by side: their pressure and velocity curves overlaid, one colour per load in
 * a fixed order, with a legend and a table of key figures.
 */
export class CompareView extends LitElement {
  static override properties = {
    documents: { attribute: false },
    context: { attribute: false },
    excluded: { state: true },
    axis: { state: true },
  };

  declare documents: OpenDocument[];
  declare context: UiContext;
  /** Documents unticked by the user, by id. */
  declare excluded: Set<number>;
  declare axis: ChartAxis;

  constructor() {
    super();
    this.documents = [];
    this.excluded = new Set();
    this.axis = 'travel';
  }

  private stopWatchingLayout = () => {};

  // The charts are drawn for the window's width: redraw them when it crosses the side-by-side width.
  override connectedCallback(): void {
    super.connectedCallback();
    this.stopWatchingLayout = onChartLayoutChange(() => this.requestUpdate());
  }

  override disconnectedCallback(): void {
    super.disconnectedCallback();
    this.stopWatchingLayout();
  }

  protected override createRenderRoot(): HTMLElement {
    return this;
  }

  protected override render() {
    const { t } = this.context;
    const chosen = this.documents.filter((document) => !this.excluded.has(document.id)).slice(0, MAXIMUM_COMPARED);
    const compared: Compared[] = [];
    const refused: string[] = [];
    chosen.forEach((document) => {
      const result = grtTraditional.simulate(document.load);
      if (result.ok) {
        compared.push({ name: displayName(document), load: document.load, simulation: result.simulation, color: `var(--compare-${compared.length + 1})` });
      } else {
        refused.push(displayName(document));
      }
    });
    return html`
      <section class="compare">
        <h2>${t('compare.title')}</h2>
        <p class="warning">${t('safety.simulated')}</p>
        <fieldset class="compare-choice">
          <legend>${t('compare.loads', { count: String(MAXIMUM_COMPARED) })}</legend>
          ${this.documents.map(
            (document) => html`<label>
              <input type="checkbox" .checked=${!this.excluded.has(document.id)} @change=${() => this.toggle(document.id)} />
              ${displayName(document)}
            </label>`,
          )}
        </fieldset>
        ${refused.length > 0 ? html`<p class="error">${t('compare.refused', { names: refused.join(', ') })}</p>` : nothing}
        <div class="axis-switch" role="radiogroup" aria-label=${t('results.against')}>
          ${t('results.against')}
          ${(['travel', 'time'] as const).map(
            (axis) => html`<label>
              <input type="radio" name="compare-axis" .checked=${this.axis === axis} @change=${() => (this.axis = axis)} />
              ${t(axis === 'travel' ? 'results.travel' : 'results.time')}
            </label>`,
          )}
        </div>
        ${compared.length > 0 ? this.renderCharts(compared) : nothing}
        ${compared.length > 0 ? this.renderTable(compared) : nothing}
      </section>
    `;
  }

  private toggle(id: number): void {
    const excluded = new Set(this.excluded);
    if (!excluded.delete(id)) excluded.add(id);
    this.excluded = excluded;
  }

  private renderCharts(compared: Compared[]): Element[] {
    const { t, number } = this.context;
    const units = this.context.units;
    const xUnit = displayUnit(this.axis === 'travel' ? 'length' : 'time', units);
    const pressureUnit = displayUnit('pressure', units);
    const velocityUnit = displayUnit('velocity', units);
    const xOf = (simulation: Simulation) =>
      Float64Array.from(this.axis === 'travel' ? simulation.curve.travel : simulation.curve.time, xUnit.fromSi);
    const xLabel = `${this.axis === 'travel' ? t('results.travelAxis') : t('results.timeAxis')} (${xUnit.symbol})`;
    const formatX = (value: number) => number(value, this.axis === 'travel' ? (xUnit.id === 'in' ? 1 : 0) : 2);
    const [first, ...rest] = compared;
    const chart = (title: string, symbol: string, toUnit: (value: number) => number, values: (simulation: Simulation) => Float64Array) =>
      new LineChart({
        title,
        size: pairedChartSize(),
        x: xOf(first!.simulation),
        y: Float64Array.from(values(first!.simulation), toUnit),
        xLabel,
        yLabel: symbol,
        color: first!.color,
        formatX,
        formatY: (value) => number(value, 0),
        others: rest.map((entry) => ({ x: xOf(entry.simulation), y: Float64Array.from(values(entry.simulation), toUnit), color: entry.color })),
      }).element;
    const legend = element('ul', { class: 'chart-legend' }, compared.map((entry) => {
      const swatch = element('span', { class: 'swatch' });
      swatch.style.borderTopColor = entry.color;
      return element('li', {}, [swatch, entry.name]);
    }));
    return [
      element('div', { class: 'chart-pair' }, [
        chart(t('results.pressure'), pressureUnit.symbol, pressureUnit.fromSi, (simulation) => simulation.curve.pressure),
        chart(t('results.velocity'), velocityUnit.symbol, velocityUnit.fromSi, (simulation) => simulation.curve.velocity),
      ]),
      legend,
    ];
  }

  private renderTable(compared: Compared[]) {
    const { t, quantity, number } = this.context;
    return html`
      <table class="data-table compare-table">
        <thead>
          <tr>
            <th>${t('field.name')}</th>
            <th>${t('field.chargeMass')}</th>
            <th>${t('results.peakPressure')}</th>
            <th>%</th>
            <th>${t('results.muzzleVelocity')}</th>
            <th>${t('results.barrelTime')}</th>
            <th>${t('results.efficiency')}</th>
          </tr>
        </thead>
        <tbody>
          ${compared.map(({ name, load, simulation, color }) => {
            const share = simulation.maxPressure / load.cartridge.maxPressure;
            return html`<tr>
              <td class="name">
                <span class="swatch" style="border-top-color: ${color}"></span> ${name}
                ${load.propellant.calibration ? html`<span class="severity">(${t('compare.fitted')})</span>` : nothing}
              </td>
              <td>${quantity(load.charge.mass, 'chargeMass')}</td>
              <td>${quantity(simulation.maxPressure, 'pressure')}</td>
              <td class=${share > 1 ? 'critical' : ''}>${share > 1 ? '▲ ' : ''}${number(share * 100, 0)} %</td>
              <td>${quantity(simulation.muzzleVelocity, 'velocity')}</td>
              <td>${quantity(simulation.barrelTime, 'time')}</td>
              <td>${number(simulation.efficiency * 100, 1)} %</td>
            </tr>`;
          })}
        </tbody>
      </table>
      ${compared.some(({ load }) => load.propellant.calibration)
        ? html`<p class="warning">${t('compare.fittedNote')}</p>`
        : nothing}
    `;
  }
}

function displayName(document: OpenDocument): string {
  return document.name.replace(/\.json$/i, '');
}

customElements.define('gl-compare-view', CompareView);
