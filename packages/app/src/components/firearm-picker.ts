import type { Firearm, Load } from '@gordons-legacy/formats';
import { html, LitElement, nothing } from 'lit';
import { icon } from '../icons/icons.ts';
import { chamberedFor, firearmLabel } from '../state/firearms.ts';
import type { UiContext } from './context.ts';

/**
 * Chooses the gun a load is fired in (issues #24 and #30): the user's own guns first, then the makers'
 * published specifications. It searches instead of scrolling, because the published database holds
 * thousands of guns.
 *
 * Fires `choose-firearm` with the gun, and `close`.
 */

/** Rows drawn at once. A table of a few thousand rows makes a phone stutter for no use to anyone. */
const MOST_ROWS = 200;

export class FirearmPicker extends LitElement {
  static override properties = {
    open: { attribute: false },
    load: { attribute: false },
    firearms: { attribute: false },
    loading: { attribute: false },
    context: { attribute: false },
    filter: { state: true },
    chamberedOnly: { state: true },
  };

  declare open: boolean;
  declare load: Load;
  /** The guns to choose from: the user's own, the barrels of their loads, then the published ones. */
  declare firearms: Firearm[];
  /** True while the published database is still being fetched. */
  declare loading: boolean;
  declare context: UiContext;
  declare filter: string;
  /** Narrows the list to the guns whose maker lists the load's cartridge. */
  declare chamberedOnly: boolean;

  constructor() {
    super();
    this.open = false;
    this.firearms = [];
    this.loading = false;
    this.filter = '';
    this.chamberedOnly = true;
  }

  protected override createRenderRoot(): HTMLElement {
    return this;
  }

  protected override updated(): void {
    const dialog = this.querySelector('dialog');
    if (this.open && dialog && !dialog.open) {
      dialog.showModal();
      this.querySelector<HTMLInputElement>('input[type="search"]')?.focus();
    }
    if (!this.open && dialog?.open) dialog.close();
  }

  /** The guns that match the search, and how many there are before the list is cut. */
  private matching(): { rows: Firearm[]; total: number } {
    const cartridge = this.load.cartridge.name;
    const found = this.firearms
      .filter((firearm) => !this.chamberedOnly || chamberedFor(firearm, cartridge))
      .filter((firearm) => matches(this.filter, `${firearm.name} ${firearm.maker ?? ''} ${firearm.model ?? ''} ${firearm.cartridge ?? ''}`));
    return { rows: found.slice(0, MOST_ROWS), total: found.length };
  }

  protected override render() {
    if (!this.open) return html`<dialog class="component-picker"></dialog>`;
    const { t, quantity } = this.context;
    const { rows, total } = this.matching();
    return html`
      <dialog class="component-picker" @close=${this.close}>
        <header class="picker-head">
          <h2>${icon('barrel')} ${t('firearm.pickTitle')}</h2>
          <input
            type="search"
            placeholder=${t('firearm.search')}
            aria-label=${t('firearm.search')}
            .value=${this.filter}
            @input=${(event: Event) => (this.filter = (event.target as HTMLInputElement).value)}
          />
          <span class="spacer"></span>
          <button aria-label=${t('app.close')} @click=${this.close}>${icon('close')}</button>
        </header>
        <p class="warning">${t('firearm.publishedNote')}</p>
        <div class="picker-options">
          <label>
            <input
              type="checkbox"
              .checked=${this.chamberedOnly}
              @change=${(event: Event) => (this.chamberedOnly = (event.target as HTMLInputElement).checked)}
            />
            ${t('firearm.chambered')}
          </label>
          <span class="note">${this.loading ? t('firearm.databaseLoading') : t('firearm.database', { count: String(this.firearms.length) })}</span>
        </div>
        <div class="table-scroll">
          <table class="data-table picker-table">
            <thead>
              <tr>
                <td></td>
                <th>${t('firearm.one')}</th>
                <th>${t('firearm.cartridge')}</th>
                <th>${t('field.barrelLength')}</th>
                <th>${t('field.twistLength')}</th>
                <th>${t('field.gunMass')}</th>
                <th>${t('firearm.sourceKind')}</th>
              </tr>
            </thead>
            <tbody>
              ${rows.length === 0 ? html`<tr><td colspan="7" class="note">${t('firearm.noneFound')}</td></tr>` : nothing}
              ${rows.map(
                (firearm) => html`<tr>
                  <td><button @click=${() => this.choose(firearm)}>${t('components.use')}</button></td>
                  <td class="name">${firearmLabel(firearm)}</td>
                  <td>${firearm.cartridge ?? ''}</td>
                  <td class="number">${quantity(firearm.barrel.length, 'barrelLength')}</td>
                  <td class="number">${firearm.barrel.twistLength === undefined ? '' : quantity(firearm.barrel.twistLength, 'twistLength')}</td>
                  <td class="number">${this.massCell(firearm)}</td>
                  <td>${this.sourceCell(firearm)}</td>
                </tr>`,
              )}
            </tbody>
          </table>
        </div>
        ${total > rows.length ? html`<p class="note">${t('firearm.showingFirst', { shown: String(rows.length), total: String(total) })}</p>` : nothing}
      </dialog>
    `;
  }

  /** The mass, with the maker's own figure in reach and a mark when nobody said what it includes. */
  private massCell(firearm: Firearm) {
    const { t, quantity } = this.context;
    const mass = firearm.barrel.gunMass;
    if (mass === undefined) return '';
    const source = firearm.source;
    const unstated = source?.kind === 'published' && (source.massBasis === undefined || source.massBasis === 'unstated');
    return html`<span title=${source?.published?.['weight'] ?? ''}>${quantity(mass, 'gunMass')}</span>${unstated
      ? html`<span class="note" title=${t('firearm.massUnstated')}> ?</span>`
      : nothing}`;
  }

  /** Where a gun's figures come from: the user's own gun, or a maker's published specification. */
  private sourceCell(firearm: Firearm) {
    const { t } = this.context;
    const source = firearm.source;
    if (source?.kind !== 'published') return html`<span class="level-badge">${t('components.yours')}</span>`;
    return html`<span class="level-badge note" title=${source.url ?? ''}>${t('firearm.published')}</span> ${source.publisher ?? ''}`;
  }

  private choose(firearm: Firearm): void {
    this.dispatchEvent(new CustomEvent('choose-firearm', { detail: firearm, bubbles: true }));
    this.close();
  }

  private close = () => {
    this.dispatchEvent(new CustomEvent('close'));
  };
}

/** Whether every word of the search is somewhere in the text, in any order and any case. */
function matches(filter: string, text: string): boolean {
  const haystack = text.toLowerCase();
  return filter
    .toLowerCase()
    .split(/\s+/)
    .filter((word) => word !== '')
    .every((word) => haystack.includes(word));
}

customElements.define('gl-firearm-picker', FirearmPicker);
