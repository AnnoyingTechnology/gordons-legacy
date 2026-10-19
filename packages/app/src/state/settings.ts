import { LANGUAGES, preferredLanguage, type Language } from '../i18n/i18n.ts';
import { CHOOSABLE_KINDS, presetPreferences, unitsFor, type UnitPreferences, type UnitSystem } from '../units/units.ts';
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
    const saved: unknown = JSON.parse(storage?.getItem(STORAGE_KEY) ?? '{}');
    if (typeof saved !== 'object' || saved === null || Array.isArray(saved)) return defaults;
    const fields = saved as Record<string, unknown>;
    const unitSystem = fields.unitSystem === 'imperial' ? 'imperial' : 'metric';
    const units = presetPreferences(unitSystem);
    if (typeof fields.units === 'object' && fields.units !== null && !Array.isArray(fields.units)) {
      const storedUnits = fields.units as Record<string, unknown>;
      for (const kind of CHOOSABLE_KINDS) {
        const id = storedUnits[kind];
        if (typeof id === 'string' && unitsFor(kind).some(unit => unit.id === id)) units[kind] = id;
      }
    }
    return {
      language: typeof fields.language === 'string' && Object.hasOwn(LANGUAGES, fields.language) ? fields.language as Language : defaults.language,
      unitSystem, units,
      foldedGroups: Array.isArray(fields.foldedGroups) ? fields.foldedGroups.filter((group): group is string => typeof group === 'string') : [],
      engine: typeof fields.engine === 'string' ? fields.engine : defaults.engine,
      keyboardShortcuts: fields.keyboardShortcuts === true,
    };
  } catch {
    return defaults;
  }
}

export function saveSettings(storage: Storage | undefined, settings: Settings): void {
  // A browser may refuse the write (storage blocked for the site, or full). Changing a unit must not
  // throw out of the click that changed it; the setting then holds for the session only.
  try {
    storage?.setItem(STORAGE_KEY, JSON.stringify(settings));
  } catch {
    // Nothing to do here: the shell already says that this browser remembers nothing.
  }
}
