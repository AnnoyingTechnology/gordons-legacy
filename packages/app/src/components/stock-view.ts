import { html, LitElement, nothing } from 'lit';
import { icon } from '../icons/icons.ts';
import { lowStock, STOCK_KINDS, type StockItem, type StockKind } from '../state/inventory.ts';
import { displayUnit, formatNumber, parseNumber } from '../units/units.ts';
import type { UiContext } from './context.ts';

/**
 * `<gl-stock-view>`: the stock on the shelf (issues #10, #21), in the library view below the guns. Every
 * cell is edited in place and saved when it is left. Fires `save-stock` with an item (no `id` for a new
 * one) and `remove-stock` with an id; the shell keeps the stock.
 */
export class StockView extends LitElement {
  static override properties = {
    items: { attribute: false },
    context: { attribute: false },
  };

  declare items: StockItem[];
  declare context: UiContext;

  constructor() {
    super();
    this.items = [];
  }

  protected override createRenderRoot(): HTMLElement {
    return this;
  }

  protected override render() {
    const { t } = this.context;
    const low = lowStock(this.items);
    const sorted = [...this.items].sort((a, b) => STOCK_KINDS.indexOf(a.kind) - STOCK_KINDS.indexOf(b.kind) || a.name.localeCompare(b.name, undefined, { numeric: true }));
    return html`
      <section class="stock">
        <header class="library-head">
          <h2>${icon('propellant')} ${t('stock.title')}</h2>
          <span class="spacer"></span>
          <button @click=${() => this.fire('save-stock', { kind: 'powder', name: '', quantity: 0 })}>${icon('add')} ${t('stock.add')}</button>
        </header>
        <p class="note">${t('stock.help')}</p>
        ${low.length > 0 ? html`<p class="warning" role="status">${t('stock.low', { names: low.map((item) => item.name || t(`stock.kind.${item.kind}`)).join(', ') })}</p>` : nothing}
        ${sorted.length === 0
          ? html`<p class="empty-message">${t('stock.empty')}</p>`
          : html`<div class="table-scroll"><table class="data-table stock-table">
              <thead><tr>
                <th>${t('stock.kind')}</th><th>${t('field.name')}</th><th class="number">${t('stock.quantity')}</th>
                <th class="number">${t('stock.lowLevel')}</th><td></td>
              </tr></thead>
              <tbody>${sorted.map((item) => this.renderRow(item, low.includes(item)))}</tbody>
            </table></div>`}
      </section>
    `;
  }

  private renderRow(item: StockItem, isLow: boolean) {
    const { t } = this.context;
    const name = item.name || t(`stock.kind.${item.kind}`);
    return html`<tr class=${isLow ? 'low' : ''}>
      <td>
        <select aria-label=${t('stock.kind')} @change=${(event: Event) => this.fire('save-stock', { ...item, kind: (event.target as HTMLSelectElement).value as StockKind })}>
          ${STOCK_KINDS.map((kind) => html`<option value=${kind} ?selected=${kind === item.kind}>${t(`stock.kind.${kind}`)}</option>`)}
        </select>
      </td>
      <td>
        <input type="text" aria-label=${t('field.name')} .value=${item.name}
          @change=${(event: Event) => this.fire('save-stock', { ...item, name: (event.target as HTMLInputElement).value.trim() })} />
      </td>
      <td class="number">${this.amountInput(item, 'quantity')}</td>
      <td class="number">${this.amountInput(item, 'lowStock')}</td>
      <td>
        <button class="remove" aria-label=${t('stock.remove', { name })} title=${t('stock.remove', { name })}
          @click=${() => { if (window.confirm(t('library.confirmRemove', { name }))) this.fire('remove-stock', item.id); }}>
          ${icon('close')}
        </button>
      </td>
    </tr>`;
  }

  /** A quantity in the item's unit: powder by the chosen mass unit, the rest a count. */
  private amountInput(item: StockItem, field: 'quantity' | 'lowStock') {
    const { t } = this.context;
    const unit = item.kind === 'powder' ? displayUnit('powderStock', this.context.units) : undefined;
    const value = item[field];
    const shown = value === undefined ? '' : unit ? formatNumber(unit.fromSi(value), unit.decimals, 'en').replace(/,/g, '') : String(value);
    return html`<input type="text" inputmode="decimal" class="amount" aria-label=${t(field === 'quantity' ? 'stock.quantity' : 'stock.lowLevel')} .value=${shown}
      @change=${(event: Event) => {
        const input = event.target as HTMLInputElement;
        const text = input.value.trim();
        if (text === '' && field === 'lowStock') {
          const { lowStock: _lowStock, ...rest } = item;
          this.fire('save-stock', rest);
          return;
        }
        const typed = parseNumber(text);
        if (typed === undefined || typed < 0) {
          input.value = shown; // not a quantity: the stored one stays
          return;
        }
        this.fire('save-stock', { ...item, [field]: unit ? unit.toSi(typed) : Math.round(typed) });
      }} />${unit ? html` <span class="unit">${unit.symbol}</span>` : nothing}`;
  }

  private fire(type: 'save-stock' | 'remove-stock', detail: unknown): void {
    this.dispatchEvent(new CustomEvent(type, { detail, bubbles: true }));
  }
}

customElements.define('gl-stock-view', StockView);
