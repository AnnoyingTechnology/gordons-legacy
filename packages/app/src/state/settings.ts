import { preferredLanguage, type Language } from '../i18n/i18n.ts';
import { presetPreferences, type UnitPreferences, type UnitSystem } from '../units/units.ts';
import { DEFAULT_ENGINE } from './engine-choice.ts';

export interface Settings {
  language: Language;
  /** The preset last chosen; `units` may differ from it after per-kind changes. */
  unitSystem: UnitSystem;
  units: UnitPreferences;
  /** Titles of the input groups folded away in the editor (issue #25). */
  foldedGroups: string[];
  /** Id of the engine that computes every figure shown (engine-choice.ts). */
  engine: string;
  /** Application shortcuts are opt-in; browser window/tab commands are never claimed. */
  keyboardShortcuts: boolean;
}

const STORAGE_KEY = 'gordons-legacy.settings';

/** Settings saved in the browser, with defaults from the browser's languages. */
export function loadSettings(storage: Storage | undefined, browserLanguages: readonly string[]): Settings {
  const defaults: Settings = {
    language: preferredLanguage(browserLanguages),
    unitSystem: 'metric',
    units: presetPreferences('metric'),
    foldedGroups: [],
    engine: DEFAULT_ENGINE.id,
    keyboardShortcuts: false,
  };
  try {
    const saved = JSON.parse(storage?.getItem(STORAGE_KEY) ?? '{}') as Partial<Settings>;
    return { ...defaults, ...saved, keyboardShortcuts: saved.keyboardShortcuts === true };
  } catch {
    return defaults;
  }
}

export function saveSettings(storage: Storage | undefined, settings: Settings): void {
  storage?.setItem(STORAGE_KEY, JSON.stringify(settings));
}
