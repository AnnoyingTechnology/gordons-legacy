import { grtTraditional } from '@gordons-legacy/engine';
import { describe, expect, it } from 'vitest';
import { exampleLoad } from '../src/state/example-load.ts';

/**
 * The load a first visitor sees. It is built from the community corpus by name, so a renamed file would
 * leave the application empty on a first visit; these tests say so instead.
 */
describe('the example load', () => {
  const text = { title: 'Example load', note: 'An example.' };

  it('is built from the bundled community components', () => {
    const load = exampleLoad(text);
    expect(load).toBeDefined();
    expect(load!.cartridge.name).toContain('.308 Win');
    expect(load!.projectile.product).toBe('Bondstrike');
    expect(load!.propellant.product).toBe('StaBALL Match');
    expect(load!.notes[0]?.text).toBe(text.note);
  });

  it('simulates, well under the cartridge maximum', () => {
    const load = exampleLoad(text)!;
    const result = grtTraditional.simulate(load);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    // Not a statement that the charge is safe: only that the example shows an unremarkable simulation.
    expect(result.simulation.maxPressure).toBeLessThan(load.cartridge.maxPressure * 0.9);
    expect(result.simulation.muzzleVelocity).toBeGreaterThan(300);
  });

  it('is nothing without its components', () => {
    expect(exampleLoad(text, [])).toBeUndefined();
  });
});
