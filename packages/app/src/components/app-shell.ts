import type { Load, MeasurementSeries, Projectile } from '@gordons-legacy/formats';
import { importGrtProjectiles, importGrtPropellant, importGrtrace, serializeLoad } from '@gordons-legacy/formats';
import { html, LitElement, nothing } from 'lit';
import { LANGUAGE_NAMES, type Language } from '../i18n/i18n.ts';
import { icon } from '../icons/icons.ts';
import { DocumentStore } from '../state/documents.ts';
import { loadSettings, saveSettings, type Settings } from '../state/settings.ts';
import { presetPreferences, type UnitPreferences, type UnitSystem } from '../units/units.ts';
import { createContext, type UiContext } from './context.ts';
import { loadBadges } from './load-badges.ts';
import { withProjectile, withPropellant } from '../editor/components.ts';
import { REPOSITORY } from './about-dialog.ts';
// The app icon, inlined so that the single-file copy shows it too.
import logo from '../../public/icon.svg?raw';
import './choice-dialog.ts';
import './chronograph-dialog.ts';
import { readChronographCsv, type ChronographCsv } from '../measurements/chronograph-csv.ts';
import './compare-view.ts';
import type { CalibratedLoad } from './measurements-view.ts';
import './library-view.ts';
import './load-editor.ts';
import { firearms, Library } from '../state/library.ts';
import { indexedDbStorage } from '../state/library-storage.ts';
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
  private readonly store = new DocumentStore(window.localStorage);
  private readonly library = new Library(indexedDbStorage());
  private settings: Settings = loadSettings(window.localStorage, navigator.languages);

  constructor() {
    super();
    this.context = createContext(this.settings.language, this.settings.units);
    this.openErrors = [];
    this.unitsOpen = false;
    this.projectileChoice = undefined;
    this.view = 'editor';
    this.chronograph = undefined;
    // The dedication and safety notice open on a browser's first visit.
    this.aboutOpen = window.localStorage.getItem(WELCOME_SEEN_KEY) === null;
    this.store.subscribe(() => this.requestUpdate());
    this.library.subscribe(() => this.requestUpdate());
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
      <header class="toolbar">
        <h1><img class="logo" src=${`data:image/svg+xml,${encodeURIComponent(logo)}`} alt="" />${t('app.title')}</h1>
        <div class="tool-group">
          <label class="tool">
            ${icon('open')}<span>${t('toolbar.open')}</span>
            <input type="file" accept=".grtload,.json,.propellant,.projectile,.grtrace,.csv" multiple hidden @change=${this.openFromInput} />
          </label>
          <button class="tool" ?disabled=${!active} title=${t('toolbar.saveHelp')} @click=${() => active && this.saveToLibrary(active.id)}>${icon('save')}<span>${t('toolbar.save')}</span></button>
          <button class="tool" ?disabled=${!active} title=${t('toolbar.exportHelp')} @click=${() => active && this.exportFile(active.id)}>${icon('export')}<span>${t('toolbar.export')}</span></button>
          <button class="tool" ?disabled=${!active} @click=${() => window.print()}>${icon('print')}<span>${t('toolbar.print')}</span></button>
        </div>
        <div class="tool-group">
          <button class="tool" aria-pressed=${this.view === 'library' ? 'true' : 'false'} @click=${() => this.toggleView('library')}>
            ${icon('database')}<span>${t('toolbar.library')}</span>
          </button>
          <button
            class="tool"
            ?disabled=${this.store.documents.length < 2}
            aria-pressed=${this.view === 'compare' ? 'true' : 'false'}
            @click=${() => this.toggleView('compare')}
          >${icon('compare')}<span>${t('toolbar.compare')}</span></button>
        </div>
        <span class="spacer"></span>
        <div class="tool-group">
          <label class="tool tool-select">
            <span>${t('toolbar.units')}</span>
            <select @change=${(event: Event) => this.setUnits((event.target as HTMLSelectElement).value as UnitSystem)}>
              <option value="metric" ?selected=${this.settings.unitSystem === 'metric'}>${t('units.metric')}</option>
              <option value="imperial" ?selected=${this.settings.unitSystem === 'imperial'}>${t('units.imperial')}</option>
            </select>
          </label>
          <button class="tool" @click=${() => (this.unitsOpen = true)}>${icon('units')}<span>${t('units.customize')}</span></button>
          <label class="tool tool-select">
            <span>${t('toolbar.language')}</span>
            <select @change=${(event: Event) => this.setLanguage((event.target as HTMLSelectElement).value as Language)}>
              ${Object.entries(LANGUAGE_NAMES).map(
                ([code, name]) => html`<option value=${code} ?selected=${code === this.settings.language}>${name}</option>`,
              )}
            </select>
          </label>
          <button class="tool" @click=${() => (this.aboutOpen = true)}>${icon('info')}<span>${t('toolbar.about')}</span></button>
        </div>
      </header>
      <nav class="tabs" role="tablist">
        ${this.store.documents.map((document) => {
          const dirty = this.store.isDirty(document);
          return html`
            <div class="tab ${document.id === active?.id ? 'active' : ''}" role="tab" aria-selected=${document.id === active?.id}>
              <button class="tab-name" title=${document.name} @click=${() => this.showDocument(document.id)}>
                <span class="tab-title">${document.name.replace(/\.json$/i, '')}${dirty ? html`<span class="unsaved" title=${t('documents.unsaved')}> •</span>` : nothing}</span>
                ${loadBadges(document.load, this.context)}
              </button>
              <button class="tab-close" aria-label=${t('documents.close', { name: document.name })} @click=${() => this.store.close(document.id)}>${icon('close')}</button>
            </div>
          `;
        })}
      </nav>
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
        @load-change=${(event: CustomEvent<Load>) => this.store.update(active.id, event.detail)}
        @calibrated=${(event: CustomEvent<CalibratedLoad>) => this.openCalibrated(active.name, event.detail)}
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

  private async importToLibrary(files: File[]): Promise<void> {
    const read = await Promise.all(files.map(async (file) => ({ name: file.name, text: await file.text() })));
    const failed = await this.library.importFiles(read);
    this.openErrors = failed.map((name) => this.context.t('library.importFailed', { name }));
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
    if (!document) return;
    const text = serializeLoad(document.load);
    const picker = (window as { showSaveFilePicker?: (options: object) => Promise<FileSystemFileHandle> }).showSaveFilePicker;
    if (picker) {
      try {
        const handle = await picker({ suggestedName: document.name, types: [{ accept: { 'application/json': ['.json'] } }] });
        const writable = await handle.createWritable();
        await writable.write(text);
        await writable.close();
      } catch {
        // Cancelled by the user.
      }
      return;
    }
    download(text, document.name);
  }

  private setUnits(system: UnitSystem): void {
    this.settings = { ...this.settings, unitSystem: system, units: presetPreferences(system) };
    this.applySettings();
  }

  private showDocument(id: number): void {
    this.view = 'editor';
    this.store.activate(id);
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

/** Downloads text as a JSON file. */
function download(text: string, name: string): void {
  const link = Object.assign(window.document.createElement('a'), {
    href: URL.createObjectURL(new Blob([text], { type: 'application/json' })),
    download: name,
  });
  link.click();
  URL.revokeObjectURL(link.href);
}

customElements.define('gl-app', AppShell);
