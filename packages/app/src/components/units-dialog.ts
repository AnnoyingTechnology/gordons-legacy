import { html, LitElement } from 'lit';
import { CHOOSABLE_KINDS, displayUnit, unitsFor, type QuantityKind, type UnitPreferences } from '../units/units.ts';
import type { UiContext } from './context.ts';

/**
 * A dialog to choose the display unit of each kind of quantity. Fires `units-change` with the new
 * preferences on every choice, and `close` when dismissed.
 */
export class UnitsDialog extends LitElement {
  static override properties = {
    open: { type: Boolean },
    context: { attribute: false },
  };

  declare open: boolean;
  declare context: UiContext;

  constructor() {
    super();
    this.open = false;
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
    const { t } = this.context;
    return html`
      <dialog class="units-dialog" aria-labelledby="units-title" @close=${() => this.dispatchEvent(new Event('close'))}>
        <h2 id="units-title">${t('units.title')}</h2>
        <table class="property-table">
          <tbody>
            ${CHOOSABLE_KINDS.map((kind) => this.renderRow(kind))}
          </tbody>
        </table>
        <form method="dialog">
          <button>${t('units.done')}</button>
        </form>
      </dialog>
    `;
  }

  private renderRow(kind: QuantityKind) {
    const id = `unit-${kind}`;
    const current = displayUnit(kind, this.context.units).id;
    return html`
      <tr>
        <th><label for=${id}>${this.context.t(`quantity.${kind}`)}</label></th>
        <td>
          <select id=${id} @change=${(event: Event) => this.choose(kind, (event.target as HTMLSelectElement).value)}>
            ${unitsFor(kind).map((unit) => html`<option value=${unit.id} ?selected=${unit.id === current}>${unit.symbol}</option>`)}
          </select>
        </td>
      </tr>
    `;
  }

  private choose(kind: QuantityKind, unitId: string): void {
    const units: UnitPreferences = { ...this.context.units, [kind]: unitId };
    this.dispatchEvent(new CustomEvent('units-change', { detail: units }));
  }
}

customElements.define('gl-units-dialog', UnitsDialog);
