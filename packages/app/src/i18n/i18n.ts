import { de } from './de.ts';
import { en, type MessageKey, type Messages } from './en.ts';
import { es } from './es.ts';
import { fr } from './fr.ts';
import { it } from './it.ts';

/**
 * Translations. The five languages are those most spoken where handloading is common (docs/PLAN.md,
 * UI). English is the source; the others provide every key.
 */
export const LANGUAGES = { en, fr, de, es, it } satisfies Record<string, Messages>;
export type Language = keyof typeof LANGUAGES;

/** Names of the languages in their own language, for the language menu. */
export const LANGUAGE_NAMES: Record<Language, string> = {
  en: 'English',
  fr: 'Français',
  de: 'Deutsch',
  es: 'Español',
  it: 'Italiano',
};

/** The first of the user's preferred languages that we offer, or English. */
export function preferredLanguage(preferences: readonly string[]): Language {
  for (const tag of preferences) {
    const code = tag.toLowerCase().split('-')[0]!;
    if (code in LANGUAGES) return code as Language;
  }
  return 'en';
}

/** Translates a message and fills its `{name}` placeholders. */
export function translate(language: Language, key: MessageKey, parameters: Record<string, string> = {}): string {
  return LANGUAGES[language][key].replace(/\{(\w+)\}/g, (match, name: string) => parameters[name] ?? match);
}

export type { MessageKey };
