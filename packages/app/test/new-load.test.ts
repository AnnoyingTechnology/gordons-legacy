import { FIREARM_FORMAT, FIREARM_SCHEMA_VERSION, type Firearm } from '@gordons-legacy/formats';
import { describe, expect, it } from 'vitest';
import { communityComponents } from '../src/state/components.ts';
import { DocumentStore } from '../src/state/documents.ts';
import { exampleLoad } from '../src/state/example-load.ts';
import { cloneSources } from '../src/state/load-copy.ts';
import { caliberValues, createLoad, type NewLoadValues } from '../src/state/new-load.ts';
import { loadSettings } from '../src/state/settings.ts';

const fixture = exampleLoad({ title: 'Fixture', note: '' })!;
const caliber = communityComponents().find((entry) => entry.kind === 'caliber')!;
if (caliber.kind !== 'caliber') throw new Error('Missing caliber fixture');
const definition = caliber.value;
const values: NewLoadValues = {
  caseCapacity: fixture.cartridge.caseCapacity, caseLength: fixture.cartridge.caseLength,
  overallLength: fixture.cartridge.overallLength, grooveDiameter: fixture.cartridge.grooveDiameter,
  effectiveBoreArea: fixture.cartridge.effectiveBoreArea, maxPressure: fixture.cartridge.maxPressure,
  sebertFactor: fixture.cartridge.sebertFactor, barrelLength: fixture.barrel.length,
  shotStartPressure: fixture.projectile.shotStartPressure, chargeMass: fixture.charge.mass,
  temperature: fixture.charge.temperature,
};

describe('new document creation', () => {
  it('uses the selected catalogue capacity without treating maximum overall length as a load setting', () => {
    const selected = { ...definition, typicalCaseCapacity: 2e-6 };
    expect(caliberValues(selected).caseCapacity).toBe(selected.typicalCaseCapacity);
    expect(caliberValues(selected).overallLength).toBeUndefined();
    expect(caliberValues(selected).chargeMass).toBeUndefined();
    expect(caliberValues(selected).temperature).toBeUndefined();
    const { typicalCaseCapacity: _missing, ...withoutCapacity } = selected;
    expect(caliberValues(withoutCapacity).caseCapacity).toBeUndefined();
  });
  it('accepts a named cartridge without inventing a detailed specification', () => {
    const result = createLoad('From gun', '9x19 mm', fixture.projectile, fixture.propellant, values);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.cartridge.name).toBe('9x19 mm');
    expect(result.value.cartridge.definition).toBeUndefined();
    expect(createLoad('From gun', '9x19 mm', fixture.projectile, fixture.propellant, {}).ok).toBe(false);
  });
  it('requires the missing inputs instead of filling them from an example', () => {
    const result = createLoad('New', definition, fixture.projectile, fixture.propellant, {});
    expect(result.ok).toBe(false);
    const complete = createLoad(' New ', definition, fixture.projectile, fixture.propellant, values);
    expect(complete.ok).toBe(true);
    if (!complete.ok) return;
    expect(complete.value.title).toBe('New');
    expect(complete.value.cartridge.name).toBe(definition.name);
    expect(complete.value.cartridge.pressureMeasurementMethod).toBe('');
    expect(complete.value.barrel.name).toBe('');
    expect(complete.value.measurements).toEqual([]);
    expect(complete.value.notes).toEqual([]);
    expect(complete.value.importedFrom).toBeUndefined();
  });

  it('keeps the selected gun details, with the explicitly entered barrel length', () => {
    const firearm: Firearm = { format: FIREARM_FORMAT, schemaVersion: FIREARM_SCHEMA_VERSION, name: 'Chosen gun', barrel: fixture.barrel };
    const result = createLoad('New', definition, fixture.projectile, fixture.propellant, values, firearm);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.barrel).toEqual({ ...fixture.barrel, name: firearm.name, length: values.barrelLength });
    result.value.barrel.gasLeaks.push({ type: 0, name: 'Test', description: '', position: 0, width: 0, height: 0 });
    expect(firearm.barrel.gasLeaks).toEqual(fixture.barrel.gasLeaks);
    expect(result.value.barrel.gasLeaks).not.toEqual(firearm.barrel.gasLeaks);
  });

  it('offers open edits once, plus saved loads that are not already open', () => {
    const store = new DocumentStore();
    store.openSaved('Open.json', fixture, 'saved-open');
    store.rename(store.active!.id, 'Edited title');
    const library = [
      { id: 'saved-open', name: 'Old title', load: fixture, updatedAt: '' },
      { id: 'saved-closed', name: 'Closed', load: fixture, updatedAt: '' },
    ];
    const sources = cloneSources(store.documents, library);
    expect(sources.map(({ name, origin }) => ({ name, origin }))).toEqual([
      { name: 'Edited title', origin: 'open' }, { name: 'Closed', origin: 'library' },
    ]);
    expect(sources[0]!.load.title).toBe('Edited title');
  });
});

describe('shortcut preference', () => {
  it('requires an explicit boolean opt-in and defaults to disabled', () => {
    const storage = (value: unknown): Storage => ({ getItem: () => JSON.stringify({ keyboardShortcuts: value }),
      length: 1, key: () => null, clear: () => {}, removeItem: () => {}, setItem: () => {} });
    expect(loadSettings(storage(undefined), ['en']).keyboardShortcuts).toBe(false);
    expect(loadSettings(storage('true'), ['en']).keyboardShortcuts).toBe(false);
    expect(loadSettings(storage(true), ['en']).keyboardShortcuts).toBe(true);
  });
});
