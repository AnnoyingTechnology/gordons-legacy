import { checkCaliber, type CaliberDefinition, type CaseDimensions, type ChamberDimensions, type Load, type Rifling } from '@gordons-legacy/formats';
import { html, LitElement, nothing } from 'lit';
import { technicalDrawing } from '../drawing/technical-drawing.ts';
import type { MessageKey } from '../i18n/i18n.ts';
import { icon } from '../icons/icons.ts';
import { displayUnit, formatNumber, parseNumber, type QuantityKind } from '../units/units.ts';
import type { UiContext } from './context.ts';

/** One editable value of a caliber definition: its letter on the standard's drawing, its label and its kind. */
interface NumberEntry<Key extends string> {
  key: Key;
  letter: string;
  label: MessageKey;
  kind: QuantityKind | 'count';
}

const CASE_FIELDS: NumberEntry<keyof CaseDimensions>[] = [
  { key: 'caseLength', letter: 'L3', label: 'designer.caseLength', kind: 'length' },
  { key: 'shoulderStart', letter: 'L1', label: 'designer.shoulderStart', kind: 'length' },
  { key: 'neckStart', letter: 'L2', label: 'designer.neckStart', kind: 'length' },
  { key: 'maximumOverallLength', letter: 'L6', label: 'designer.maximumOverallLength', kind: 'length' },
  { key: 'rimDiameter', letter: 'R1', label: 'designer.rimDiameter', kind: 'length' },
  { key: 'rimThickness', letter: 'R', label: 'designer.rimThickness', kind: 'length' },
  { key: 'bodyBaseDistance', letter: 'E', label: 'designer.bodyBaseDistance', kind: 'length' },
  { key: 'bodyBaseDiameter', letter: 'P1', label: 'designer.bodyBaseDiameter', kind: 'length' },
  { key: 'shoulderDiameter', letter: 'P2', label: 'designer.shoulderDiameter', kind: 'length' },
  { key: 'neckDiameter', letter: 'H1', label: 'designer.neckDiameter', kind: 'length' },
  { key: 'mouthDiameter', letter: 'H2', label: 'designer.mouthDiameter', kind: 'length' },
  { key: 'projectileDiameter', letter: 'G1', label: 'designer.projectileDiameter', kind: 'length' },
];

const CHAMBER_FIELDS: NumberEntry<keyof ChamberDimensions>[] = [
  { key: 'bodyBaseDistance', letter: 'E', label: 'designer.bodyBaseDistance', kind: 'length' },
  { key: 'bodyBaseDiameter', letter: 'P1', label: 'designer.bodyBaseDiameter', kind: 'length' },
  { key: 'shoulderStart', letter: 'L1', label: 'designer.shoulderStart', kind: 'length' },
  { key: 'shoulderDiameter', letter: 'P2', label: 'designer.shoulderDiameter', kind: 'length' },
  { key: 'neckStart', letter: 'L2', label: 'designer.neckStart', kind: 'length' },
  { key: 'neckDiameter', letter: 'H1', label: 'designer.neckDiameter', kind: 'length' },
  { key: 'neckEnd', letter: 'L3', label: 'designer.neckEnd', kind: 'length' },
  { key: 'mouthDiameter', letter: 'H2', label: 'designer.mouthDiameter', kind: 'length' },
  { key: 'throatDiameter', letter: 'G1', label: 'designer.throatDiameter', kind: 'length' },
];

const RIFLING_FIELDS: NumberEntry<keyof Rifling>[] = [
  { key: 'grooveDiameter', letter: 'Z', label: 'field.grooveDiameter', kind: 'length' },
  { key: 'boreDiameter', letter: 'F', label: 'designer.boreDiameter', kind: 'length' },
  { key: 'effectiveBoreArea', letter: 'Q', label: 'field.effectiveBoreArea', kind: 'area' },
  { key: 'grooves', letter: 'N', label: 'designer.grooves', kind: 'count' },
  { key: 'grooveWidth', letter: 'b', label: 'designer.grooveWidth', kind: 'length' },
];

/** The definition's text values the designer edits. */
type TextKey = 'name' | 'alternativeNames' | 'standard' | 'countryOfOrigin' | 'caseType' | 'standardDate' | 'specificationUrl';

const TEXT_FIELDS: Array<{ key: TextKey; label: MessageKey }> = [
  { key: 'name', label: 'field.name' },
  { key: 'alternativeNames', label: 'designer.alternativeNames' },
  { key: 'standard', label: 'components.standard' },
  { key: 'countryOfOrigin', label: 'designer.countryOfOrigin' },
  { key: 'caseType', label: 'designer.caseType' },
  { key: 'standardDate', label: 'designer.standardDate' },
  { key: 'specificationUrl', label: 'designer.specificationUrl' },
];

/**
 * GRT's cartridge designer: the load's caliber definition (general data, the case's and the chamber's
 * outlines, the rifling) beside a technical drawing that follows every edit. Fires `apply-caliber` with
 * the definition to fill the load from it, `save-caliber` to keep it as one of the user's components, and
 * `close`.
 */
export class CartridgeDesigner extends LitElement {
  static override properties = {
    open: { type: Boolean },
    load: { attribute: false },
    context: { attribute: false },
    draft: { state: true },
    saved: { state: true },
  };

  declare open: boolean;
  declare load: Load;
  declare context: UiContext;
  /** The definition being edited; undefined until opened. */
  declare draft: CaliberDefinition | undefined;
  declare saved: boolean;

  constructor() {
    super();
    this.open = false;
    this.draft = undefined;
    this.saved = false;
  }

  protected override createRenderRoot(): HTMLElement {
    return this;
  }

  protected override willUpdate(changed: Map<string, unknown>): void {
    if (changed.has('open') && this.open) {
      this.draft = startingDefinition(this.load);
      this.saved = false;
    }
  }

  protected override updated(): void {
    const dialog = this.querySelector('dialog');
    if (!dialog) return;
    if (this.open && !dialog.open) dialog.showModal();
    if (!this.open && dialog.open) dialog.close();
  }

  protected override render() {
    const { t } = this.context;
    const draft = this.draft;
    if (!this.open || !draft) return html`<dialog class="cartridge-designer"></dialog>`;
    const check = checkCaliber(draft);
    const lengthUnit = displayUnit('length', this.context.units);
    const format = (metres: number) => `${formatNumber(lengthUnit.fromSi(metres), lengthUnit.decimals, this.context.language)}`;
    return html`
      <dialog class="cartridge-designer" @close=${() => this.dispatchEvent(new Event('close'))}>
        <header class="picker-head">
          <h2>${icon('cartridge')} ${t('designer.title')}</h2>
          <span class="spacer"></span>
          <button @click=${() => this.dispatchEvent(new Event('close'))}>${icon('close')}</button>
        </header>
        <p class="note">${t('designer.help', { unit: lengthUnit.symbol })}</p>
        <div class="designer-drawing">${technicalDrawing(draft, format)}</div>
        <div class="designer-columns">
          <section>
            <h3>${t('designer.general')}</h3>
            <table class="property-table"><tbody>
              ${TEXT_FIELDS.map(({ key, label }) => html`<tr>
                <th>${t(label)}</th>
                <td colspan="2">
                  <input type="text" .value=${draft[key]} @change=${(event: Event) => this.edit({ [key]: (event.target as HTMLInputElement).value })} />
                </td>
              </tr>`)}
              ${this.numberRow('Pmax', 'field.maxPressure', 'pressure', draft.maxPressure, (value) => this.edit({ maxPressure: value }))}
              ${this.numberRow('', 'field.sebertFactor', 'count', draft.sebertFactor, (value) => this.edit({ sebertFactor: value }), 2)}
            </tbody></table>
            <h3>${t('designer.rifling')}</h3>
            <table class="property-table"><tbody>
              ${this.numberRows(RIFLING_FIELDS, draft.rifling, (key, value) => this.editRifling(key, value))}
            </tbody></table>
          </section>
          <section>
            <h3>${t('designer.case')}</h3>
            <table class="property-table"><tbody>
              ${this.numberRows(CASE_FIELDS, draft.caseDimensions, (key, value) => this.editCase(key, value))}
            </tbody></table>
          </section>
          <section>
            <h3>${t('designer.chamber')}</h3>
            <table class="property-table"><tbody>
              ${this.numberRows(CHAMBER_FIELDS, draft.chamberDimensions, (key, value) => this.editChamber(key, value))}
            </tbody></table>
          </section>
        </div>
        ${check.ok ? nothing : html`<ul class="issues">${check.issues.map((issue) => html`<li class="error">${issue.path}: ${issue.message}</li>`)}</ul>`}
        <footer class="designer-actions">
          ${this.saved ? html`<span class="note">${t('designer.saved')}</span>` : nothing}
          <button ?disabled=${!check.ok} @click=${() => this.fire('save-caliber')}>${icon('database')} ${t('designer.save')}</button>
          <button ?disabled=${!check.ok} @click=${() => this.fire('apply-caliber')}>${icon('cartridge')} ${t('designer.apply')}</button>
        </footer>
      </dialog>
    `;
  }

  /** One row per field of a group, read from `values` (0 when the group isn't given yet). */
  private numberRows<Key extends string>(fields: NumberEntry<Key>[], values: Partial<Record<Key, number>> | undefined, set: (key: Key, value: number) => void) {
    return fields.map((field) =>
      this.numberRow(field.letter, field.label, field.kind, values?.[field.key] ?? 0, (value) => set(field.key, value), field.kind === 'count' ? 0 : undefined),
    );
  }

  private numberRow(letter: string, label: MessageKey, kind: QuantityKind | 'count', value: number, set: (value: number) => void, decimals?: number) {
    const { t } = this.context;
    const unit = kind === 'count' ? undefined : displayUnit(kind, this.context.units);
    const shown = unit ? unit.fromSi(value) : value;
    return html`<tr>
      <th><span class="letter">${letter}</span> ${t(label)}</th>
      <td>
        <input
          type="text"
          inputmode="decimal"
          .value=${formatNumber(shown, decimals ?? unit?.decimals ?? 2, 'en').replace(/,/g, '')}
          @change=${(event: Event) => {
            const parsed = parseNumber((event.target as HTMLInputElement).value);
            if (parsed !== undefined && parsed >= 0) set(unit ? unit.toSi(parsed) : parsed);
          }}
        />
      </td>
      <td class="unit">${unit?.symbol ?? ''}</td>
    </tr>`;
  }

  private edit(change: Partial<CaliberDefinition>): void {
    this.draft = { ...this.draft!, ...change };
    this.saved = false;
  }

  private editCase(key: keyof CaseDimensions, value: number): void {
    this.edit({ caseDimensions: { ...(this.draft!.caseDimensions ?? emptyCase()), [key]: value } });
  }

  private editChamber(key: keyof ChamberDimensions, value: number): void {
    this.edit({ chamberDimensions: { ...(this.draft!.chamberDimensions ?? emptyChamber()), [key]: value } });
  }

  private editRifling(key: keyof Rifling, value: number): void {
    const current = this.draft!.rifling ?? {
      grooveDiameter: this.load.cartridge.grooveDiameter,
      boreDiameter: 0,
      effectiveBoreArea: this.load.cartridge.effectiveBoreArea,
      grooves: 0,
      grooveWidth: 0,
    };
    this.edit({ rifling: { ...current, [key]: value } });
  }

  private fire(name: 'apply-caliber' | 'save-caliber'): void {
    this.dispatchEvent(new CustomEvent(name, { detail: this.draft, bubbles: true }));
    if (name === 'save-caliber') this.saved = true;
  }
}

/** The load's definition, or one started from its cartridge values when it has none. */
export function startingDefinition(load: Load): CaliberDefinition {
  const { cartridge } = load;
  if (cartridge.definition?.caseDimensions) return cartridge.definition;
  const base: CaliberDefinition = cartridge.definition ?? {
    name: cartridge.name,
    alternativeNames: '',
    standard: '',
    countryOfOrigin: '',
    caseType: '',
    standardDate: '',
    revisionDate: '',
    specificationUrl: '',
    maxPressure: cartridge.maxPressure,
    sebertFactor: cartridge.sebertFactor,
    info: { description: '', origin: '', createdBy: '', createdOn: '', modifiedBy: '', modifiedOn: '' },
  };
  // A plain straight case around the bullet, to start the drawing from.
  const body = load.projectile.diameter * 1.2;
  return {
    ...base,
    caseDimensions: {
      ...emptyCase(),
      caseLength: cartridge.caseLength,
      bodyBaseDiameter: body,
      mouthDiameter: body,
      projectileDiameter: load.projectile.diameter,
    },
  };
}

function emptyCase(): CaseDimensions {
  return {
    caseLength: 0,
    shoulderStart: 0,
    neckStart: 0,
    maximumOverallLength: 0,
    rimDiameter: 0,
    rimThickness: 0,
    bodyBaseDistance: 0,
    bodyBaseDiameter: 0,
    shoulderDiameter: 0,
    neckDiameter: 0,
    mouthDiameter: 0,
    projectileDiameter: 0,
  };
}

function emptyChamber(): ChamberDimensions {
  return {
    bodyBaseDistance: 0,
    bodyBaseDiameter: 0,
    shoulderStart: 0,
    shoulderDiameter: 0,
    neckStart: 0,
    neckDiameter: 0,
    neckEnd: 0,
    mouthDiameter: 0,
    throatDiameter: 0,
  };
}

customElements.define('gl-cartridge-designer', CartridgeDesigner);
