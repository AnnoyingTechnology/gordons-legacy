import { expect, test } from 'vitest';
import { LANGUAGES, preferredLanguage, translate } from '../src/i18n/i18n.ts';

test('fills placeholders', () => {
  expect(translate('en', 'documents.close', { name: 'load.json' })).toBe('Close load.json');
  expect(translate('de', 'documents.close', { name: 'load.json' })).toBe('load.json schließen');
});

test('picks the first offered language from the browser preferences', () => {
  expect(preferredLanguage(['pt-BR', 'fr-CH', 'en'])).toBe('fr');
  expect(preferredLanguage(['ja'])).toBe('en');
});

test('every translation keeps the placeholders of the English message', () => {
  for (const messages of Object.values(LANGUAGES)) {
    for (const [key, english] of Object.entries(LANGUAGES.en)) {
      const placeholders = (text: string) => (text.match(/\{\w+\}/g) ?? []).sort();
      expect(placeholders(messages[key as keyof typeof messages]), key).toEqual(placeholders(english));
    }
  }
});
