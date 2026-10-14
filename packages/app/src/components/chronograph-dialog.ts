import type { Load, MeasurementSeries } from '@gordons-legacy/formats';
import { html, LitElement, nothing } from 'lit';
import type { ChronographCsv, VelocityUnit } from '../measurements/chronograph-csv.ts';
import { shotStatistics } from '../measurements/statistics.ts';
import { displayUnit, formatNumber, parseNumber } from '../units/units.ts';
import type { UiContext } from './context.ts';

const FEET_PER_SECOND = 0.3048;

/**
 * Confirms a chronograph CSV import: the velocity column, its unit and the charge they were fired
 * with. The file's own statement of its unit is preselected; without one, the user must choose, since
 * a wrong unit would spoil every comparison and calibration. Fires `measurements` with the series, and
 * `close`.
 */
export class ChronographDialog extends LitElement {
  static override properties = {
    csv: { attribute: false },
    fileName: { attribute: false },
    load: { attribute: false },
    context: { attribute: false },
    column: { state: true },
    unit: { state: true },
    charge: { state: true },
  };

  /** The file read; the dialog shows while it is set. */
  declare csv: ChronographCsv | undefined;
  declare fileName: string;
  declare load: Load;
  declare context: UiContext;
  declare column: number;
  declare unit: VelocityUnit | undefined;
  /** The charge as typed, in the display unit. */
  declare charge: string;

  constructor() {
    super();
    this.csv = undefined;
    this.fileName = '';
    this.column = 0;
    this.unit = undefined;
    this.charge = '';
  }

  protected override createRenderRoot(): HTMLElement {
    return this;
  }

  protected override willUpdate(changed: Map<string, unknown>): void {
    if (changed.has('csv') && this.csv) {
      this.column = this.csv.suggestedColumn;
      this.unit = this.csv.statedUnit;
      const unit = displayUnit('chargeMass', this.context.units);
      this.charge = formatNumber(unit.fromSi(this.load.charge.mass), unit.decimals, 'en');
    }
  }

  protected override updated(): void {
    const dialog = this.querySelector('dialog');
    if (!dialog) return;
    if (this.csv && !dialog.open) dialog.showModal();
    if (!this.csv && dialog.open) dialog.close();
  }

  protected override render() {
    const { t, quantity } = this.context;
    const csv = this.csv;
    const velocities = this.velocities();
    const statistics = velocities ? shotStatistics(velocities) : undefined;
    const chargeUnit = displayUnit('chargeMass', this.context.units);
    return html`
      <dialog class="chronograph-dialog" aria-labelledby="chronograph-title" @close=${() => this.dispatchEvent(new Event('close'))}>
        <h2 id="chronograph-title">${t('chronograph.title')}</h2>
        <p class="note">${this.fileName} · ${t('chronograph.help')}</p>
        ${csv
          ? html`<table class="property-table">
              <tbody>
                <tr>
                  <th><label for="chronograph-column">${t('chronograph.column')}</label></th>
                  <td>
                    <select id="chronograph-column" @change=${(event: Event) => (this.column = Number((event.target as HTMLSelectElement).value))}>
                      ${csv.columns.map(
                        (column, index) =>
                          html`<option value=${index} ?selected=${index === this.column}>${column.header} (${column.values.slice(0, 3).join(', ')}…)</option>`,
                      )}
                    </select>
                  </td>
                </tr>
                <tr>
                  <th><label for="chronograph-unit">${t('chronograph.unit')}</label></th>
                  <td>
                    <select id="chronograph-unit" @change=${(event: Event) => (this.unit = (event.target as HTMLSelectElement).value as VelocityUnit)}>
                      ${this.unit === undefined ? html`<option value="" selected disabled>${t('chronograph.chooseUnit')}</option>` : nothing}
                      <option value="m/s" ?selected=${this.unit === 'm/s'}>m/s</option>
                      <option value="ft/s" ?selected=${this.unit === 'ft/s'}>ft/s</option>
                    </select>
                    ${csv.statedUnit ? html`<span class="note">${t('chronograph.statedUnit')}</span>` : nothing}
                  </td>
                </tr>
                <tr>
                  <th><label for="chronograph-charge">${t('field.chargeMass')}</label></th>
                  <td>
                    <input id="chronograph-charge" type="text" inputmode="decimal" .value=${this.charge}
                      @input=${(event: Event) => (this.charge = (event.target as HTMLInputElement).value)} />
                    ${chargeUnit.symbol}
                  </td>
                </tr>
              </tbody>
            </table>
            <p>
              ${statistics
                ? html`${statistics.count} ${t('measurements.shots').toLowerCase()} · ${t('measurements.mean')}
                    <strong>${quantity(statistics.mean, 'velocity')}</strong>
                    ${statistics.standardDeviation === undefined ? nothing : html` · SD ${quantity(statistics.standardDeviation, 'velocity', 1)}`}`
                : t('chronograph.chooseUnit')}
            </p>`
          : nothing}
        <form method="dialog">
          <button>${t('choice.cancel')}</button>
          ${velocities && this.chargeMass() !== undefined
            ? html`<button @click=${this.add}>${t('chronograph.add')}</button>`
            : nothing}
        </form>
      </dialog>
    `;
  }

  /** The chosen column's velocities in m/s, once a unit is chosen. */
  private velocities(): number[] | undefined {
    const column = this.csv?.columns[this.column];
    if (!column || this.unit === undefined) return undefined;
    return column.values.map((value) => (this.unit === 'ft/s' ? value * FEET_PER_SECOND : value));
  }

  private chargeMass(): number | undefined {
    const value = parseNumber(this.charge);
    return value !== undefined && value > 0 ? displayUnit('chargeMass', this.context.units).toSi(value) : undefined;
  }

  private add = () => {
    const velocities = this.velocities();
    const chargeMass = this.chargeMass();
    if (!velocities || chargeMass === undefined) return;
    const header = this.csv?.columns[this.column]?.header ?? '';
    const series: MeasurementSeries = {
      title: this.fileName,
      showInReport: true,
      charges: [
        {
          label: 'Charge 1',
          note: `${this.fileName}, ${header}`,
          chargeMass,
          showInReport: true,
          shots: velocities.map((velocity, index) => ({ velocity, label: `Shot ${index + 1}`, note: '' })),
        },
      ],
    };
    this.dispatchEvent(new CustomEvent('measurements', { detail: series }));
  };
}

customElements.define('gl-chronograph-dialog', ChronographDialog);
