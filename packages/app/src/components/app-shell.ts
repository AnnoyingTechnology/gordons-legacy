import type { Firearm, Load, MeasurementSeries, Projectile } from '@gordons-legacy/formats';
import { serializeFirearm, serializeLoad } from '@gordons-legacy/formats';
import { html, LitElement, nothing } from 'lit';
import type { MessageKey } from '../i18n/i18n.ts';
import { browserStorage, remember, remembered } from '../state/browser-storage.ts';
import { DocumentStore } from '../state/documents.ts';
import { engineById, isResearchEngine } from '../state/engine-choice.ts';
import { loadSettings, saveSettings, type Settings } from '../state/settings.ts';
import { presetPreferences, type UnitPreferences } from '../units/units.ts';
import { indexedDbDataCache } from '../state/data-cache.ts';
import { exampleLoad } from '../state/example-load.ts';
import { download, saveTextFile } from '../state/file-saving.ts';
import { createContext, type UiContext } from './context.ts';
import { tabBar } from './tab-bar.ts';
import { toolbar } from './toolbar.ts';
import { withProjectile } from '../editor/components.ts';
import { REPOSITORY } from './about-dialog.ts';
import './choice-dialog.ts';
import './chronograph-dialog.ts';
import type { ChronographCsv } from '../measurements/chronograph-csv.ts';
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
import { Inventory, type StockItem, type Use } from '../state/inventory.ts';
import './batch-dialog.ts';
import './sync-dialog.ts';
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
import { documentShortcut, isTextEntry } from '../state/keyboard-shortcuts.ts';
import { documentSaver } from '../state/document-saving.ts';
import type { LoadChange } from '../state/load-change.ts';
import { importIntoLibrary, openInEditor, readFiles, type FileDestinations } from '../state/file-opening.ts';

const WELCOME_SEEN_KEY = 'gordons-legacy.welcome-seen';

/**
 * The application: toolbar, one tab per open load, and the active load's editor, the comparison or the
 * library. Owns the document store, the libraries and the settings, and hands a UI context (language,
 * units, engine) down to every view. What an opened or dropped file becomes is decided in
 * state/file-opening.ts.
 */
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
    batch: { state: true },
    syncOpen: { state: true },
    batchBusy: { state: true },
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
  /** The saved load a batch is being recorded of (batch-dialog.ts); undefined when none. */
  declare batch: { name: string; load: Load } | undefined;
  /** Whether the bench ↔ phone exchange is open (sync-dialog.ts). */
  declare syncOpen: boolean;
  /** True while a batch is being taken off the shelf. */
  declare batchBusy: boolean;
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
  /** The browser's storage, or nothing when the browser refuses it (browser-storage.ts). */
  private readonly storage = browserStorage();
  private readonly store = new DocumentStore(this.storage);
  private readonly library = new Library(indexedDbStorage());
  private readonly saveDocument = documentSaver(this.store, this.library);
  private readonly components = new ComponentLibrary(indexedDbStore<ComponentEntry>('components'));
  private readonly firearms = new FirearmLibrary(indexedDbStore<FirearmEntry>('firearms'));
  private readonly inventory = new Inventory(indexedDbStore<StockItem>('inventory'));
  private readonly fileDestinations: FileDestinations = {
    documents: this.store,
    components: this.components,
    firearms: this.firearms,
    library: this.library,
  };
  private settings: Settings = loadSettings(this.storage, navigator.languages);

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
    this.syncOpen = false;
    this.batchBusy = false;
    this.shortcutsOpen = false;
    // The dedication and safety notice open on a browser's first visit, over an example load, so that the
    // tool shows what it does instead of an empty page (#29).
    this.aboutOpen = remembered(this.storage, WELCOME_SEEN_KEY) === null;
    if (this.aboutOpen && this.store.documents.length === 0) this.openExample();
    this.store.subscribe(() => this.requestUpdate());
    this.library.subscribe(() => this.requestUpdate());
    this.firearms.subscribe(() => this.requestUpdate());
    this.inventory.subscribe(() => this.requestUpdate());
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
          canUndo: active !== undefined && this.store.canUndo(active.id),
          canRedo: active !== undefined && this.store.canRedo(active.id),
          canReopen: this.store.canReopen,
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
          undo: () => active && this.store.undo(active.id),
          redo: () => active && this.store.redo(active.id),
          reopen: () => this.reopenClosed(),
          toggleView: (view) => this.toggleView(view),
          // Choosing a preset sets every kind of quantity to its unit.
          setUnits: (system) => this.changeSettings({ unitSystem: system, units: presetPreferences(system) }),
          customizeUnits: () => (this.unitsOpen = true),
          toggleConverter: () => (this.converterOpen = !this.converterOpen),
          setLanguage: (language) => this.changeSettings({ language }),
          // The open loads are simulated again with the engine chosen (engine-choice.ts).
          setEngine: (id) => this.changeSettings({ engine: id }),
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
        ${this.storage === undefined ? html`<p class="warning" role="alert">${t('documents.storageDenied')}</p>` : nothing}
        ${this.store.storageFull ? html`<p class="warning">${t('documents.storageFull')}</p>` : nothing}
        ${this.store.recoveryFailed ? html`<p class="warning" role="alert">${t('documents.recoveryFailed')}</p>` : nothing}
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
      ${this.renderDialogs()}
    `;
  }

  /** Every dialog of the application: each shows itself when its state asks it to. */
  private renderDialogs() {
    const { t } = this.context;
    const active = this.store.active;
    return html`
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
        @save=${(event: CustomEvent<Firearm>) => void this.reportWrite('library.saveFailed', () => this.firearms.save(event.detail, this.editedFirearm?.id))}
        @export=${(event: CustomEvent<Firearm>) => download(serializeFirearm(event.detail), `${event.detail.name.trim() || 'gun'}.firearm.json`)}
        @close=${() => (this.editedFirearm = undefined)}
      ></gl-firearm-dialog>
      <gl-sync-dialog .open=${this.syncOpen} .library=${this.library} .inventory=${this.inventory} .context=${this.context}
        @close=${() => (this.syncOpen = false)}></gl-sync-dialog>
      <gl-batch-dialog .batch=${this.batch} .items=${this.inventory.entries} .busy=${this.batchBusy} .context=${this.context}
        @use-stock=${(event: CustomEvent<Use[]>) => void this.useStock(event.detail)}
        @close=${() => (this.batch = undefined)}></gl-batch-dialog>
      <gl-converter-dialog .open=${this.converterOpen} .context=${this.context} @close=${() => (this.converterOpen = false)}></gl-converter-dialog>
      <gl-new-load-dialog .open=${this.newLoadOpen} .entries=${this.components.entries} .context=${this.context}
        .sources=${cloneSources(this.store.documents, this.library.entries)}
        .firearms=${this.newLoadOpen ? choosableFirearms(this.firearms.entries, this.library.entries, this.publishedGuns ?? []) : []}
        .loading=${this.publishedGuns === undefined}
        @load-firearms=${() => { if (this.publishedGuns === undefined) void this.readPublishedGuns(); }}
        @create-load=${(event: CustomEvent<Load>) => this.createDocument(event.detail)}
        @close=${() => (this.newLoadOpen = false)}></gl-new-load-dialog>
      <gl-shortcuts-dialog .open=${this.shortcutsOpen} .enabled=${this.settings.keyboardShortcuts} .context=${this.context}
        @shortcuts-change=${(event: CustomEvent<boolean>) => this.changeSettings({ keyboardShortcuts: event.detail })}
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
        @units-change=${(event: CustomEvent<UnitPreferences>) => this.changeSettings({ units: event.detail })}
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
        .stock=${this.inventory.entries}
        .context=${this.context}
        @save-stock=${(event: CustomEvent<StockItem>) => void this.reportWrite('library.saveFailed', () => this.inventory.save(event.detail))}
        @remove-stock=${(event: CustomEvent<string>) => void this.reportWrite('library.removeFailed', () => this.inventory.remove(event.detail))}
        @record-batch=${(event: CustomEvent<string>) => this.recordBatch(event.detail)}
        @sync=${() => (this.syncOpen = true)}
        @edit-firearm=${(event: CustomEvent<{ firearm: Firearm; id?: string }>) => (this.editedFirearm = event.detail)}
        @remove-firearm=${(event: CustomEvent<string>) => void this.reportWrite('library.removeFailed', () => this.firearms.remove(event.detail))}
        @remove-entry=${(event: CustomEvent<string>) => void this.reportWrite('library.removeFailed', () => this.library.remove(event.detail))}
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
        @load-change=${(event: CustomEvent<LoadChange>) => this.store.update(active.id, event.detail.load, event.detail.typing)}
        @rename-document=${(event: CustomEvent<string>) => this.store.rename(active.id, event.detail)}
        @calibrated=${(event: CustomEvent<CalibratedLoad>) => this.openCalibrated(active.name, event.detail)}
        @open-load=${(event: CustomEvent<{ name: string; load: Load }>) => this.store.openNew(`${event.detail.name}.json`, event.detail.load)}
      ></gl-load-editor>
    `;
  }

  /** Files opened from the toolbar or dropped on the main area (file-opening.ts). */
  private async openFiles(files: Iterable<File>): Promise<void> {
    const opened = await openInEditor(await readFiles(files), this.fileDestinations, this.context.t);
    if (opened.loadOpened) this.view = 'editor';
    if (opened.projectileChoice) this.projectileChoice = opened.projectileChoice;
    if (opened.chronograph) this.chronograph = opened.chronograph;
    this.openErrors = opened.errors;
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
    return this.reportWrite('library.saveFailed', () => this.saveDocument(id));
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
    const action = documentShortcut(event, this.settings.keyboardShortcuts, isTextEntry(event.target));
    const active = this.store.active;
    if (!action || (action !== 'new' && action !== 'reopen' && !active)) return;
    event.preventDefault();
    if (action === 'new') this.newLoadOpen = true;
    else if (action === 'reopen') this.reopenClosed();
    else if (action === 'close') this.requestClose(active!.id);
    else if (action === 'undo') this.store.undo(active!.id);
    else if (action === 'redo') this.store.redo(active!.id);
    else void this.saveToLibrary(active!.id);
  };

  /** Brings back the last closed load, in the editor. */
  private reopenClosed(): void {
    if (!this.store.canReopen) return;
    this.store.reopenClosed();
    this.view = 'editor';
    void this.updateComplete.then(() => this.querySelector<HTMLButtonElement>('.tab.active .tab-name')?.focus());
  }

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

  /** A batch of a saved load: what it used comes off the shelf (batch-dialog.ts). */
  private recordBatch(entryId: string): void {
    const entry = this.library.entries.find((candidate) => candidate.id === entryId);
    if (entry) this.batch = { name: entry.name, load: entry.load };
  }

  /** Takes a batch off the shelf; the dialog stays open, with its error, if the write failed. */
  private async useStock(uses: Use[]): Promise<void> {
    if (this.batchBusy) return;
    this.batchBusy = true;
    const written = await this.reportWrite('library.saveFailed', () => this.inventory.use(uses));
    this.batchBusy = false;
    if (written) this.batch = undefined;
  }

  /**
   * Runs a write to the library or to a file. If it fails, `failure` is shown: a failed delete, for one,
   * leaves the entry in place, and without a message the user would take the click for a delete. Once a
   * write goes through, an earlier `failure` is cleared; one that returns false (nothing written, or the
   * user cancelled) leaves the messages as they are. True when the write went through.
   */
  private async reportWrite(failure: MessageKey, write: () => Promise<unknown>): Promise<boolean> {
    const message = this.context.t(failure);
    try {
      const written = (await write()) !== false;
      if (written) this.openErrors = this.openErrors.filter((shown) => shown !== message);
      return written;
    } catch {
      this.openErrors = [message];
      return false;
    }
  }

  private openEntry(libraryId: string): void {
    const entry = this.library.get(libraryId);
    if (!entry) return;
    this.store.openSaved(`${entry.name}.json`, entry.load, entry.id);
    this.view = 'editor';
  }

  /** Files imported from the library view (file-opening.ts). */
  private async importToLibrary(files: File[]): Promise<void> {
    this.openErrors = await importIntoLibrary(await readFiles(files), this.fileDestinations, this.context.t);
  }

  private downloadBackup(): void {
    const date = new Date().toISOString().slice(0, 10);
    download(writeBackup(this.library.entries, this.firearms.entries, this.inventory.entries), `gordons-legacy-library-${date}.json`);
  }

  private async restoreBackup(file: File): Promise<void> {
    let text: string;
    try { text = await file.text(); }
    catch {
      this.openErrors = [this.context.t('library.restoreFailed', { added: '0', failed: '1' })];
      return;
    }
    const { added, failed } = await readBackup(text, this.library, this.firearms, this.inventory);
    this.openErrors = failed > 0 ? [this.context.t('library.restoreFailed', { added: String(added), failed: String(failed) })] : [];
  }

  /** Writes the load to a file of the user's choice, or downloads it: a copy to share or archive. */
  private async exportFile(id: number): Promise<void> {
    this.commitName(id);
    const document = this.store.documents.find((candidate) => candidate.id === id);
    if (!document) return;
    await this.reportWrite('documents.exportFailed', () => saveTextFile(serializeLoad(document.load), document.name));
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
    remember(this.storage, WELCOME_SEEN_KEY, '1');
  };

  /** Folds an input group away, or brings it back; kept with the settings, not with the load (#25). */
  private foldGroup(title: string): void {
    const folded = this.settings.foldedGroups.includes(title)
      ? this.settings.foldedGroups.filter((group) => group !== title)
      : [...this.settings.foldedGroups, title];
    this.changeSettings({ foldedGroups: folded });
  }

  /**
   * Changes some settings, keeps them in the browser and hands the components a new context. Units chosen
   * one kind at a time leave `unitSystem` alone: the preset shown stays the one they started from.
   */
  private changeSettings(change: Partial<Settings>): void {
    this.settings = { ...this.settings, ...change };
    saveSettings(this.storage, this.settings);
    document.documentElement.lang = this.settings.language;
    this.context = createContext(this.settings.language, this.settings.units, engineById(this.settings.engine));
  }
}

customElements.define('gl-app', AppShell);
