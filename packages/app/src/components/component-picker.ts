import type { CaliberDefinition, Load, Projectile, Propellant } from '@gordons-legacy/formats';
import { html, LitElement, nothing } from 'lit';
import { powderFactors } from '../analysis/powder-factors.ts';
import { icon } from '../icons/icons.ts';
import type { ComponentEntry, ComponentLibrary, ComponentSource } from '../state/components.ts';
import { displayUnit } from '../units/units.ts';
import type { UiContext } from './context.ts';

type PowderEntry = Extract<ComponentEntry, { kind: 'propellant' }>;
type ProjectileEntry = Extract<ComponentEntry, { kind: 'projectile' }>;
type CaliberEntry = Extract<ComponentEntry, { kind: 'caliber' }>;

/** Projectiles within this of the load's diameter count as the same diameter, m (0.05 mm). */
const SAME_DIAMETER = 0.00005;

/**
 * Chooses a powder or a projectile for the load from the component library. Powders are listed by GRT's
 * combined brisance and progressivity factor (its relative burning-rate table), and can be narrowed to
 * those near the load's own powder (GRT's parametric powder search). Fires `choose-propellant` or
 * `choose-projectile` with the component, and `close`.
 */
export class ComponentPicker extends LitElement {
  static override properties = {
    kind: { attribute: false },
    load: { attribute: false },
    library: { attribute: false },
    entries: { attribute: false },
    context: { attribute: false },
    filter: { state: true },
    similarOnly: { state: true },
    tolerance: { state: true },
    sameDiameter: { state: true },
    importErrors: { state: true },
  };

  /** What to choose; undefined when closed. */
  declare kind: 'propellant' | 'projectile' | 'caliber' | undefined;
  declare load: Load;
  declare library: ComponentLibrary;
  /** The library's entries, passed apart so that an import re-renders the list. */
  declare entries: ComponentEntry[];
  declare context: UiContext;
  declare filter: string;
  /** Powder search: only powders whose Brp is within `tolerance` of the load's powder. */
  declare similarOnly: boolean;
  /** Relative window on Brp, 0 to 1. */
  declare tolerance: number;
  declare sameDiameter: boolean;
  declare importErrors: string[];

  constructor() {
    super();
    this.filter = '';
    this.similarOnly = false;
    this.tolerance = 0.1;
    this.sameDiameter = true;
    this.importErrors = [];
    this.entries = [];
  }

  protected override createRenderRoot(): HTMLElement {
    return this;
  }

  protected override updated(): void {
    const dialog = this.querySelector('dialog');
    if (this.kind && dialog && !dialog.open) dialog.showModal();
    if (!this.kind && dialog?.open) dialog.close();
  }

  protected override render() {
    if (!this.kind) return html`<dialog class="component-picker"></dialog>`;
    const { t } = this.context;
    return html`
      <dialog class="component-picker" @close=${this.close}>
        <header class="picker-head">
          <h2>${icon(this.kind === 'caliber' ? 'cartridge' : this.kind)} ${t(TITLES[this.kind])}</h2>
          <input
            type="search"
            placeholder=${t('components.filter')}
            aria-label=${t('components.filter')}
            .value=${this.filter}
            @input=${(event: Event) => (this.filter = (event.target as HTMLInputElement).value)}
          />
          <span class="spacer"></span>
          <label class="button">
            ${icon('open')} ${t('components.importFiles')}
            <input type="file" accept=${`.${this.kind}`} multiple class="file-input" @change=${this.importFiles} />
          </label>
          <button aria-label=${t('app.close')} @click=${this.close}>${icon('close')}</button>
        </header>
        <p class="warning">${t(NOTICES[this.kind])}</p>
        <p class="note">${t(`components.source.${this.library.communitySource}`)}</p>
        ${this.importErrors.length > 0 ? html`<ul class="issues">${this.importErrors.map((message) => html`<li class="error">${message}</li>`)}</ul>` : nothing}
        ${this.kind === 'propellant' ? this.renderPowders() : this.kind === 'projectile' ? this.renderProjectiles() : this.renderCalibers()}
      </dialog>
    `;
  }

  private renderPowders() {
    const { t, number } = this.context;
    const own = powderFactors(this.load.propellant).combined;
    const rows = this.entries
      .filter((entry): entry is PowderEntry => entry.kind === 'propellant')
      .map((entry) => ({ entry, factors: powderFactors(entry.value) }))
      .filter(({ entry }) => matches(this.filter, `${entry.value.maker} ${entry.value.product} ${entry.value.lot} ${entry.source.author}`))
      .filter(({ factors }) => !this.similarOnly || Math.abs(factors.combined / own - 1) <= this.tolerance)
      .sort((a, b) => a.factors.combined - b.factors.combined);
    return html`
      <div class="picker-options">
        <label>
          <input type="checkbox" .checked=${this.similarOnly} @change=${(event: Event) => (this.similarOnly = (event.target as HTMLInputElement).checked)} />
          ${t('components.similarTo', { powder: powderName(this.load.propellant), brp: number(own, 3) })}
        </label>
        <label>
          ±
          <input
            type="number"
            min="1"
            max="100"
            step="1"
            .value=${String(Math.round(this.tolerance * 100))}
            @change=${(event: Event) => (this.tolerance = Math.max(0.01, Number((event.target as HTMLInputElement).value) / 100))}
          />
          %
        </label>
        <span class="note">${t('components.brpHelp')}</span>
      </div>
      <div class="table-scroll">
        <table class="data-table picker-table">
          <thead>
            <tr>
              <td></td>
              <th>${t('group.propellant')}</th>
              <th>${t('components.source')}</th>
              <th title=${t('components.brpHelp')}>Brp</th>
              <th>${t('components.versusLoad')}</th>
              <th>Br</th>
              <th>Bp</th>
              <th>Ba</th>
              <th>a0</th>
              <th>z1</th>
              <th>${t('field.heatOfExplosion')} (${displayUnit('specificEnergy', this.context.units).symbol})</th>
            </tr>
          </thead>
          <tbody>
            ${rows.map(
              ({ entry, factors }) => html`<tr>
                <td><button @click=${() => this.choose('choose-propellant', entry.value)}>${t('components.use')}</button></td>
                <td class="name">${powderName(entry.value)}${entry.value.lot ? html` <span class="note">${entry.value.lot}</span>` : nothing}</td>
                <td>${this.sourceText(entry.source)}</td>
                <td>${number(factors.combined, 3)}</td>
                <td>${signedPercent(factors.combined / own - 1, this.context)}</td>
                <td>${number(factors.brisance, 3)}</td>
                <td>${number(factors.progressivity, 3)}</td>
                <td>${number(entry.value.burnModel.vivacity, 3)}</td>
                <td>${number(entry.value.burnModel.a0, 3)}</td>
                <td>${number(entry.value.burnModel.z1, 3)}</td>
                <td>${number(displayUnit('specificEnergy', this.context.units).fromSi(entry.value.heatOfExplosion), 0)}</td>
              </tr>`,
            )}
          </tbody>
        </table>
      </div>
    `;
  }

  private renderProjectiles() {
    const { t, quantity, number } = this.context;
    const diameter = this.load.projectile.diameter;
    const rows = this.entries
      .filter((entry): entry is ProjectileEntry => entry.kind === 'projectile')
      .filter(({ value }) => !this.sameDiameter || Math.abs(value.diameter - diameter) <= SAME_DIAMETER)
      .filter((entry) => matches(this.filter, `${entry.value.name} ${entry.value.maker} ${entry.value.product} ${entry.source.author}`))
      .sort((a, b) => a.value.diameter - b.value.diameter || a.value.mass - b.value.mass);
    const lengthUnit = displayUnit('length', this.context.units);
    return html`
      <div class="picker-options">
        <label>
          <input type="checkbox" .checked=${this.sameDiameter} @change=${(event: Event) => (this.sameDiameter = (event.target as HTMLInputElement).checked)} />
          ${t('components.sameDiameter', { diameter: quantity(diameter, 'length') })}
        </label>
      </div>
      <div class="table-scroll">
        <table class="data-table picker-table">
          <thead>
            <tr>
              <td></td>
              <th>${t('group.projectile')}</th>
              <th>${t('components.source')}</th>
              <th>${t('field.diameter')} (${lengthUnit.symbol})</th>
              <th>${t('field.mass')}</th>
              <th>${t('field.length')} (${lengthUnit.symbol})</th>
              <th>${t('field.base')}</th>
              <th>BC G1</th>
              <th>BC G7</th>
            </tr>
          </thead>
          <tbody>
            ${rows.length === 0 ? html`<tr><td colspan="9" class="note">${t('components.none')}</td></tr>` : nothing}
            ${rows.map(
              (entry) => html`<tr>
                <td><button @click=${() => this.choose('choose-projectile', entry.value)}>${t('components.use')}</button></td>
                <td class="name">${entry.value.name}</td>
                <td>${this.sourceText(entry.source)}</td>
                <td>${number(lengthUnit.fromSi(entry.value.diameter), lengthUnit.decimals + 1)}</td>
                <td>${quantity(entry.value.mass, 'projectileMass')}</td>
                <td>${number(lengthUnit.fromSi(entry.value.length), lengthUnit.decimals)}</td>
                <td>${t(`base.${entry.value.base.shape}`)}</td>
                <td>${entry.value.ballisticCoefficientG1 === undefined ? '' : quantity(entry.value.ballisticCoefficientG1, 'ballisticCoefficient')}</td>
                <td>${entry.value.ballisticCoefficientG7 === undefined ? '' : quantity(entry.value.ballisticCoefficientG7, 'ballisticCoefficient')}</td>
              </tr>`,
            )}
          </tbody>
        </table>
      </div>
    `;
  }

  private renderCalibers() {
    const { t, quantity, number } = this.context;
    const groove = this.load.cartridge.grooveDiameter;
    const rows = this.entries
      .filter((entry): entry is CaliberEntry => entry.kind === 'caliber')
      .filter(({ value }) => !this.sameDiameter || (value.rifling !== undefined && Math.abs(value.rifling.grooveDiameter - groove) <= SAME_DIAMETER))
      .filter((entry) => matches(this.filter, `${entry.value.name} ${entry.value.alternativeNames} ${entry.value.standard} ${entry.source.author}`))
      .sort((a, b) => a.value.name.localeCompare(b.value.name, undefined, { numeric: true }));
    const lengthUnit = displayUnit('length', this.context.units);
    /** A length in the user's unit, without the symbol (the column header has it); empty when not given. */
    const lengthCell = (metres: number | undefined) => (metres ? number(lengthUnit.fromSi(metres), lengthUnit.decimals) : '');
    return html`
      <div class="picker-options">
        <label>
          <input type="checkbox" .checked=${this.sameDiameter} @change=${(event: Event) => (this.sameDiameter = (event.target as HTMLInputElement).checked)} />
          ${t('components.sameGroove', { diameter: quantity(groove, 'length') })}
        </label>
      </div>
      <div class="table-scroll">
        <table class="data-table picker-table">
          <thead>
            <tr>
              <td></td>
              <th>${t('group.cartridge')}</th>
              <th>${t('components.source')}</th>
              <th>${t('components.standard')}</th>
              <th>${t('field.maxPressure')}</th>
              <th>${t('field.grooveDiameter')} (${lengthUnit.symbol})</th>
              <th>${t('field.caseLength')} (${lengthUnit.symbol})</th>
              <th>${t('components.maximumOverallLength')} (${lengthUnit.symbol})</th>
            </tr>
          </thead>
          <tbody>
            ${rows.length === 0 ? html`<tr><td colspan="8" class="note">${t('components.noCaliber')}</td></tr>` : nothing}
            ${rows.map(
              (entry) => html`<tr>
                <td><button @click=${() => this.choose('choose-caliber', entry.value)}>${t('components.use')}</button></td>
                <td class="name" title=${entry.value.alternativeNames}>${entry.value.name}</td>
                <td>${this.sourceText(entry.source)}</td>
                <td>${entry.value.standard}</td>
                <td>${entry.value.maxPressure > 0 ? quantity(entry.value.maxPressure, 'pressure') : ''}</td>
                <td>${lengthCell(entry.value.rifling?.grooveDiameter)}</td>
                <td>${lengthCell(entry.value.caseDimensions?.caseLength)}</td>
                <td>${lengthCell(entry.value.caseDimensions?.maximumOverallLength)}</td>
              </tr>`,
            )}
          </tbody>
        </table>
      </div>
    `;
  }

  private sourceText(source: ComponentSource) {
    const { t } = this.context;
    return source.origin === 'community'
      ? html`<span class="level-badge note" title=${source.file}>${t('components.community')}</span> ${source.author} ${source.date}`
      : html`<span class="level-badge" title=${source.file}>${t('components.yours')}</span> ${source.date}`;
  }

  private choose(event: 'choose-propellant' | 'choose-projectile' | 'choose-caliber', value: Propellant | Projectile | CaliberDefinition): void {
    this.dispatchEvent(new CustomEvent(event, { detail: value, bubbles: true }));
    this.close();
  }

  private importFiles = async (event: Event) => {
    const input = event.target as HTMLInputElement;
    const errors: string[] = [];
    for (const file of input.files ?? []) errors.push(...(await this.library.importFile(file.name, await file.text())));
    this.importErrors = errors;
    input.value = '';
  };

  private close = () => {
    this.importErrors = [];
    this.dispatchEvent(new CustomEvent('close'));
  };
}

const TITLES = {
  propellant: 'components.choosePowder',
  projectile: 'components.chooseProjectileTitle',
  caliber: 'components.chooseCaliber',
} as const;

const NOTICES = {
  propellant: 'components.powderNotice',
  projectile: 'components.projectileNotice',
  caliber: 'components.caliberNotice',
} as const;

function powderName(propellant: Propellant): string {
  return `${propellant.maker} ${propellant.product}`.trim();
}

function matches(filter: string, text: string): boolean {
  const lower = text.toLowerCase();
  return filter.toLowerCase().split(/\s+/).filter(Boolean).every((word) => lower.includes(word));
}

function signedPercent(change: number, context: UiContext): string {
  if (Math.abs(change) < 0.0005) return '0 %';
  return `${change > 0 ? '+' : '−'}${context.number(Math.abs(change) * 100, 1)} %`;
}

customElements.define('gl-component-picker', ComponentPicker);
