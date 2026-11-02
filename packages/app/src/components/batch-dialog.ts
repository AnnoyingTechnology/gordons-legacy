import type { Load } from '@gordons-legacy/formats';
import { html, LitElement, nothing } from 'lit';
import { batchUses, type StockItem, type Use } from '../state/inventory.ts';
import { displayUnit, formatNumber, parseNumber } from '../units/units.ts';
import type { UiContext } from './context.ts';

/**
 * Records a batch of a load (issues #10, #21): how many rounds, and what came off the shelf. The powder
 * and projectile named like the load's are ticked with what the batch used; primers and cases, which a
 * load does not name, are ticked by hand at one a round. Fires `use-stock` with the uses, and `close`.
 */
export class BatchDialog extends LitElement {
  static override properties = {
    /** The load and its name; undefined hides the dialog. */
    batch: { attribute: false },
    items: { attribute: false },
    context: { attribute: false },
    roundsText: { state: true },
    ticked: { state: true },
  };

  declare batch: { name: string; load: Load } | undefined;
  declare items: StockItem[];
  declare context: UiContext;
  declare roundsText: string;
  /** The ticked items, by id. */
  declare ticked: Set<string>;

  constructor() {
    super();
    this.batch = undefined;
    this.items = [];
    this.roundsText = '50';
    this.ticked = new Set();
  }

  protected override createRenderRoot(): HTMLElement {
    return this;
  }

  protected override willUpdate(changed: Map<string, unknown>): void {
    // A new batch starts with what the names tell.
    if (changed.has('batch') && this.batch) this.ticked = new Set(batchUses(this.batch.load, 1, this.items).map((use) => use.id));
  }

  protected override updated(): void {
    const dialog = this.querySelector('dialog');
    if (this.batch && !dialog?.open) dialog?.showModal();
    if (!this.batch && dialog?.open) dialog.close();
  }

  /** The uses of the ticked items for the rounds typed: the matched amounts, else one a round. */
  uses(): Use[] {
    const rounds = this.rounds();
    if (!this.batch || rounds === undefined) return [];
    const matched = new Map(batchUses(this.batch.load, rounds, this.items).map((use) => [use.id, use.amount]));
    return this.items
      .filter((item) => this.ticked.has(item.id))
      .map((item) => ({ id: item.id, amount: matched.get(item.id) ?? (item.kind === 'powder' ? rounds * this.batch!.load.charge.mass : rounds) }));
  }

  private rounds(): number | undefined {
    const value = parseNumber(this.roundsText);
    return value !== undefined && Number.isInteger(value) && value > 0 ? value : undefined;
  }

  protected override render() {
    const { t } = this.context;
    const uses = new Map(this.uses().map((use) => [use.id, use.amount]));
    const powderUnit = displayUnit('powderStock', this.context.units);
    const nothingMatched = this.batch !== undefined && batchUses(this.batch.load, 1, this.items).length === 0;
    return html`
      <dialog aria-labelledby="batch-heading" @close=${() => this.dispatchEvent(new Event('close'))}>
        <h2 id="batch-heading">${this.batch ? t('stock.recordBatchOf', { name: this.batch.name }) : ''}</h2>
        <label>${t('stock.rounds')}
          <input type="text" inputmode="numeric" .value=${this.roundsText} @input=${(event: Event) => (this.roundsText = (event.target as HTMLInputElement).value)} />
        </label>
        ${nothingMatched ? html`<p class="note">${t('stock.nothingMatches')}</p>` : nothing}
        <fieldset>
          <legend>${t('stock.uses')}</legend>
          ${this.items.length === 0 ? html`<p class="empty-message">${t('stock.empty')}</p>` : nothing}
          ${this.items.map((item) => {
            const amount = uses.get(item.id);
            const shown = amount === undefined ? '' : item.kind === 'powder' ? `${formatNumber(powderUnit.fromSi(amount), powderUnit.decimals + 1, this.context.language)} ${powderUnit.symbol}` : String(amount);
            return html`<label class="batch-use">
              <input type="checkbox" .checked=${this.ticked.has(item.id)} @change=${() => this.toggle(item.id)} />
              ${t(`stock.kind.${item.kind}`)} · ${item.name} ${shown ? html`<span class="note">− ${shown}</span>` : nothing}
            </label>`;
          })}
        </fieldset>
        <div class="dialog-actions">
          <button ?disabled=${this.rounds() === undefined || uses.size === 0} @click=${this.confirm}>${t('stock.confirm')}</button>
          <form method="dialog"><button>${t('app.close')}</button></form>
        </div>
      </dialog>
    `;
  }

  private toggle(id: string): void {
    const ticked = new Set(this.ticked);
    if (!ticked.delete(id)) ticked.add(id);
    this.ticked = ticked;
  }

  private confirm = (): void => {
    this.dispatchEvent(new CustomEvent('use-stock', { detail: this.uses() }));
  };
}

customElements.define('gl-batch-dialog', BatchDialog);
