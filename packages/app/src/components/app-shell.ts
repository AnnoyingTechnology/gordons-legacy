import type { Load, Projectile } from '@gordons-legacy/formats';
import { importGrtProjectiles, importGrtPropellant, serializeLoad } from '@gordons-legacy/formats';
import { html, LitElement, nothing } from 'lit';
import { LANGUAGE_NAMES, type Language } from '../i18n/i18n.ts';
import { icon } from '../icons/icons.ts';
import { DocumentStore } from '../state/documents.ts';
import { loadSettings, saveSettings, type Settings } from '../state/settings.ts';
import { presetPreferences, type UnitPreferences, type UnitSystem } from '../units/units.ts';
import { createContext, type UiContext } from './context.ts';
import { withProjectile, withPropellant } from '../editor/components.ts';
import { REPOSITORY } from './about-dialog.ts';
import './choice-dialog.ts';
import type { CalibratedLoad } from './measurements-view.ts';
import './load-editor.ts';
import './units-dialog.ts';

/**
 * The application: toolbar, one tab per open load, and the active load's editor. Owns the document
 * store and the settings, and hands a UI context (language, units) down to the editor.
 */
const WELCOME_SEEN_KEY = 'gordons-legacy.welcome-seen';

export class AppShell extends LitElement {
  static override properties = {
    context: { state: true },
    openErrors: { state: true },
    unitsOpen: { state: true },
    aboutOpen: { state: true },
    projectileChoice: { state: true },
  };

  declare context: UiContext;
  /** Why the last opened files couldn't be used. */
  declare openErrors: string[];
  /** Projectiles of an opened `.projectile` file to choose from, for the active load. */
  declare projectileChoice: Projectile[] | undefined;
  declare unitsOpen: boolean;
  declare aboutOpen: boolean;
  private readonly store = new DocumentStore(window.localStorage);
  private settings: Settings = loadSettings(window.localStorage, navigator.languages);

  constructor() {
    super();
    this.context = createContext(this.settings.language, this.settings.units);
    this.openErrors = [];
    this.unitsOpen = false;
    this.projectileChoice = undefined;
    // The dedication and safety notice open on a browser's first visit.
    this.aboutOpen = window.localStorage.getItem(WELCOME_SEEN_KEY) === null;
    this.store.subscribe(() => this.requestUpdate());
    document.documentElement.lang = this.settings.language;
  }

  protected override createRenderRoot(): HTMLElement {
    return this;
  }

  protected override render() {
    const { t } = this.context;
    const active = this.store.active;
    return html`
      <header class="toolbar">
        <h1>${t('app.title')}</h1>
        <label class="button">
          ${icon('open')} ${t('toolbar.open')}
          <input type="file" accept=".grtload,.json,.propellant,.projectile" multiple hidden @change=${this.openFromInput} />
        </label>
        <button ?disabled=${!active} @click=${() => active && this.save(active.id)}>${icon('save')} ${t('toolbar.save')}</button>
        <span class="spacer"></span>
        <label>
          ${t('toolbar.units')}
          <select @change=${(event: Event) => this.setUnits((event.target as HTMLSelectElement).value as UnitSystem)}>
            <option value="metric" ?selected=${this.settings.unitSystem === 'metric'}>${t('units.metric')}</option>
            <option value="imperial" ?selected=${this.settings.unitSystem === 'imperial'}>${t('units.imperial')}</option>
          </select>
        </label>
        <button @click=${() => (this.unitsOpen = true)}>${icon('units')} ${t('units.customize')}</button>
        <button @click=${() => (this.aboutOpen = true)}>${icon('info')} ${t('toolbar.about')}</button>
        <label>
          ${t('toolbar.language')}
          <select @change=${(event: Event) => this.setLanguage((event.target as HTMLSelectElement).value as Language)}>
            ${Object.entries(LANGUAGE_NAMES).map(
              ([code, name]) => html`<option value=${code} ?selected=${code === this.settings.language}>${name}</option>`,
            )}
          </select>
        </label>
      </header>
      <nav class="tabs" role="tablist">
        ${this.store.documents.map(
          (document) => html`
            <div class="tab ${document.id === active?.id ? 'active' : ''}" role="tab" aria-selected=${document.id === active?.id}>
              <button class="tab-name" @click=${() => this.store.activate(document.id)}>
                ${document.name}${this.store.isDirty(document) ? html` <span title=${t('documents.unsaved')}>•</span>` : nothing}
              </button>
              <button class="tab-close" aria-label=${t('documents.close', { name: document.name })} @click=${() => this.store.close(document.id)}>${icon('close')}</button>
            </div>
          `,
        )}
      </nav>
      <main @dragover=${(event: DragEvent) => event.preventDefault()} @drop=${this.openFromDrop}>
        ${this.openErrors.length > 0
          ? html`<ul class="issues">${this.openErrors.map((message) => html`<li class="error"><span class="severity">!</span> ${message}</li>`)}</ul>`
          : nothing}
        ${active
          ? html`<gl-load-editor
              .load=${active.load}
              .context=${this.context}
              @load-change=${(event: CustomEvent<Load>) => this.store.update(active.id, event.detail)}
              @calibrated=${(event: CustomEvent<CalibratedLoad>) => this.openCalibrated(active.name, event.detail)}
            ></gl-load-editor>`
          : html`<p class="empty">${t('documents.empty')}</p>`}
      </main>
      <footer class="status-footer">
        <p class="warning">${t('app.development')}</p>
        <p>
          ${t('about.version')} <a href="${REPOSITORY}/commit/${__BUILD_COMMIT__}">${__BUILD_COMMIT__.slice(0, 7)}</a>,
          ${__BUILD_DATE__}
        </p>
      </footer>
      <gl-about-dialog .open=${this.aboutOpen} .context=${this.context} @close=${this.closeAbout}></gl-about-dialog>
      <gl-choice-dialog
        .heading=${this.projectileChoice ? t('components.chooseProjectile') : undefined}
        .options=${(this.projectileChoice ?? []).map((projectile) => projectile.name)}
        .context=${this.context}
        @choose=${(event: CustomEvent<number>) => this.useProjectile(this.projectileChoice?.[event.detail])}
        @close=${() => (this.projectileChoice = undefined)}
      ></gl-choice-dialog>
      <gl-units-dialog
        .open=${this.unitsOpen}
        .context=${this.context}
        @units-change=${(event: CustomEvent<UnitPreferences>) => this.setUnitPreferences(event.detail)}
        @close=${() => (this.unitsOpen = false)}
      ></gl-units-dialog>
    `;
  }

  /**
   * Opens loads in new tabs; powder and projectile files replace the active load's component instead.
   */
  private async openFiles(files: Iterable<File>): Promise<void> {
    const errors: string[] = [];
    for (const file of files) {
      const text = await file.text();
      const extension = file.name.slice(file.name.lastIndexOf('.')).toLowerCase();
      if (extension === '.propellant' || extension === '.projectile') {
        errors.push(...this.openComponent(extension, text));
        continue;
      }
      const result = this.store.open(file.name, text);
      if (!result.ok) errors.push(...result.issues.filter((issue) => issue.severity === 'error').map((issue) => issue.message));
    }
    this.openErrors = errors;
  }

  /** Puts a powder or projectile into the active load; returns error messages. */
  private openComponent(extension: string, text: string): string[] {
    const active = this.store.active;
    if (!active) return [this.context.t('components.noLoad')];
    const result = extension === '.propellant' ? importGrtPropellant(text) : importGrtProjectiles(text);
    if (!result.ok) return result.issues.filter((issue) => issue.severity === 'error').map((issue) => issue.message);
    if (!Array.isArray(result.value)) {
      this.store.update(active.id, withPropellant(active.load, result.value));
    } else if (result.value.length === 1) {
      this.useProjectile(result.value[0]);
    } else {
      this.projectileChoice = result.value;
    }
    return [];
  }

  /** Opens a load fitted to a measured velocity as a new, unsaved document; the original stays. */
  private openCalibrated(name: string, calibration: CalibratedLoad): void {
    const { t, quantity } = this.context;
    const velocity = quantity(calibration.velocity, 'velocity');
    if (!calibration.load) {
      this.openErrors = [t('measurements.calibrationFailed', { velocity })];
      return;
    }
    const base = name.replace(/\.json$/i, '');
    this.store.openNew(`${base} ${t('measurements.calibratedSuffix', { velocity })}.json`, calibration.load);
    this.openErrors = calibration.reached ? [] : [t('measurements.calibrationLimited', { velocity })];
  }

  private useProjectile(projectile: Projectile | undefined): void {
    const active = this.store.active;
    if (active && projectile) this.store.update(active.id, withProjectile(active.load, projectile));
  }

  private openFromInput = (event: Event) => {
    const input = event.target as HTMLInputElement;
    void this.openFiles(input.files ?? []);
    input.value = '';
  };

  private openFromDrop = (event: DragEvent) => {
    event.preventDefault();
    void this.openFiles(event.dataTransfer?.files ?? []);
  };

  /** Saves with the File System Access API where available, otherwise as a download. */
  private async save(id: number): Promise<void> {
    const document = this.store.documents.find((candidate) => candidate.id === id);
    if (!document) return;
    const text = serializeLoad(document.load);
    const picker = (window as { showSaveFilePicker?: (options: object) => Promise<FileSystemFileHandle> }).showSaveFilePicker;
    if (picker) {
      try {
        const handle = await picker({ suggestedName: document.name, types: [{ accept: { 'application/json': ['.json'] } }] });
        const writable = await handle.createWritable();
        await writable.write(text);
        await writable.close();
        this.store.markSaved(id, handle.name);
      } catch {
        // Cancelled by the user.
      }
      return;
    }
    const link = Object.assign(window.document.createElement('a'), {
      href: URL.createObjectURL(new Blob([text], { type: 'application/json' })),
      download: document.name,
    });
    link.click();
    URL.revokeObjectURL(link.href);
    this.store.markSaved(id, document.name);
  }

  private setUnits(system: UnitSystem): void {
    this.settings = { ...this.settings, unitSystem: system, units: presetPreferences(system) };
    this.applySettings();
  }

  private closeAbout = () => {
    this.aboutOpen = false;
    window.localStorage.setItem(WELCOME_SEEN_KEY, '1');
  };

  /** Units chosen one kind at a time; the preset shown stays the one they started from. */
  private setUnitPreferences(units: UnitPreferences): void {
    this.settings = { ...this.settings, units };
    this.applySettings();
  }

  private setLanguage(language: Language): void {
    this.settings = { ...this.settings, language };
    document.documentElement.lang = language;
    this.applySettings();
  }

  private applySettings(): void {
    saveSettings(window.localStorage, this.settings);
    this.context = createContext(this.settings.language, this.settings.units);
  }
}

customElements.define('gl-app', AppShell);
