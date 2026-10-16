import { expect, test } from 'vitest';
import { loadSettings } from '../src/state/settings.ts';
import { createContext } from '../src/components/context.ts';
import { DEFAULT_ENGINE } from '../src/state/engine-choice.ts';

const storage = (value: unknown) => ({ getItem: () => JSON.stringify(value) }) as unknown as Storage;

test('corrupt preferences fall back independently while valid choices survive', () => {
  const settings = loadSettings(storage({ language: 'missing', units: null, foldedGroups: null,
    unitSystem: 'imperial', keyboardShortcuts: true, engine: null }), ['fr-FR']);
  expect(settings.language).toBe('fr');
  expect(settings.unitSystem).toBe('imperial');
  expect(settings.units.length).toBe('in');
  expect(settings.foldedGroups).toEqual([]);
  expect(settings.engine).toBe(DEFAULT_ENGINE.id);
  expect(settings.keyboardShortcuts).toBe(true);
  expect(createContext(settings.language, settings.units, DEFAULT_ENGINE).t('app.title')).toBeTruthy();
});

test('stored custom units and known settings survive validation', () => {
  const settings = loadSettings(storage({ language: 'de', unitSystem: 'metric', units: { length: 'in', temperature: 'unknown', fake: 'unit' },
    foldedGroups: ['group.barrel', null, 7], keyboardShortcuts: 'true' }), ['en']);
  expect(settings.language).toBe('de');
  expect(settings.units.length).toBe('in');
  expect(settings.units.temperature).toBeUndefined();
  expect(settings.units).not.toHaveProperty('fake');
  expect(settings.foldedGroups).toEqual(['group.barrel']);
  expect(settings.keyboardShortcuts).toBe(false);
});

test('non-object preferences and denied storage use browser-language defaults', () => {
  for (const value of [null, [], 'bad', 17]) expect(loadSettings(storage(value), ['it']).language).toBe('it');
  const denied = { getItem: () => { throw new DOMException('Denied', 'SecurityError'); } } as unknown as Storage;
  expect(loadSettings(denied, ['it']).language).toBe('it');
});
