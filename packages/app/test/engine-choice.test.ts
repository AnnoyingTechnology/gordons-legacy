import { grtTraditional, researchEngine } from '@gordons-legacy/engine';
import { importGrtLoad, type Load } from '@gordons-legacy/formats';
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { DEFAULT_ENGINE, ENGINES, engineById, isResearchEngine } from '../src/state/engine-choice.ts';
import { loadSettings } from '../src/state/settings.ts';

/**
 * Choosing the engine that computes every figure (state/engine-choice.ts). The choice is a setting, so
 * what matters here is that an unknown or missing one always lands on GRT Traditional.
 */

const load: Load = (() => {
  const result = importGrtLoad(
    readFileSync(new URL('../../formats/test/fixtures/cc0/loads/327_Federal_Magnum_by_dpeppe01_2022.12.12.grtload', import.meta.url), 'utf8'),
  );
  if (!result.ok) throw new Error('fixture');
  return result.value;
})();

/** A settings store in memory, as a browser's localStorage behaves for the values the app keeps. */
function storageWith(saved: Record<string, unknown>): Storage {
  const text = JSON.stringify(saved);
  return { getItem: () => text, setItem: () => undefined } as unknown as Storage;
}

describe('choosing the engine', () => {
  it('offers the engines by their own id and name', () => {
    expect(ENGINES.map((engine) => engine.id)).toEqual(['grt-traditional', 'research-1']);
    // The name is shown as it is, so an engine says in the list itself that it is not validated.
    expect(researchEngine.name).toMatch(/not validated/i);
  });

  it('falls back to GRT Traditional when the setting names an engine that no longer exists', () => {
    expect(engineById('grt-traditional')).toBe(grtTraditional);
    expect(engineById('research-1')).toBe(researchEngine);
    expect(engineById('research-7')).toBe(DEFAULT_ENGINE);
    expect(DEFAULT_ENGINE).toBe(grtTraditional);
  });

  it('starts an older installation, whose settings predate the choice, on GRT Traditional', () => {
    const settings = loadSettings(storageWith({ language: 'en', unitSystem: 'metric' }), ['en']);
    expect(engineById(settings.engine)).toBe(grtTraditional);
  });

  it('keeps the engine the user chose', () => {
    const settings = loadSettings(storageWith({ engine: 'research-1' }), ['en']);
    expect(engineById(settings.engine)).toBe(researchEngine);
  });

  it('warns about every engine but the one GRT\'s loads were made with', () => {
    expect(isResearchEngine(grtTraditional)).toBe(false);
    expect(isResearchEngine(researchEngine)).toBe(true);
  });

  it('changes the figures, which is the reason the switch exists', () => {
    const traditional = grtTraditional.simulate(load);
    const research = researchEngine.simulate(load);
    if (!traditional.ok || !research.ok) throw new Error('the fixture simulates in both engines');
    expect(research.simulation.maxPressure).not.toBeCloseTo(traditional.simulation.maxPressure, -5);
  });
});
