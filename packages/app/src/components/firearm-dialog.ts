import type { Firearm } from '@gordons-legacy/formats';
import { html, LitElement, nothing } from 'lit';
import { icon } from '../icons/icons.ts';
import { displayUnit, formatEditable, parseNumber, type QuantityKind } from '../units/units.ts';
import type { MessageKey } from '../i18n/i18n.ts';
import type { UiContext } from './context.ts';

/** How a save of the dialog's gun ended: the storage refused it, or another tab changed the gun first. */
export type FirearmSave = 'saved' | 'failed' | 'conflict';

/** The numbers of a gun the engine reads, in the order a user measures them. */
interface BarrelField {
  key: 'length' | 'twistLength' | 'gunMass' | 'jumpToLands';
  label: 'field.barrelLength' | 'field.twistLength' | 'field.gunMass' | 'field.jumpToLands';
  kind: QuantityKind;
}

const BARREL_FIELDS: BarrelField[] = [
  { key: 'length', label: 'field.barrelLength', kind: 'barrelLength' },
  { key: 'twistLength', label: 'field.twistLength', kind: 'twistLength' },
  { key: 'gunMass', label: 'field.gunMass', kind: 'gunMass' },
  { key: 'jumpToLands', label: 'field.jumpToLands', kind: 'length' },
];

/**
 * Describes one gun (issue #24): what it is called, what it is, and the barrel values the simulation
 * reads from it. Saves through `saveFirearm` and closes only once the gun is stored, so that a refused
 * write leaves the edits in place (#32); fires `export` and `close`. The gas leaks of a revolver's
 * cylinder gap are kept as they are: they are edited with the load that has them.
 */
export class FirearmDialog extends LitElement {
  static override properties = {
    firearm: { attribute: false },
    context: { attribute: false },
    saveFirearm: { attribute: false },
    draft: { state: true },
    invalid: { state: true },
    saving: { state: true },
  };

  /** The gun to edit; undefined when the dialog is closed. */
  declare firearm: Firearm | undefined;
  declare context: UiContext;
  /** Stores the gun, and says how that went. */
  declare saveFirearm: ((firearm: Firearm) => Promise<FirearmSave>) | undefined;
  declare draft: Firearm | undefined;
  /** Barrel fields whose typed text is no value: the gun isn't saved until they are corrected. */
  declare invalid: ReadonlyArray<BarrelField['key']>;
  /** Where the last save stands: under way, or refused by the storage. */
  declare saving: 'idle' | 'saving' | 'failed' | 'conflict';
  /** Counts the dialog's openings: a save still running from an earlier one settles nothing here. */
  private session = 0;
  /**
   * Whether anything was typed since the running save began. A field commits on `change`, so text typed
   * into a field still focused is not in the draft yet: closing the dialog would lose it (#32).
   */
  private typedWhileSaving = false;

  constructor() {
    super();
    this.firearm = undefined;
    this.saveFirearm = undefined;
    this.draft = undefined;
    this.invalid = [];
    this.saving = 'idle';
  }

  protected override createRenderRoot(): HTMLElement {
    return this;
  }

  protected override willUpdate(changed: Map<string, unknown>): void {
    if (changed.has('firearm')) {
      this.session++;
      this.draft = this.firearm;
      this.invalid = [];
      this.saving = 'idle';
    }
  }

  protected override updated(): void {
    const dialog = this.querySelector('dialog');
    if (!dialog) return;
    if (this.firearm && !dialog.open) dialog.showModal();
    if (!this.firearm && dialog.open) dialog.close();
  }

  protected override render() {
    const { t } = this.context;
    const draft = this.draft;
    if (!draft) return html`<dialog class="firearm-dialog"></dialog>`;
    const published = draft.source?.kind === 'published';
    return html`
      <dialog class="firearm-dialog" aria-labelledby="firearm-title" @close=${() => this.dispatchEvent(new Event('close'))}
        @input=${() => { if (this.saving === 'saving') this.typedWhileSaving = true; }}>
        <h2 id="firearm-title">${icon('barrel')} ${t('firearm.one')}</h2>
        <table class="property-table">
          <tbody>
            ${this.textRow('field.name', draft.name, (value) => this.edit({ name: value }))}
            ${this.textRow('firearm.maker', draft.maker ?? '', (value) => this.edit({ maker: value }))}
            ${this.textRow('firearm.model', draft.model ?? '', (value) => this.edit({ model: value }))}
            ${this.textRow('firearm.cartridge', draft.cartridge ?? '', (value) => this.edit({ cartridge: value }))}
            ${BARREL_FIELDS.map((field) => this.numberRow(field, draft))}
            ${this.textRow('firearm.notes', draft.notes ?? '', (value) => this.edit({ notes: value }))}
          </tbody>
        </table>
        <fieldset class="firearm-source">
          <legend>${t('firearm.sourceKind')}</legend>
          <label>
            <input type="radio" name="firearm-source" .checked=${!published} @change=${() => this.setSource('measured')} />
            ${t('firearm.measured')}
          </label>
          <label>
            <input type="radio" name="firearm-source" .checked=${published} @change=${() => this.setSource('published')} />
            ${t('firearm.published')}
          </label>
          ${published
            ? html`<p class="note">${t('firearm.publishedNote')}</p>
                <table class="property-table">
                  <tbody>
                    ${this.textRow('firearm.publisher', draft.source?.publisher ?? '', (value) => this.editSource({ publisher: value }))}
                    ${this.textRow('firearm.url', draft.source?.url ?? '', (value) => this.editSource({ url: value }))}
                  </tbody>
                </table>`
            : nothing}
        </fieldset>
        ${draft.name.trim() === '' ? html`<p class="error">${t('firearm.nameNeeded')}</p>` : nothing}
        ${this.invalid.length > 0 ? html`<p class="error">${t('firearm.numbersInvalid')}</p>` : nothing}
        ${this.saving === 'failed' ? html`<p class="error" role="alert">${t('firearm.saveFailed')}</p>` : nothing}
        ${this.saving === 'conflict' ? html`<p class="error" role="alert">${t('firearm.saveConflict')}</p>` : nothing}
        <form method="dialog">
          <button
            type="button"
            ?disabled=${draft.name.trim() === ''}
            title=${t('firearm.exportHelp')}
            @click=${() => this.dispatchEvent(new CustomEvent('export', { detail: draft }))}
          >
            ${icon('export')} ${t('toolbar.export')}
          </button>
          <button>${t('choice.cancel')}</button>
          <button type="button" ?disabled=${draft.name.trim() === '' || this.invalid.length > 0 || this.saving === 'saving'} @click=${this.save}>
            ${icon('save')} ${t('toolbar.save')}
          </button>
        </form>
      </dialog>
    `;
  }

  private textRow(label: MessageKey, value: string, set: (value: string) => void) {
    const { t } = this.context;
    const id = `firearm-${label}`;
    return html`<tr>
      <th><label for=${id}>${t(label)}</label></th>
      <td colspan="2">
        <input id=${id} type="text" .value=${value} @change=${(event: Event) => set((event.target as HTMLInputElement).value)} />
      </td>
    </tr>`;
  }

  /** A barrel value in the user's unit; emptying it drops the value, which is how "not given" is said. */
  private numberRow(field: BarrelField, draft: Firearm) {
    const { t } = this.context;
    const unit = displayUnit(field.kind, this.context.units);
    const value = draft.barrel[field.key];
    const id = `firearm-${field.key}`;
    return html`<tr>
      <th><label for=${id}>${t(field.label)}</label></th>
      <td>
        <input
          id=${id}
          type="text"
          inputmode="decimal"
          aria-invalid=${this.invalid.includes(field.key) ? 'true' : 'false'}
          .value=${value === undefined ? '' : formatEditable(unit.fromSi(value), unit.decimals)}
          @change=${(event: Event) => {
            const text = (event.target as HTMLInputElement).value.trim();
            const parsed = parseNumber(text);
            // The length is the one value a gun cannot be without: the engine needs it. A jump may be 0
            // (a bullet seated touching the lands); the others are more. Text that is no value stays in
            // the field, marked, instead of the old value being saved behind it.
            const lowest = field.key === 'jumpToLands' ? 0 : Number.MIN_VALUE;
            const valid = (text === '' && field.key !== 'length') || (parsed !== undefined && parsed >= lowest);
            this.invalid = valid ? this.invalid.filter((key) => key !== field.key) : [...new Set([...this.invalid, field.key])];
            if (!valid) return;
            this.editBarrel({ [field.key]: text === '' ? undefined : unit.toSi(parsed!) });
          }}
        />
      </td>
      <td class="unit">${unit.symbol}</td>
    </tr>`;
  }

  private edit(change: Partial<Firearm>): void {
    this.draft = { ...this.draft!, ...change };
  }

  private editBarrel(change: Record<string, number | undefined>): void {
    const barrel = { ...this.draft!.barrel, ...change };
    for (const [key, value] of Object.entries(change)) if (value === undefined) delete (barrel as Record<string, unknown>)[key];
    this.draft = { ...this.draft!, barrel };
  }

  private setSource(kind: 'measured' | 'published'): void {
    this.edit({ source: { ...this.draft!.source, kind } });
  }

  private editSource(change: { publisher?: string; url?: string }): void {
    this.edit({ source: { kind: this.draft!.source?.kind ?? 'published', ...this.draft!.source, ...change } });
  }

  private save = async () => {
    const draft = this.draft;
    if (!draft || draft.name.trim() === '' || this.invalid.length > 0 || !this.saveFirearm) return;
    this.saving = 'saving';
    this.typedWhileSaving = false;
    const session = this.session;
    // The barrel carries the gun's name, so a load made with it says which gun it came from.
    const outcome = await this.saveFirearm({ ...draft, name: draft.name.trim(), barrel: { ...draft.barrel, name: draft.name.trim() } });
    if (session !== this.session) return;
    this.saving = outcome === 'saved' ? 'idle' : outcome;
    // An edit made while saving is not in what was saved: the dialog stays open for it.
    if (outcome === 'saved' && this.draft === draft && !this.typedWhileSaving) this.querySelector('dialog')?.close();
  };
}

customElements.define('gl-firearm-dialog', FirearmDialog);
