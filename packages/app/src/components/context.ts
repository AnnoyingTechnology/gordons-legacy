import type { Engine } from '@gordons-legacy/engine';
import { translate, type Language, type MessageKey } from '../i18n/i18n.ts';
import { displayUnit, formatNumber, type QuantityKind, type UnitPreferences } from '../units/units.ts';

/**
 * What every component needs to present values: the language and the display units. The app creates
 * a new context when a setting changes, which makes the components that receive it re-render.
 */
export interface UiContext {
  language: Language;
  units: UnitPreferences;
  /** The engine the user chose; every figure on screen comes from this one (state/engine-choice.ts). */
  engine: Engine;
  /** Translates a message. */
  t: (key: MessageKey, parameters?: Record<string, string>) => string;
  /** Formats an SI value in its display unit, with the unit's symbol. */
  quantity: (value: number, kind: QuantityKind, decimals?: number) => string;
  /** Formats a plain number in the user's locale. */
  number: (value: number, decimals: number) => string;
}

export function createContext(language: Language, units: UnitPreferences, engine: Engine): UiContext {
  return {
    language,
    units,
    engine,
    t: (key, parameters) => translate(language, key, parameters),
    quantity: (value, kind, decimals) => {
      const unit = displayUnit(kind, units);
      return `${formatNumber(unit.fromSi(value), decimals ?? unit.decimals, language)} ${unit.symbol}`;
    },
    number: (value, decimals) => formatNumber(value, decimals, language),
  };
}
