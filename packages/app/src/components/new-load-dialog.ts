import type { Firearm } from '@gordons-legacy/formats';
import { html, LitElement, nothing } from 'lit';
import type { MessageKey } from '../i18n/i18n.ts';
import { originLabel, type ComponentEntry } from '../state/components.ts';
import { caliberChoices, calibersFromLoads, matchingCaliber } from '../state/cartridge-choice.ts';
import { firearmLabel } from '../state/firearms.ts';
import { copyLoadInputs, type CloneSource } from '../state/load-copy.ts';
import { caliberValues, createLoad, NEW_LOAD_FIELDS, type NewLoadValues } from '../state/new-load.ts';
import { displayUnit, parseNumber } from '../units/units.ts';
import type { UiContext } from './context.ts';

type Step = 'start' | 'clone' | 'clone-name' | 'start-point' | 'gun' | 'caliber' | 'projectile' | 'propellant' | 'review';
const STEP_LABELS: Record<Step, MessageKey> = {
  start: 'documents.new', clone: 'documents.clone', 'clone-name': 'documents.clone',
  'start-point': 'documents.guided', gun: 'firearm.one', caliber: 'group.cartridge',
  projectile: 'group.projectile', propellant: 'group.propellant', review: 'documents.review',
};
const MOST_CHOICES = 100;
const LOAD_FIELDS: Array<keyof NewLoadValues> = ['chargeMass', 'overallLength', 'temperature'];
const CASE_FIELDS: Array<keyof NewLoadValues> = ['caseCapacity', 'caseLength', 'barrelLength'];
const TECHNICAL_FIELDS: Array<keyof NewLoadValues> = ['grooveDiameter', 'effectiveBoreArea', 'maxPressure', 'sebertFactor', 'shotStartPressure'];

/** New → clone an open/saved load, or choose a gun/cartridge and work through the components. */
export class NewLoadDialog extends LitElement {
  static override properties = {
    open: { attribute: false }, entries: { attribute: false }, sources: { attribute: false },
    firearms: { attribute: false }, loading: { attribute: false }, context: { attribute: false },
    step: { state: true }, filter: { state: true }, title: { state: true },
    selected: { state: true }, values: { state: true }, error: { state: true },
    changingCartridge: { state: true },
    technicalOpen: { state: true },
  };

  declare open: boolean;
  declare entries: ComponentEntry[];
  declare sources: CloneSource[];
  declare firearms: Firearm[];
  declare loading: boolean;
  declare context: UiContext;
  declare step: Step;
  declare filter: string;
  declare title: string;
  declare selected: Partial<Record<ComponentEntry['kind'], string>>;
  declare values: Partial<Record<keyof NewLoadValues, string>>;
  declare error: string;
  declare changingCartridge: boolean;
  declare technicalOpen: boolean;
  private enteredValues = new Set<keyof NewLoadValues>();
  // Keep component identities stable across background repository refreshes while choosing.
  private choices: ComponentEntry[] = [];
  private firearm: Firearm | undefined;
  private clone: CloneSource | undefined;
  /** A gun's named cartridge remains usable even when no detailed definition is in the database. */
  private gunCartridge: string | undefined;

  constructor() {
    super();
    this.open = false;
    this.entries = [];
    this.sources = [];
    this.firearms = [];
    this.loading = false;
    this.step = 'start';
    this.filter = '';
    this.title = '';
    this.selected = {};
    this.values = {};
    this.error = '';
    this.changingCartridge = false;
    this.technicalOpen = false;
  }

  protected override createRenderRoot(): HTMLElement { return this; }

  protected override willUpdate(changed: Map<string, unknown>): void {
    if (changed.has('open') && this.open) {
      this.choices = [...calibersFromLoads(this.sources), ...this.entries];
      this.selected = {};
      this.values = {};
      this.title = '';
      this.firearm = undefined;
      this.clone = undefined;
      this.gunCartridge = undefined;
      this.changingCartridge = false;
      this.enteredValues.clear();
      this.go('start');
    }
  }

  protected override updated(changed: Map<string, unknown>): void {
    const dialog = this.querySelector('dialog');
    if (this.open && !dialog?.open) dialog?.showModal();
    if (!this.open && dialog?.open) dialog.close();
    if (this.open && (changed.has('step') || changed.has('open'))) {
      this.querySelector<HTMLElement>('[data-step-focus]')?.focus();
    }
  }

  protected override render() {
    const { t } = this.context;
    return html`
      <dialog class="new-load-dialog" aria-labelledby="new-load-heading" @close=${() => this.dispatchEvent(new Event('close'))}>
        <header class="new-load-heading">
          <h2 id="new-load-heading" tabindex="-1" ?data-step-focus=${this.step === 'start'}>${t('documents.new')}</h2>
          <button aria-label=${t('choice.cancel')} @click=${this.close}>×</button>
        </header>
        ${this.progress()}
        ${this.step === 'start' ? nothing : html`<h3 tabindex="-1" data-step-focus>${t(STEP_LABELS[this.step])}</h3>`}
        ${this.content()}
        <footer class="dialog-actions">
          ${this.step === 'start' ? nothing : html`<button @click=${this.back}>${t('documents.back')}</button>`}
          <span class="spacer"></span>
          <button @click=${this.close}>${t('choice.cancel')}</button>
          ${this.step === 'caliber' && (this.selected.caliber || this.gunCartridge)
            ? html`<button @click=${() => this.go('projectile')}>${t('documents.continue')}</button>` : nothing}
          ${this.step === 'review' || this.step === 'clone-name'
            ? html`<button type="submit" form="new-load-form">${t('documents.create')}</button>` : nothing}
        </footer>
      </dialog>`;
  }

  private progress() {
    if (this.step === 'start' || this.step === 'start-point') return nothing;
    const steps: Step[] = this.step === 'clone' || this.step === 'clone-name'
      ? ['clone', 'clone-name'] : [...(this.firearm || this.step === 'gun' ? ['gun' as const] : []), 'caliber', 'projectile', 'propellant', 'review'];
    return html`<ol class="new-load-progress">
      ${steps.map((step, index) => html`<li aria-current=${step === this.step ? 'step' : nothing}>
        <span>${index + 1}</span> ${this.context.t(step === 'clone-name' ? 'documents.name' : STEP_LABELS[step])}
      </li>`)}
    </ol>`;
  }

  private content() {
    const { t } = this.context;
    if (this.step === 'start') return html`
      <p>${t('documents.newHelp')}</p>
      <div class="new-load-paths">
        ${this.path('documents.clone', 'documents.copyHelp', () => this.go('clone'))}
        ${this.path('documents.guided', 'documents.guidedHelp', () => this.go('start-point'))}
      </div>`;
    if (this.step === 'start-point') return html`<div class="new-load-paths">
      ${this.path('documents.fromGun', 'documents.fromGunHelp', () => {
        this.go('gun');
        this.dispatchEvent(new Event('load-firearms'));
      })}
      ${this.path('documents.fromCartridge', 'documents.fromCartridgeHelp', () => {
        this.firearm = undefined;
        this.gunCartridge = undefined;
        this.selected = {};
        this.values = {};
        this.enteredValues.clear();
        this.go('caliber');
      })}
    </div>`;
    if (this.step === 'review' || this.step === 'clone-name') return this.review();
    return this.picker();
  }

  private path(label: MessageKey, help: MessageKey, action: () => void) {
    return html`<button class="new-load-path" @click=${action}>
      <strong>${this.context.t(label)}</strong><span>${this.context.t(help)}</span>
    </button>`;
  }

  private picker() {
    const { t, quantity } = this.context;
    if (this.step === 'caliber' && (this.selected.caliber || this.gunCartridge) && !this.changingCartridge) {
      return html`${this.summary()}${this.cartridgeSource()}<p>${t('documents.acceptCartridge')}</p>
        <button @click=${() => { this.changingCartridge = true; }}>${t('documents.changeCartridge')}</button>`;
    }
    const matches = (text: string) => this.filter.toLocaleLowerCase().trim().split(/\s+/)
      .every((word) => text.toLocaleLowerCase().includes(word));
    const rows: Array<{ name: string; detail: string; origin: string; choose: () => void }> = [];
    if (this.step === 'clone') {
      for (const source of this.sources) rows.push({ name: source.name,
        detail: [source.load.barrel.name, source.load.cartridge.name, source.load.projectile.name,
          source.load.propellant.maker, source.load.propellant.product].filter(Boolean).join(' · '),
        origin: t(source.origin === 'open' ? 'documents.openSource' : 'library.title'),
        choose: () => { this.clone = source; this.title = t('documents.copyName', { name: source.name }); this.go('clone-name'); },
      });
    } else if (this.step === 'gun') {
      for (const firearm of this.firearms) rows.push({ name: firearmLabel(firearm),
        detail: [firearm.cartridge, `${t('field.barrelLength')}: ${quantity(firearm.barrel.length, 'barrelLength')}`].filter(Boolean).join(' · '),
        origin: firearm.source?.kind === 'published' ? `${t('firearm.published')} · ${firearm.source.publisher ?? ''}` : t('components.yours'),
        choose: () => {
          this.firearm = firearm; this.selected = {}; this.values = {};
          this.enteredValues.clear();
          this.gunCartridge = firearm.cartridge?.trim() || undefined;
          this.changingCartridge = false;
          this.fill({ barrelLength: firearm.barrel.length });
          const matched = matchingCaliber(this.gunCartridge ?? '', this.choices);
          if (matched) this.choose(matched);
          this.go('caliber');
        },
      });
    } else {
      for (const entry of this.choices.filter((entry) => entry.kind === this.step)) rows.push({
        name: this.componentName(entry),
        detail: entry.kind === 'projectile'
          ? `${quantity(entry.value.mass, 'projectileMass')} · ${quantity(entry.value.diameter, 'length')}`
          : entry.source.author,
        origin: t(originLabel(entry.source)), choose: () => this.choose(entry),
      });
    }
    const found = rows.filter((row) => matches(`${row.name} ${row.detail} ${row.origin}`));
    return html`
      ${this.summary()}
      ${this.step === 'gun' ? html`<p class="note">${t('firearm.publishedNote')}</p>` : nothing}
      ${this.step === 'caliber' && (this.selected.caliber || this.gunCartridge)
        ? html`<p>${t('documents.acceptCartridge')}</p>` : nothing}
      <label class="new-load-search">${t('documents.search')}
        <input type="search" .value=${this.filter} @input=${(event: Event) => { this.filter = (event.target as HTMLInputElement).value; }} />
      </label>
      <p class="note" role="status">${this.step === 'gun' && this.loading ? t('firearm.databaseLoading') :
        found.length > MOST_CHOICES ? t('firearm.showingFirst', { shown: String(MOST_CHOICES), total: String(found.length) }) :
          t('documents.choiceCount', { count: String(found.length) })}</p>
      <div class="new-load-choices">
        ${found.slice(0, MOST_CHOICES).map((row) => html`<button class="new-load-choice" @click=${row.choose}>
          <strong>${row.name}</strong><span>${row.detail}</span><small>${row.origin}</small>
        </button>`)}
        ${found.length === 0 ? html`<p>${t('documents.noChoices')}</p>` : nothing}
      </div>`;
  }

  private componentName(entry: ComponentEntry): string {
    return entry.kind === 'propellant' ? `${entry.value.maker} ${entry.value.product}` : entry.value.name;
  }

  private summary() {
    const items: Array<[MessageKey, string]> = [];
    if (this.clone && this.step === 'clone-name') items.push(['documents.clone', this.clone.name]);
    else if (this.step !== 'clone') {
      if (this.firearm) items.push(['firearm.one', firearmLabel(this.firearm)]);
      if (this.gunCartridge && !this.selected.caliber) items.push(['group.cartridge', this.gunCartridge]);
      for (const kind of ['caliber', 'projectile', 'propellant'] as const) {
        const entry = this.choices.find((entry) => entry.id === this.selected[kind]);
        if (entry) items.push([STEP_LABELS[kind], this.componentName(entry)]);
      }
    }
    return items.length ? html`<dl class="new-load-summary">${items.map(([label, value]) => html`
      <div><dt>${this.context.t(label)}</dt><dd>${value}</dd></div>`)}</dl>` : nothing;
  }

  private review() {
    const { t } = this.context;
    return html`
      ${this.summary()}
      <p>${t(this.step === 'clone-name' ? 'documents.copyHelp' : 'documents.reviewHelp')}</p>
      <form id="new-load-form" novalidate @submit=${this.create}>
        <label class="new-load-name-field" for="new-load-name">${t('documents.name')}
          <input id="new-load-name" name="title" required autocomplete="off" .value=${this.title}
            @input=${(event: Event) => {
              const input = event.target as HTMLInputElement;
              input.setCustomValidity(''); this.title = input.value;
            }} />
        </label>
        ${this.step === 'clone-name' ? nothing : html`
          <div class="new-load-review-columns">
            <section class="new-load-review-section">
              <h4>${t('documents.loadDetails')}</h4>
              ${LOAD_FIELDS.map((name) => this.valueField(name))}
            </section>
            <section class="new-load-review-section">
              <h4>${t('documents.caseBarrel')}</h4>
              ${this.cartridgeSource()}
              ${CASE_FIELDS.map((name) => this.valueField(name))}
            </section>
          </div>
          <details class="new-load-technical" .open=${this.technicalOpen}
            @toggle=${(event: Event) => { this.technicalOpen = (event.target as HTMLDetailsElement).open; }}>
            <summary>${t('documents.technicalDetails')}${this.missing(TECHNICAL_FIELDS)
              ? html`<span>${t('documents.missingCount', { count: String(this.missing(TECHNICAL_FIELDS)) })}</span>` : nothing}</summary>
            <div class="new-load-technical-values">${TECHNICAL_FIELDS.map((name) => this.valueField(name))}</div>
          </details>`}
        ${this.error ? html`<p class="error" role="alert">${this.error}</p>` : nothing}
      </form>`;
  }

  /** Keep catalogue variants beside the cartridge, rather than asking users to retype their fields. */
  private cartridgeSource() {
    const selected = this.choices.find((entry) => entry.id === this.selected.caliber);
    const names = [this.gunCartridge ?? '', ...(selected?.kind === 'caliber'
      ? [selected.value.name, ...selected.value.alternativeNames.split(/[,;]/)] : [])];
    const entries = [...new Map(names.flatMap((name) => caliberChoices(name, this.choices)).map((entry) => [entry.id, entry])).values()];
    if (entries.length === 0) return nothing;
    const { t } = this.context;
    return html`<label class="new-load-cartridge-source">${t('documents.cartridgeData')}
      <select .value=${this.selected.caliber ?? ''} @change=${(event: Event) => {
        const id = (event.target as HTMLSelectElement).value;
        const entry = entries.find((entry) => entry.id === id);
        if (!entry) return;
        this.selected = { ...this.selected, caliber: id };
        this.fill(caliberValues(entry.value), true);
        if (this.step === 'review') this.technicalOpen = this.missing(TECHNICAL_FIELDS) > 0;
      }}>
        <option value="" disabled>${t('documents.chooseCase')}</option>
        ${entries.map((entry) => html`<option value=${entry.id}>${entry.value.name}</option>`)}
      </select>
      ${!this.selected.caliber ? html`<small>${t('documents.caseVariantsHelp')}</small>` : nothing}
    </label>`;
  }

  private valueField(name: keyof NewLoadValues) {
    const field = NEW_LOAD_FIELDS.find((field) => field.name === name)!;
    const { t } = this.context;
    const unit = field.kind === 'plain' ? '' : displayUnit(field.kind, this.context.units).symbol;
    const value = this.values[name] ?? '';
    const reference = name === 'caseCapacity' && value !== '' && !this.enteredValues.has(name);
    return html`<div class="new-load-value-field ${value.trim() === '' ? 'is-missing' : ''}">
      <label for=${`new-load-${name}`}>${t(field.label)}</label>
      <div class="new-load-number" data-kind=${field.kind}><input id=${`new-load-${name}`} name=${name} required inputmode="decimal" autocomplete="off"
        aria-describedby=${reference ? 'new-load-capacity-reference' : nothing}
        placeholder="—" .value=${value} @input=${(event: Event) => {
          const input = event.target as HTMLInputElement;
          input.setCustomValidity(''); this.enteredValues.add(name);
          this.values = { ...this.values, [name]: input.value };
        }} /><span>${unit}</span></div>
      ${reference ? html`<small id="new-load-capacity-reference">${t('documents.capacityReference')}</small>` : nothing}
    </div>`;
  }

  private missing(names: readonly (keyof NewLoadValues)[]): number {
    return names.filter((name) => !(this.values[name] ?? '').trim()).length;
  }

  private choose(entry: ComponentEntry): void {
    if (entry.kind === 'caliber') {
      this.changingCartridge = false;
      if (this.selected.caliber !== entry.id) {
        this.selected = {};
        this.values = {};
        this.enteredValues.clear();
        this.fill({ barrelLength: this.firearm?.barrel.length, ...caliberValues(entry.value) });
      }
    } else if (entry.kind === 'projectile' && this.selected.projectile !== entry.id) {
      this.fill({ shotStartPressure: entry.value.shotStartPressure });
    }
    this.selected = { ...this.selected, [entry.kind]: entry.id };
    this.go(entry.kind === 'caliber' ? 'projectile' : entry.kind === 'projectile' ? 'propellant' : 'review');
  }

  /** Only a selected source supplies values; missing fields never inherit another component's data. */
  private fill(values: Partial<Record<keyof NewLoadValues, number | undefined>>, preserveEntered = false): void {
    const updated = { ...this.values };
    for (const field of NEW_LOAD_FIELDS) {
      if (!(field.name in values)) continue;
      if (preserveEntered && this.enteredValues.has(field.name)) continue;
      const value = values[field.name];
      const shown = value === undefined ? undefined : field.kind === 'plain' ? value : displayUnit(field.kind, this.context.units).fromSi(value);
      updated[field.name] = shown === undefined ? '' : String(Number(shown.toPrecision(12)));
    }
    this.values = updated;
  }

  private go(step: Step): void {
    this.step = step; this.filter = ''; this.error = '';
    if (step === 'review') this.technicalOpen = this.missing(TECHNICAL_FIELDS) > 0;
  }
  private close = (): void => { this.querySelector('dialog')?.close(); };
  private back = (): void => {
    const previous: Record<Step, Step> = { start: 'start', clone: 'start', 'clone-name': 'clone',
      'start-point': 'start', gun: 'start-point', caliber: this.firearm ? 'gun' : 'start-point',
      projectile: 'caliber', propellant: 'projectile', review: 'propellant' };
    this.go(previous[this.step]);
  };

  private create = async (event: SubmitEvent): Promise<void> => {
    event.preventDefault();
    const form = event.target as HTMLFormElement;
    const title = form.elements.namedItem('title') as HTMLInputElement;
    title.setCustomValidity(title.value.trim() ? '' : this.context.t('field.invalid'));
    if (this.step === 'clone-name' && this.clone) {
      if (!form.reportValidity()) return;
      this.dispatchEvent(new CustomEvent('create-load', { detail: copyLoadInputs(this.clone.load, title.value.trim()) }));
      return;
    }
    const numbers: Partial<NewLoadValues> = {};
    for (const field of NEW_LOAD_FIELDS) {
      const input = form.elements.namedItem(field.name) as HTMLInputElement;
      const value = parseNumber(input.value);
      const si = value === undefined ? undefined : field.kind === 'plain' ? value : displayUnit(field.kind, this.context.units).toSi(value);
      const valid = si !== undefined && Number.isFinite(si) && (field.name === 'sebertFactor' ? si >= 0 : si > 0);
      input.setCustomValidity(valid ? '' : this.context.t('field.invalid'));
      if (valid) numbers[field.name] = si;
    }
    if (TECHNICAL_FIELDS.some((name) => !(form.elements.namedItem(name) as HTMLInputElement).validity.valid)) {
      this.technicalOpen = true;
      await this.updateComplete;
    }
    if (!form.reportValidity()) return;
    const caliber = this.choices.find((entry) => entry.id === this.selected.caliber);
    const projectile = this.choices.find((entry) => entry.id === this.selected.projectile);
    const propellant = this.choices.find((entry) => entry.id === this.selected.propellant);
    const cartridge = caliber?.kind === 'caliber' ? caliber.value : this.gunCartridge;
    if (!cartridge || projectile?.kind !== 'projectile' || propellant?.kind !== 'propellant') return;
    const result = createLoad(title.value, cartridge, projectile.value, propellant.value, numbers, this.firearm);
    if (!result.ok) { this.error = this.context.t('documents.checkInputs'); return; }
    this.dispatchEvent(new CustomEvent('create-load', { detail: result.value }));
  };
}

customElements.define('gl-new-load-dialog', NewLoadDialog);
