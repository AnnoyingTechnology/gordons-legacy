import type { Load, MeasurementSeries, Projectile } from '@gordons-legacy/formats';
import { importGrtProjectiles, importGrtPropellant, importGrtrace, serializeLoad } from '@gordons-legacy/formats';
import { html, LitElement, nothing } from 'lit';
import type { Language } from '../i18n/i18n.ts';
import { DocumentStore } from '../state/documents.ts';
import { loadSettings, saveSettings, type Settings } from '../state/settings.ts';
import { presetPreferences, type UnitPreferences, type UnitSystem } from '../units/units.ts';
import { indexedDbDataCache } from '../state/data-cache.ts';
import { exampleLoad } from '../state/example-load.ts';
import { download, saveTextFile } from '../state/file-saving.ts';
import { createContext, type UiContext } from './context.ts';
import { tabBar } from './tab-bar.ts';
import { toolbar } from './toolbar.ts';
import { withProjectile, withPropellant } from '../editor/components.ts';
import { REPOSITORY } from './about-dialog.ts';
import './choice-dialog.ts';
import './chronograph-dialog.ts';
import { readChronographCsv, type ChronographCsv } from '../measurements/chronograph-csv.ts';
import './compare-view.ts';
import type { CalibratedLoad } from './measurements-view.ts';
import './library-view.ts';
import './load-editor.ts';
import { firearms, Library } from '../state/library.ts';
import { indexedDbStorage } from '../state/library-storage.ts';
import { ComponentLibrary, type ComponentEntry } from '../state/components.ts';
import { indexedDbStore } from '../state/indexed-db.ts';
import './converter-dialog.ts';
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
    converterOpen: { state: true },
    projectileChoice: { state: true },
    view: { state: true },
    chronograph: { state: true },
  };

  declare context: UiContext;
  /** Why the last opened files couldn't be used. */
  declare openErrors: string[];
  /** Projectiles of an opened `.projectile` file to choose from, for the active load. */
  declare projectileChoice: Projectile[] | undefined;
  /** What the main area shows: the active load's editor, the open loads compared, or the library. */
  declare view: 'editor' | 'compare' | 'library';
  /** A chronograph export waiting for the user to confirm its column and unit. */
  declare chronograph: { csv: ChronographCsv; fileName: string } | undefined;
  declare unitsOpen: boolean;
  declare aboutOpen: boolean;
  declare converterOpen: boolean;
  private readonly store = new DocumentStore(window.localStorage);
  private readonly library = new Library(indexedDbStorage());
  private readonly components = new ComponentLibrary(indexedDbStore<ComponentEntry>('components'));
  private settings: Settings = loadSettings(window.localStorage, navigator.languages);

  constructor() {
    super();
    this.context = createContext(this.settings.language, this.settings.units);
    this.openErrors = [];
    this.unitsOpen = false;
    this.converterOpen = false;
    this.projectileChoice = undefined;
    this.view = 'editor';
    this.chronograph = undefined;
    // The dedication and safety notice open on a browser's first visit, over an example load, so that the
    // tool shows what it does instead of an empty page (#29).
    this.aboutOpen = window.localStorage.getItem(WELCOME_SEEN_KEY) === null;
    if (this.aboutOpen && this.store.documents.length === 0) this.openExample();
    this.store.subscribe(() => this.requestUpdate());
    this.library.subscribe(() => this.requestUpdate());
    this.components.subscribe(() => this.requestUpdate());
    void this.components.useRepository(indexedDbDataCache(), (url) => fetch(url));
    // Ask the browser not to clear the library under storage pressure; it may still refuse.
    void navigator.storage?.persist?.();
    document.documentElement.lang = this.settings.language;
  }

  protected override createRenderRoot(): HTMLElement {
    return this;
  }

  protected override render() {
    const { t } = this.context;
    const active = this.store.active;
    return html`
      ${toolbar(
        {
          hasActiveLoad: active !== undefined,
          openLoads: this.store.documents.length,
          view: this.view,
          converterOpen: this.converterOpen,
          unitSystem: this.settings.unitSystem,
          language: this.settings.language,
        },
        {
          openFiles: this.openFromInput,
          save: () => active && void this.saveToLibrary(active.id),
          exportFile: () => active && void this.exportFile(active.id),
          toggleView: (view) => this.toggleView(view),
          setUnits: (system) => this.setUnits(system),
          customizeUnits: () => (this.unitsOpen = true),
          toggleConverter: () => (this.converterOpen = !this.converterOpen),
          setLanguage: (language) => this.setLanguage(language),
          showAbout: () => (this.aboutOpen = true),
        },
        this.context,
      )}
      ${tabBar(this.store.documents, active?.id, (document) => this.store.isDirty(document), {
        show: (id) => this.showDocument(id),
        close: (id) => this.store.close(id),
      }, this.context)}
      <main @dragover=${(event: DragEvent) => event.preventDefault()} @drop=${this.openFromDrop}>
        ${this.store.storageFull ? html`<p class="warning">${t('documents.storageFull')}</p>` : nothing}
        ${this.openErrors.length > 0
          ? html`<ul class="issues">${this.openErrors.map((message) => html`<li class="error"><span class="severity">!</span> ${message}</li>`)}</ul>`
          : nothing}
        ${this.renderView()}
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
      ${active
        ? html`<gl-chronograph-dialog
            .csv=${this.chronograph?.csv}
            .fileName=${this.chronograph?.fileName ?? ''}
            .load=${active.load}
            .context=${this.context}
            @measurements=${(event: CustomEvent<MeasurementSeries>) => this.addMeasurements(event.detail)}
            @close=${() => (this.chronograph = undefined)}
          ></gl-chronograph-dialog>`
        : nothing}
      <gl-converter-dialog .open=${this.converterOpen} .context=${this.context} @close=${() => (this.converterOpen = false)}></gl-converter-dialog>
      <gl-units-dialog
        .open=${this.unitsOpen}
        .context=${this.context}
        @units-change=${(event: CustomEvent<UnitPreferences>) => this.setUnitPreferences(event.detail)}
        @close=${() => (this.unitsOpen = false)}
      ></gl-units-dialog>
    `;
  }

  /** The main area's content for the current view. */
  private renderView() {
    const { t } = this.context;
    const active = this.store.active;
    if (this.view === 'library') {
      return html`<gl-library-view
        .library=${this.library}
        .entries=${this.library.entries}
        .context=${this.context}
        @open-entry=${(event: CustomEvent<string>) => this.openEntry(event.detail)}
        @import-files=${(event: CustomEvent<File[]>) => void this.importToLibrary(event.detail)}
        @backup=${() => this.downloadBackup()}
        @restore=${(event: CustomEvent<File>) => void this.restoreBackup(event.detail)}
      ></gl-library-view>`;
    }
    if (this.view === 'compare' && this.store.documents.length >= 2) {
      return html`<gl-compare-view .documents=${this.store.documents} .context=${this.context}></gl-compare-view>`;
    }
    if (!active) return html`<p class="empty">${t('documents.empty')}</p>`;
    return html`
      <header class="print-header">
        <h1>${t('app.title')}: ${active.name.replace(/\.json$/i, '')}</h1>
        <p>${new Date().toLocaleString(this.settings.language)} · ${t('about.version')} ${__BUILD_COMMIT__.slice(0, 7)}</p>
      </header>
      <gl-load-editor
        .load=${active.load}
        .context=${this.context}
        .firearms=${firearms(this.library.entries)}
        .components=${this.components}
        .componentEntries=${this.components.entries}
        .foldedGroups=${this.settings.foldedGroups}
        @fold-group=${(event: CustomEvent<string>) => this.foldGroup(event.detail)}
        @load-change=${(event: CustomEvent<Load>) => this.store.update(active.id, event.detail)}
        @calibrated=${(event: CustomEvent<CalibratedLoad>) => this.openCalibrated(active.name, event.detail)}
        @open-load=${(event: CustomEvent<{ name: string; load: Load }>) => this.store.openNew(`${event.detail.name}.json`, event.detail.load)}
      ></gl-load-editor>
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
        // Kept for later too, in the component library.
        await this.components.importFile(file.name, text);
        continue;
      }
      if (extension === '.grtrace') {
        errors.push(...this.openTrace(text));
        continue;
      }
      if (extension === '.csv') {
        errors.push(...this.openChronograph(file.name, text));
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
    const suffix = calibration.reached ? t('measurements.calibratedSuffix', { velocity }) : t('measurements.fitNotReachedSuffix', { velocity });
    this.store.openNew(`${base} ${suffix}.json`, calibration.load);
    this.openErrors = calibration.reached ? [] : [t('measurements.calibrationLimited', { velocity })];
  }

  /** Adds a PressureTrace recording to the active load's measurements; returns error messages. */
  private openTrace(text: string): string[] {
    const active = this.store.active;
    if (!active) return [this.context.t('components.noLoad')];
    const result = importGrtrace(text);
    if (!result.ok) return result.issues.filter((issue) => issue.severity === 'error').map((issue) => issue.message);
    this.store.update(active.id, { ...active.load, measurements: [...active.load.measurements, result.value] });
    return [];
  }

  /** Reads a chronograph export and asks the user to confirm it; returns error messages. */
  private openChronograph(fileName: string, text: string): string[] {
    if (!this.store.active) return [this.context.t('components.noLoad')];
    const csv = readChronographCsv(text);
    if (!csv) return [this.context.t('chronograph.nothing', { file: fileName })];
    this.chronograph = { csv, fileName };
    return [];
  }

  private addMeasurements(series: MeasurementSeries): void {
    const active = this.store.active;
    if (active) this.store.update(active.id, { ...active.load, measurements: [...active.load.measurements, series] });
    this.chronograph = undefined;
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

  private toggleView(view: 'compare' | 'library'): void {
    this.view = this.view === view ? 'editor' : view;
  }

  /** Saves the load in the library: no file to choose; the tab stays linked to its entry. */
  private async saveToLibrary(id: number): Promise<void> {
    const document = this.store.documents.find((candidate) => candidate.id === id);
    if (!document) return;
    const name = document.name.replace(/\.json$/i, '');
    try {
      const libraryId = await this.library.save(name, document.load, document.libraryId);
      this.store.markSaved(id, document.name, libraryId);
    } catch {
      this.openErrors = [this.context.t('library.saveFailed')];
    }
  }

  private openEntry(libraryId: string): void {
    const entry = this.library.get(libraryId);
    if (!entry) return;
    this.store.openSaved(`${entry.name}.json`, entry.load, entry.id);
    this.view = 'editor';
  }

  /** Loads go to the library; powder, projectile and caliber files to the component library. */
  private async importToLibrary(files: File[]): Promise<void> {
    const read = await Promise.all(files.map(async (file) => ({ name: file.name, text: await file.text() })));
    const isComponent = (name: string) => /\.(propellant|projectile|caliber)$/i.test(name);
    const errors: string[] = [];
    for (const file of read.filter(({ name }) => isComponent(name))) errors.push(...(await this.components.importFile(file.name, file.text)));
    const failed = await this.library.importFiles(read.filter(({ name }) => !isComponent(name)));
    this.openErrors = [...failed.map((name) => this.context.t('library.importFailed', { name })), ...errors];
  }

  private downloadBackup(): void {
    const date = new Date().toISOString().slice(0, 10);
    download(this.library.backup(), `gordons-legacy-library-${date}.json`);
  }

  private async restoreBackup(file: File): Promise<void> {
    const { added, failed } = await this.library.restore(await file.text());
    this.openErrors = failed > 0 ? [this.context.t('library.restoreFailed', { added: String(added), failed: String(failed) })] : [];
  }

  /** Writes the load to a file of the user's choice, or downloads it: a copy to share or archive. */
  private async exportFile(id: number): Promise<void> {
    const document = this.store.documents.find((candidate) => candidate.id === id);
    if (document) await saveTextFile(serializeLoad(document.load), document.name);
  }

  private setUnits(system: UnitSystem): void {
    this.settings = { ...this.settings, unitSystem: system, units: presetPreferences(system) };
    this.applySettings();
  }

  private showDocument(id: number): void {
    this.view = 'editor';
    this.store.activate(id);
  }

  /** The example load of a first visit, in a tab of its own; nothing happens if the corpus lacks a part. */
  private openExample(): void {
    const { t } = this.context;
    const load = exampleLoad({ title: t('example.title'), note: t('example.note') });
    if (load) this.store.openNew(`${t('example.title')}.json`, load);
  }

  private closeAbout = () => {
    this.aboutOpen = false;
    window.localStorage.setItem(WELCOME_SEEN_KEY, '1');
  };

  /** Units chosen one kind at a time; the preset shown stays the one they started from. */
  /** Folds an input group away, or brings it back; kept with the settings, not with the load (#25). */
  private foldGroup(title: string): void {
    const folded = this.settings.foldedGroups.includes(title)
      ? this.settings.foldedGroups.filter((group) => group !== title)
      : [...this.settings.foldedGroups, title];
    this.settings = { ...this.settings, foldedGroups: folded };
    this.applySettings();
  }

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
