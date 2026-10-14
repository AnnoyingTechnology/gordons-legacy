import type { Load } from '@gordons-legacy/formats';
import { html, LitElement, nothing } from 'lit';
import { effectiveBoreArea, type BoreProfile } from '../editor/bore-area.ts';
import { displayUnit, formatNumber, parseNumber } from '../units/units.ts';
import type { UiContext } from './context.ts';

const PROFILES: BoreProfile[] = ['grooved', 'polygonal-corners', 'polygonal-rounded'];

/**
 * GRT's effective-bore-area assistant: the area computed from a barrel's measured rifling. Fires
 * `load-change` with the load using it, and `close`.
 */
export class BoreAreaDialog extends LitElement {
  static override properties = {
    load: { attribute: false },
    context: { attribute: false },
    open: { type: Boolean },
    profile: { state: true },
    values: { state: true },
  };

  declare load: Load;
  declare context: UiContext;
  declare open: boolean;
  declare profile: BoreProfile;
  /** Text typed in each length field, in the display unit; grooves is a count. */
  declare values: Record<'bore' | 'groove' | 'width' | 'grooves', string>;

  constructor() {
    super();
    this.open = false;
    this.profile = 'grooved';
    this.values = { bore: '', groove: '', width: '', grooves: '' };
  }

  protected override createRenderRoot(): HTMLElement {
    return this;
  }

  protected override willUpdate(changed: Map<string, unknown>): void {
    // Each opening starts from the cartridge's groove diameter.
    if (changed.has('open') && this.open) {
      const unit = displayUnit('length', this.context.units);
      this.values = { ...this.values, groove: formatNumber(unit.fromSi(this.load.cartridge.grooveDiameter), unit.decimals, 'en') };
    }
  }

  protected override updated(): void {
    const dialog = this.querySelector('dialog');
    if (!dialog) return;
    if (this.open && !dialog.open) dialog.showModal();
    if (!this.open && dialog.open) dialog.close();
  }

  protected override render() {
    const { t, quantity } = this.context;
    const length = displayUnit('length', this.context.units);
    const area = this.area();
    const field = (key: 'bore' | 'groove' | 'width' | 'grooves', label: string, unit: string) => html`
      <tr>
        <th><label for="bore-${key}">${label}</label></th>
        <td>
          <input
            id="bore-${key}"
            type="text"
            inputmode="decimal"
            .value=${this.values[key]}
            @input=${(event: Event) => (this.values = { ...this.values, [key]: (event.target as HTMLInputElement).value })}
          />
        </td>
        <td class="unit">${unit}</td>
      </tr>
    `;
    return html`
      <dialog class="bore-area-dialog" aria-labelledby="bore-area-title" @close=${() => this.dispatchEvent(new Event('close'))}>
        <h2 id="bore-area-title">${t('boreArea.title')}</h2>
        <p class="note">${t('boreArea.help')}</p>
        <table class="property-table">
          <tbody>
            <tr>
              <th><label for="bore-profile">${t('boreArea.profile')}</label></th>
              <td colspan="2">
                <select id="bore-profile" @change=${(event: Event) => (this.profile = (event.target as HTMLSelectElement).value as BoreProfile)}>
                  ${PROFILES.map((profile) => html`<option value=${profile} ?selected=${profile === this.profile}>${t(`boreArea.${profile}`)}</option>`)}
                </select>
              </td>
            </tr>
            ${field('bore', t('boreArea.boreDiameter'), length.symbol)}
            ${field('groove', t('boreArea.grooveDiameter'), length.symbol)}
            ${field('width', t('boreArea.grooveWidth'), length.symbol)}
            ${field('grooves', t('boreArea.grooves'), '')}
          </tbody>
        </table>
        <p class="bore-area-result">
          ${t('field.effectiveBoreArea')}: <strong>${area === undefined ? '—' : quantity(area, 'area')}</strong>
          (${t('boreArea.current')}: ${quantity(this.load.cartridge.effectiveBoreArea, 'area')})
        </p>
        <form method="dialog">
          <button>${t('choice.cancel')}</button>
          ${area === undefined ? nothing : html`<button @click=${() => this.use(area)}>${t('boreArea.use')}</button>`}
        </form>
      </dialog>
    `;
  }

  /** The area for the typed values, m², or undefined while one is missing or invalid. */
  private area(): number | undefined {
    const length = displayUnit('length', this.context.units);
    const read = (key: 'bore' | 'groove' | 'width') => {
      const value = parseNumber(this.values[key]);
      return value !== undefined && value > 0 ? length.toSi(value) : undefined;
    };
    const boreDiameter = read('bore');
    const grooveDiameter = read('groove');
    const grooveWidth = read('width');
    const grooves = parseNumber(this.values.grooves);
    if (boreDiameter === undefined || grooveDiameter === undefined || grooveWidth === undefined) return undefined;
    if (grooves === undefined || !Number.isInteger(grooves) || grooves < 1 || !(grooveDiameter > boreDiameter)) return undefined;
    const area = effectiveBoreArea({ profile: this.profile, boreDiameter, grooveDiameter, grooveWidth, grooves });
    return area > 0 && Number.isFinite(area) ? area : undefined;
  }

  private use(area: number): void {
    this.dispatchEvent(
      new CustomEvent('load-change', { detail: { ...this.load, cartridge: { ...this.load.cartridge, effectiveBoreArea: area } }, bubbles: true }),
    );
  }
}

customElements.define('gl-bore-area-dialog', BoreAreaDialog);
