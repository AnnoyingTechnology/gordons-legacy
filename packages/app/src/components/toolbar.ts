import { html } from 'lit';
import { LANGUAGE_NAMES, type Language } from '../i18n/i18n.ts';
import { icon } from '../icons/icons.ts';
import type { UnitSystem } from '../units/units.ts';
// The app icon, inlined so that the single-file copy shows it too.
import logo from '../../public/icon.svg?raw';
import type { UiContext } from './context.ts';

/** What the toolbar shows: which buttons apply, which are pressed, the current settings. */
export interface ToolbarState {
  /** Whether a load is open (Save, Export and Print need one). */
  hasActiveLoad: boolean;
  /** How many loads are open (Compare needs two). */
  openLoads: number;
  view: 'editor' | 'compare' | 'library';
  converterOpen: boolean;
  unitSystem: UnitSystem;
  language: Language;
}

/** What the toolbar's buttons do; the application shell provides them. */
export interface ToolbarActions {
  openFiles: (event: Event) => void;
  save: () => void;
  exportFile: () => void;
  toggleView: (view: 'compare' | 'library') => void;
  setUnits: (system: UnitSystem) => void;
  customizeUnits: () => void;
  toggleConverter: () => void;
  setLanguage: (language: Language) => void;
  showAbout: () => void;
}

/** The files the Open button accepts: loads, components, pressure traces and chronograph exports. */
const OPENED_FILES = '.grtload,.json,.propellant,.projectile,.grtrace,.csv';

/** The application's toolbar: full-height buttons in groups, icon above label (issue #1). */
export function toolbar(state: ToolbarState, actions: ToolbarActions, context: UiContext) {
  const { t } = context;
  const pressed = (on: boolean) => (on ? 'true' : 'false');
  return html`
    <header class="toolbar">
      <h1><img class="logo" src=${`data:image/svg+xml,${encodeURIComponent(logo)}`} alt="" />${t('app.title')}</h1>
      <div class="tool-group">
        <label class="tool">
          ${icon('open')}<span>${t('toolbar.open')}</span>
          <input type="file" accept=${OPENED_FILES} multiple hidden @change=${actions.openFiles} />
        </label>
        <button class="tool" ?disabled=${!state.hasActiveLoad} title=${t('toolbar.saveHelp')} @click=${actions.save}>
          ${icon('save')}<span>${t('toolbar.save')}</span>
        </button>
        <button class="tool" ?disabled=${!state.hasActiveLoad} title=${t('toolbar.exportHelp')} @click=${actions.exportFile}>
          ${icon('export')}<span>${t('toolbar.export')}</span>
        </button>
        <button class="tool" ?disabled=${!state.hasActiveLoad} @click=${() => window.print()}>${icon('print')}<span>${t('toolbar.print')}</span></button>
      </div>
      <div class="tool-group">
        <button class="tool" aria-pressed=${pressed(state.view === 'library')} @click=${() => actions.toggleView('library')}>
          ${icon('database')}<span>${t('toolbar.library')}</span>
        </button>
        <button class="tool" ?disabled=${state.openLoads < 2} aria-pressed=${pressed(state.view === 'compare')} @click=${() => actions.toggleView('compare')}>
          ${icon('compare')}<span>${t('toolbar.compare')}</span>
        </button>
      </div>
      <span class="spacer"></span>
      <div class="tool-group">
        <label class="tool tool-select">
          <span>${t('toolbar.units')}</span>
          <select @change=${(event: Event) => actions.setUnits((event.target as HTMLSelectElement).value as UnitSystem)}>
            <option value="metric" ?selected=${state.unitSystem === 'metric'}>${t('units.metric')}</option>
            <option value="imperial" ?selected=${state.unitSystem === 'imperial'}>${t('units.imperial')}</option>
          </select>
        </label>
        <button class="tool" @click=${actions.customizeUnits}>${icon('units')}<span>${t('units.customize')}</span></button>
        <button class="tool" aria-pressed=${pressed(state.converterOpen)} @click=${actions.toggleConverter}>
          ${icon('calculator')}<span>${t('converter.short')}</span>
        </button>
        <label class="tool tool-select">
          <span>${t('toolbar.language')}</span>
          <select @change=${(event: Event) => actions.setLanguage((event.target as HTMLSelectElement).value as Language)}>
            ${Object.entries(LANGUAGE_NAMES).map(([code, name]) => html`<option value=${code} ?selected=${code === state.language}>${name}</option>`)}
          </select>
        </label>
        <button class="tool" @click=${actions.showAbout}>${icon('info')}<span>${t('toolbar.about')}</span></button>
      </div>
    </header>
  `;
}
