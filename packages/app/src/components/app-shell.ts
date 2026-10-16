import type { Firearm, Load, MeasurementSeries, Projectile } from '@gordons-legacy/formats';
import { FIREARM_FORMAT, importGrtProjectiles, importGrtPropellant, importGrtrace, parseFirearm, serializeFirearm, serializeLoad } from '@gordons-legacy/formats';
import { html, LitElement, nothing } from 'lit';
import type { Language } from '../i18n/i18n.ts';
import { DocumentStore } from '../state/documents.ts';
import { engineById, isResearchEngine } from '../state/engine-choice.ts';
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
import { Library } from '../state/library.ts';
import { indexedDbStorage } from '../state/library-storage.ts';
import { ComponentLibrary, type ComponentEntry } from '../state/components.ts';
import { choosableFirearms, FirearmLibrary, firearmFromLoad, withFirearm, type FirearmEntry } from '../state/firearms.ts';
import { cachedFirearms, fetchFirearms } from '../state/published-firearms.ts';
import { readBackup, writeBackup } from '../state/backup.ts';
import './firearm-dialog.ts';
import './firearm-picker.ts';
import { indexedDbStore } from '../state/indexed-db.ts';
import './converter-dialog.ts';
import './units-dialog.ts';
import './close-document-dialog.ts';
import type { CloseDocumentAction } from './close-document-dialog.ts';
import './new-load-dialog.ts';
import './shortcuts-dialog.ts';
import { cloneSources } from '../state/load-copy.ts';
import type { DocumentHeading } from './document-heading.ts';
import { documentShortcut } from '../state/keyboard-shortcuts.ts';
import { documentSaver } from '../state/document-saving.ts';

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
    editedFirearm: { state: true },
    firearmPickerOpen: { state: true },
    publishedGuns: { state: true },
    closingDocument: { state: true },
    savingBeforeClose: { state: true },
    closeError: { state: true },
    newLoadOpen: { state: true },
    shortcutsOpen: { state: true },
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
  /** The gun being described, with the id of the entry it replaces when it is an edit (issue #24). */
  declare editedFirearm: { firearm: Firearm; id?: string } | undefined;
  /** True while the user is choosing the gun of the active load (issue #30). */
  declare firearmPickerOpen: boolean;
  /** The makers' published guns, read when the user first looks for one; undefined until then. */
  declare publishedGuns: Firearm[] | undefined;
  declare unitsOpen: boolean;
  declare aboutOpen: boolean;
  declare converterOpen: boolean;
  /** The edited tab waiting for Save, Discard or Cancel. */
  declare closingDocument: number | undefined;
  declare savingBeforeClose: boolean;
  declare closeError: string;
  declare newLoadOpen: boolean;
  declare shortcutsOpen: boolean;
  private readonly store = new DocumentStore(window.localStorage);
  private readonly library = new Library(indexedDbStorage());
  private readonly saveDocument = documentSaver(this.store, this.library);
  private readonly components = new ComponentLibrary(indexedDbStore<ComponentEntry>('components'));
  private readonly firearms = new FirearmLibrary(indexedDbStore<FirearmEntry>('firearms'));
  private settings: Settings = loadSettings(window.localStorage, navigator.languages);

  constructor() {
    super();
    this.context = createContext(this.settings.language, this.settings.units, engineById(this.settings.engine));
    this.openErrors = [];
    this.unitsOpen = false;
    this.converterOpen = false;
    this.projectileChoice = undefined;
    this.view = 'editor';
    this.chronograph = undefined;
    this.editedFirearm = undefined;
    this.firearmPickerOpen = false;
    this.publishedGuns = undefined;
    this.closingDocument = undefined;
    this.savingBeforeClose = false;
    this.closeError = '';
    this.newLoadOpen = false;
    this.shortcutsOpen = false;
    // The dedication and safety notice open on a browser's first visit, over an example load, so that the
    // tool shows what it does instead of an empty page (#29).
    this.aboutOpen = window.localStorage.getItem(WELCOME_SEEN_KEY) === null;
    if (this.aboutOpen && this.store.documents.length === 0) this.openExample();
    this.store.subscribe(() => this.requestUpdate());
    this.library.subscribe(() => this.requestUpdate());
    this.firearms.subscribe(() => this.requestUpdate());
    this.components.subscribe(() => this.requestUpdate());
    void this.components.useRepository(indexedDbDataCache(), (url) => fetch(url));
    // Ask the browser not to clear the library under storage pressure; it may still refuse.
    void navigator.storage?.persist?.();
    document.documentElement.lang = this.settings.language;
  }

  protected override createRenderRoot(): HTMLElement {
    return this;
  }

  override connectedCallback(): void {
    super.connectedCallback();
    window.addEventListener('keydown', this.handleShortcut);
  }

  override disconnectedCallback(): void {
    window.removeEventListener('keydown', this.handleShortcut);
    super.disconnectedCallback();
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
          engine: this.context.engine,
        },
        {
          newLoad: () => (this.newLoadOpen = true),
          openFiles: this.openFromInput,
          save: () => active && void this.saveToLibrary(active.id),
          exportFile: () => active && void this.exportFile(active.id),
          toggleView: (view) => this.toggleView(view),
          setUnits: (system) => this.setUnits(system),
          customizeUnits: () => (this.unitsOpen = true),
          toggleConverter: () => (this.converterOpen = !this.converterOpen),
          setLanguage: (language) => this.setLanguage(language),
          setEngine: (id) => this.setEngine(id),
          showAbout: () => (this.aboutOpen = true),
          showShortcuts: () => (this.shortcutsOpen = true),
        },
        this.context,
      )}
      ${tabBar(this.store.documents, active?.id, (document) => this.store.isDirty(document), {
        show: (id) => this.showDocument(id),
        close: (id) => this.requestClose(id),
        key: (event, id) => this.navigateTabs(event, id),
      }, this.context)}
      <main @dragover=${(event: DragEvent) => event.preventDefault()} @drop=${this.openFromDrop}>
        ${isResearchEngine(this.context.engine)
          ? html`<p class="warning">${t('engine.researchWarning', { name: this.context.engine.name })}</p>`
          : nothing}
        ${this.store.storageFull ? html`<p class="warning">${t('documents.storageFull')}</p>` : nothing}
        ${this.openErrors.length > 0
          ? html`<ul class="issues">${this.openErrors.map((message) => html`<li class="error"><span class="severity">!</span> ${message}</li>`)}</ul>`
          : nothing}
        ${this.renderView()}
      </main>
      <footer class="status-footer">
        <span>${t('app.development')}</span>
        <span class="build-details">
          ${t('about.version')} <a href="${REPOSITORY}/commit/${__BUILD_COMMIT__}">${__BUILD_COMMIT__.slice(0, 7)}</a>,
          ${__BUILD_DATE__}
        </span>
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
      ${this.store.active === undefined
        ? nothing
        : html`<gl-firearm-picker
            .open=${this.firearmPickerOpen}
            .load=${this.store.active.load}
            .firearms=${choosableFirearms(this.firearms.entries, this.library.entries, this.publishedGuns ?? [], this.store.active.load.cartridge.name)}
            .loading=${this.publishedGuns === undefined}
            .context=${this.context}
            @choose-firearm=${(event: CustomEvent<Firearm>) => this.useFirearm(event.detail)}
            @close=${() => (this.firearmPickerOpen = false)}
          ></gl-firearm-picker>`}
      <gl-firearm-dialog
        .firearm=${this.editedFirearm?.firearm}
        .context=${this.context}
        @save=${(event: CustomEvent<Firearm>) => void this.keepFirearm(event.detail, this.editedFirearm?.id)}
        @export=${(event: CustomEvent<Firearm>) => download(serializeFirearm(event.detail), `${event.detail.name.trim() || 'gun'}.firearm.json`)}
        @close=${() => (this.editedFirearm = undefined)}
      ></gl-firearm-dialog>
      <gl-converter-dialog .open=${this.converterOpen} .context=${this.context} @close=${() => (this.converterOpen = false)}></gl-converter-dialog>
      <gl-new-load-dialog .open=${this.newLoadOpen} .entries=${this.components.entries} .context=${this.context}
        .sources=${cloneSources(this.store.documents, this.library.entries)}
        .firearms=${this.newLoadOpen ? choosableFirearms(this.firearms.entries, this.library.entries, this.publishedGuns ?? []) : []}
        .loading=${this.publishedGuns === undefined}
        @load-firearms=${() => { if (this.publishedGuns === undefined) void this.readPublishedGuns(); }}
        @create-load=${(event: CustomEvent<Load>) => this.createDocument(event.detail)}
        @close=${() => (this.newLoadOpen = false)}></gl-new-load-dialog>
      <gl-shortcuts-dialog .open=${this.shortcutsOpen} .enabled=${this.settings.keyboardShortcuts} .context=${this.context}
        @shortcuts-change=${(event: CustomEvent<boolean>) => {
          this.settings = { ...this.settings, keyboardShortcuts: event.detail };
          this.applySettings();
        }}
        @close=${() => (this.shortcutsOpen = false)}></gl-shortcuts-dialog>
      <gl-close-document-dialog
        .name=${this.store.documents.find((document) => document.id === this.closingDocument)?.name}
        .saving=${this.savingBeforeClose}
        .error=${this.closeError}
        .context=${this.context}
        @close-document=${(event: CustomEvent<CloseDocumentAction>) => void this.resolveClose(event.detail)}
      ></gl-close-document-dialog>
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
        .firearms=${this.firearms.entries}
        .context=${this.context}
        @edit-firearm=${(event: CustomEvent<{ firearm: Firearm; id?: string }>) => (this.editedFirearm = event.detail)}
        @remove-firearm=${(event: CustomEvent<string>) => void this.keepFirearm(undefined, event.detail)}
        @open-entry=${(event: CustomEvent<string>) => this.openEntry(event.detail)}
        @import-files=${(event: CustomEvent<File[]>) => void this.importToLibrary(event.detail)}
        @backup=${() => this.downloadBackup()}
        @restore=${(event: CustomEvent<File>) => void this.restoreBackup(event.detail)}
      ></gl-library-view>`;
    }
    if (this.view === 'compare' && this.store.documents.length >= 2) {
      return html`<gl-compare-view .documents=${this.store.documents} .context=${this.context}></gl-compare-view>`;
    }
    if (!active) return html`<div class="empty-message"><p>${t('documents.empty')}</p>
      <button @click=${() => (this.newLoadOpen = true)}>${t('documents.new')}</button></div>`;
    return html`
      <header class="print-header">
        <h1>${t('app.title')}: ${active.name.replace(/\.json$/i, '')}</h1>
        <p>${new Date().toLocaleString(this.settings.language)} · ${t('about.version')} ${__BUILD_COMMIT__.slice(0, 7)}</p>
      </header>
      <gl-load-editor
        .load=${active.load}
        .documentName=${active.name.replace(/\.json$/i, '')}
        .documentId=${active.id}
        .context=${this.context}
        .components=${this.components}
        .componentEntries=${this.components.entries}
        .foldedGroups=${this.settings.foldedGroups}
        @fold-group=${(event: CustomEvent<string>) => this.foldGroup(event.detail)}
        @save-firearm=${() => (this.editedFirearm = { firearm: firearmFromLoad(active.load) })}
        @pick-firearm=${() => this.pickFirearm()}
        @load-change=${(event: CustomEvent<Load>) => this.store.update(active.id, event.detail)}
        @rename-document=${(event: CustomEvent<string>) => this.store.rename(active.id, event.detail)}
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
      // A gun is JSON too: told apart by what it says it is, not by its name.
      if (text.includes(FIREARM_FORMAT)) {
        errors.push(...(await this.openFirearm(file.name, text)));
        continue;
      }
      const result = this.store.open(file.name, text);
      if (result.ok) this.view = 'editor';
      else errors.push(...result.issues.filter((issue) => issue.severity === 'error').map((issue) => issue.message));
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
  private async saveToLibrary(id: number): Promise<boolean> {
    this.commitName(id);
    try {
      const saved = await this.saveDocument(id);
      if (saved) this.openErrors = this.openErrors.filter((message) => message !== this.context.t('library.saveFailed'));
      return saved;
    } catch {
      this.openErrors = [this.context.t('library.saveFailed')];
      return false;
    }
  }

  private requestClose(id: number): void {
    this.commitName(id);
    const document = this.store.documents.find((candidate) => candidate.id === id);
    if (!document) return;
    if (!this.store.isDirty(document)) {
      this.closeDocument(id);
      return;
    }
    this.closeError = '';
    this.closingDocument = id;
  }

  private async resolveClose(action: CloseDocumentAction): Promise<void> {
    const id = this.closingDocument;
    if (id === undefined || this.savingBeforeClose) return;
    if (action === 'cancel') {
      this.closingDocument = undefined;
      return;
    }
    if (action === 'save') {
      this.savingBeforeClose = true;
      const saved = await this.saveToLibrary(id);
      this.savingBeforeClose = false;
      if (!saved) {
        this.closeError = this.context.t('library.saveFailed');
        return;
      }
      const document = this.store.documents.find((candidate) => candidate.id === id);
      if (document && this.store.isDirty(document)) return;
    }
    this.closingDocument = undefined;
    this.closeDocument(id);
  }

  /** Return keyboard focus to a surviving tab, or the Open control after the last tab. */
  private closeDocument(id: number): void {
    this.store.close(id);
    if (this.view === 'compare' && this.store.documents.length < 2) this.view = 'editor';
    void this.updateComplete.then(() => {
      const target = this.querySelector<HTMLElement>('.tab.active .tab-name') ?? this.querySelector<HTMLElement>('.toolbar .new-load');
      target?.focus();
    });
  }

  private createDocument(load: Load): void {
    this.store.openNew(`${load.title}.json`, load);
    this.newLoadOpen = false;
    this.openErrors = [];
    this.view = 'editor';
    void this.updateComplete.then(() => this.querySelector<HTMLButtonElement>('.tab.active .tab-name')?.focus());
  }

  private handleShortcut = (event: KeyboardEvent): void => {
    if (this.querySelector('dialog[open]')) return;
    const action = documentShortcut(event, this.settings.keyboardShortcuts);
    const active = this.store.active;
    if (!action || (action !== 'new' && !active)) return;
    event.preventDefault();
    if (action === 'new') this.newLoadOpen = true;
    else if (action === 'close') this.requestClose(active!.id);
    else void this.saveToLibrary(active!.id);
  };

  /** Keyboard commands do not blur the name input before saving or asking whether to discard it. */
  private commitName(id: number): void {
    if (this.store.activeId !== id) return;
    this.querySelector<HTMLInputElement>('.load-title-input')?.blur();
  }

  /** Arrow/Home/End navigation and Delete apply only while a load-tab button has focus. */
  private navigateTabs(event: KeyboardEvent, id: number): void {
    if (event.altKey || event.ctrlKey || event.metaKey || event.shiftKey || event.isComposing) return;
    const documents = this.store.documents;
    const index = documents.findIndex((document) => document.id === id);
    if (index < 0) return;
    if (event.key === 'F2') {
      event.preventDefault();
      this.showDocument(id);
      void this.updateComplete.then(async () => {
        await this.querySelector<LitElement>('gl-load-editor')?.updateComplete;
        const heading = this.querySelector<DocumentHeading>('gl-document-heading');
        await heading?.updateComplete;
        heading?.start();
      });
      return;
    }
    if (event.key === 'Delete') {
      event.preventDefault();
      if (!event.repeat) this.requestClose(id);
      return;
    }
    const next = event.key === 'ArrowRight' ? (index + 1) % documents.length
      : event.key === 'ArrowLeft' ? (index - 1 + documents.length) % documents.length
      : event.key === 'Home' ? 0 : event.key === 'End' ? documents.length - 1 : undefined;
    if (next === undefined) return;
    event.preventDefault();
    const target = documents[next]!;
    this.showDocument(target.id);
    void this.updateComplete.then(() => this.querySelector<HTMLElement>(`[data-document-id="${target.id}"] .tab-name`)?.focus());
  }

  /** A gun file, into the gun library: the same place "Save as a gun" puts one. */
  private async openFirearm(name: string, text: string): Promise<string[]> {
    const result = parseFirearm(text);
    if (!result.ok) return [this.context.t('library.importFailed', { name })];
    await this.keepFirearm(result.value, undefined);
    return [];
  }

  /** Opens the gun chooser, and reads the published database the first time it is asked for (#30). */
  private pickFirearm(): void {
    this.firearmPickerOpen = true;
    if (this.publishedGuns === undefined) void this.readPublishedGuns();
  }

  /**
   * The published guns: what an earlier visit cached shows at once, then the repository's own, which is
   * usually only its index. An empty list means there are none to be had, not that none were looked for.
   */
  private async readPublishedGuns(): Promise<void> {
    const cache = indexedDbDataCache();
    const cached = await cachedFirearms(cache);
    if (cached.length > 0) this.publishedGuns = cached;
    const fetched = await fetchFirearms(cache, (url) => fetch(url));
    this.publishedGuns = fetched.length > 0 ? fetched : (this.publishedGuns ?? []);
  }

  /** The gun the user picked: the load is fired in it, under its name. */
  private useFirearm(firearm: Firearm): void {
    const active = this.store.active;
    if (active) this.store.update(active.id, withFirearm(active.load, firearm));
  }

  private async keepFirearm(firearm: Firearm | undefined, id: string | undefined): Promise<void> {
    try {
      if (firearm) await this.firearms.save(firearm, id);
      else if (id) await this.firearms.remove(id);
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
    const isFirearm = ({ text }: { text: string }) => text.includes(FIREARM_FORMAT);
    const errors: string[] = [];
    for (const file of read.filter(({ name }) => isComponent(name))) errors.push(...(await this.components.importFile(file.name, file.text)));
    for (const file of read.filter(isFirearm)) errors.push(...(await this.openFirearm(file.name, file.text)));
    const loads = read.filter((file) => !isComponent(file.name) && !isFirearm(file));
    const failed = await this.library.importFiles(loads);
    this.openErrors = [...failed.map((name) => this.context.t('library.importFailed', { name })), ...errors];
  }

  private downloadBackup(): void {
    const date = new Date().toISOString().slice(0, 10);
    download(writeBackup(this.library.entries, this.firearms.entries), `gordons-legacy-library-${date}.json`);
  }

  private async restoreBackup(file: File): Promise<void> {
    let text: string;
    try { text = await file.text(); }
    catch {
      this.openErrors = [this.context.t('library.restoreFailed', { added: '0', failed: '1' })];
      return;
    }
    const { added, failed } = await readBackup(text, this.library, this.firearms);
    this.openErrors = failed > 0 ? [this.context.t('library.restoreFailed', { added: String(added), failed: String(failed) })] : [];
  }

  /** Writes the load to a file of the user's choice, or downloads it: a copy to share or archive. */
  private async exportFile(id: number): Promise<void> {
    this.commitName(id);
    const document = this.store.documents.find((candidate) => candidate.id === id);
    if (!document) return;
    try {
      const exported = await saveTextFile(serializeLoad(document.load), document.name);
      if (exported) this.openErrors = this.openErrors.filter((message) => message !== this.context.t('documents.exportFailed'));
    } catch {
      this.openErrors = [this.context.t('documents.exportFailed')];
    }
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

  /** The engine every view computes with; the open loads are simulated again with it (engine-choice.ts). */
  private setEngine(id: string): void {
    this.settings = { ...this.settings, engine: id };
    this.applySettings();
  }

  private setLanguage(language: Language): void {
    this.settings = { ...this.settings, language };
    document.documentElement.lang = language;
    this.applySettings();
  }

  private applySettings(): void {
    saveSettings(window.localStorage, this.settings);
    this.context = createContext(this.settings.language, this.settings.units, engineById(this.settings.engine));
  }
}

customElements.define('gl-app', AppShell);
