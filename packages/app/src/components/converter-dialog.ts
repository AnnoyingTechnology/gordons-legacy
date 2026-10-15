import { html, LitElement } from 'lit';
import { CONVERSIONS, convertAll, type ConverterDimension } from '../units/conversions.ts';
import { formatNumber, parseNumber } from '../units/units.ts';
import type { UiContext } from './context.ts';

/**
 * GRT's unit-of-measure calculator: a value in one unit, shown in every unit of its dimension. It opens
 * in the middle of the screen over a light mask (issue #28), unlike GRT's floating window. Fires `close`.
 */
export class ConverterDialog extends LitElement {
  static override properties = {
    open: { type: Boolean },
    context: { attribute: false },
    dimension: { state: true },
    from: { state: true },
    text: { state: true },
    decimals: { state: true },
  };

  declare open: boolean;
  declare context: UiContext;
  declare dimension: ConverterDimension;
  declare from: string;
  declare text: string;
  declare decimals: number;

  constructor() {
    super();
    this.open = false;
    this.dimension = 'mass';
    this.from = 'gr';
    this.text = '1';
    this.decimals = 3;
  }

  protected override createRenderRoot(): HTMLElement {
    return this;
  }

  protected override updated(): void {
    const dialog = this.querySelector('dialog');
    if (!dialog) return;
    if (this.open && !dialog.open) dialog.showModal();
    if (!this.open && dialog.open) dialog.close();
  }

  protected override render() {
    const { t, language } = this.context;
    const value = parseNumber(this.text);
    const results = value === undefined ? [] : convertAll(this.dimension, value, this.from);
    return html`
      <dialog class="converter-dialog" aria-labelledby="converter-title" @close=${() => this.dispatchEvent(new Event('close'))}>
        <h2 id="converter-title">${t('converter.title')}</h2>
        <div class="converter-input">
          <select class="converter-dimension" aria-label=${t('converter.dimension')} @change=${this.setDimension}>
            ${(Object.keys(CONVERSIONS) as ConverterDimension[]).map(
              (dimension) => html`<option value=${dimension} ?selected=${dimension === this.dimension}>${t(`converter.${dimension}`)}</option>`,
            )}
          </select>
          <div class="converter-value">
            <input type="text" inputmode="decimal" aria-label=${t('converter.value')} .value=${this.text}
              @input=${(event: Event) => (this.text = (event.target as HTMLInputElement).value)} />
            <select aria-label=${t('converter.unit')} @change=${(event: Event) => (this.from = (event.target as HTMLSelectElement).value)}>
              ${CONVERSIONS[this.dimension].map((unit) => html`<option value=${unit.id} ?selected=${unit.id === this.from}>${unit.symbol}</option>`)}
            </select>
          </div>
        </div>
        <ul class="converter-results">
          ${results.map(
            ({ unit, value: converted }) => html`<li>
              <span class="converted">${formatNumber(converted, this.decimals, language)}</span>
              <span class="unit">${unit.symbol}</span>
            </li>`,
          )}
        </ul>
        <label class="converter-decimals">
          ${t('converter.decimals')}
          <input type="number" min="0" max="8" .value=${String(this.decimals)}
            @change=${(event: Event) => (this.decimals = Math.max(0, Math.min(8, Number((event.target as HTMLInputElement).value) || 0)))} />
        </label>
        <form method="dialog"><button>${t('units.done')}</button></form>
      </dialog>
    `;
  }

  private setDimension = (event: Event) => {
    this.dimension = (event.target as HTMLSelectElement).value as ConverterDimension;
    this.from = CONVERSIONS[this.dimension][0]!.id;
  };
}

customElements.define('gl-converter-dialog', ConverterDialog);
