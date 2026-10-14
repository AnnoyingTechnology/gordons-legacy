import type { ImportIssue, Load } from '@gordons-legacy/formats';
import { serializeLoad } from '@gordons-legacy/formats';
import { html, LitElement, nothing } from 'lit';
import { LANGUAGE_NAMES, type Language } from '../i18n/i18n.ts';
import { icon } from '../icons/icons.ts';
import { DocumentStore } from '../state/documents.ts';
import { loadSettings, saveSettings, type Settings } from '../state/settings.ts';
import { presetPreferences, type UnitSystem } from '../units/units.ts';
import { createContext, type UiContext } from './context.ts';
import './load-editor.ts';

/**
 * The application: toolbar, one tab per open load, and the active load's editor. Owns the document
 * store and the settings, and hands a UI context (language, units) down to the editor.
 */
export class AppShell extends LitElement {
  static override properties = {
    context: { state: true },
    openErrors: { state: true },
  };

  declare context: UiContext;
  declare openErrors: ImportIssue[];
  private readonly store = new DocumentStore(window.localStorage);
  private settings: Settings = loadSettings(window.localStorage, navigator.languages);

  constructor() {
    super();
    this.context = createContext(this.settings.language, this.settings.units);
    this.openErrors = [];
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
          <input type="file" accept=".grtload,.json" multiple hidden @change=${this.openFromInput} />
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
          ? html`<ul class="issues">${this.openErrors.map((issue) => html`<li class="error"><span class="severity">!</span> ${issue.message}</li>`)}</ul>`
          : nothing}
        ${active
          ? html`<gl-load-editor
              .load=${active.load}
              .context=${this.context}
              @load-change=${(event: CustomEvent<Load>) => this.store.update(active.id, event.detail)}
            ></gl-load-editor>`
          : html`<p class="empty">${t('documents.empty')}</p>`}
      </main>
    `;
  }

  private async openFiles(files: Iterable<File>): Promise<void> {
    const errors: ImportIssue[] = [];
    for (const file of files) {
      const result = this.store.open(file.name, await file.text());
      if (!result.ok) errors.push(...result.issues.filter((issue) => issue.severity === 'error'));
    }
    this.openErrors = errors;
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
