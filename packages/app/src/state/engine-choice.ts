import { grtTraditional, researchEngine, type Engine } from '@gordons-legacy/engine';

/**
 * Which interior-ballistics engine computes the numbers the user sees (docs/model/research-engine.md).
 *
 * The engines are interchangeable — a load in, a simulated shot out — so the choice is a setting, kept
 * with the other settings and applied to every view at once: a figure in the editor, the review, the
 * comparison and the printed report all come from the same engine, never a mixture.
 *
 * None of the engines' pressures has been validated against measured firings beyond the four rounds of
 * docs/model/validation.md, where both read under the measured peak. Changing the engine changes the
 * numbers; it does not make any of them a safe charge.
 */
export const ENGINES: readonly Engine[] = [grtTraditional, researchEngine];

/** The engine a new installation uses: GRT Traditional, the one the imported loads were made with. */
export const DEFAULT_ENGINE = grtTraditional;

/** The engine with this id, or the default one when the id is unknown — a setting can outlive an engine. */
export function engineById(id: string): Engine {
  return ENGINES.find((engine) => engine.id === id) ?? DEFAULT_ENGINE;
}

/**
 * Whether the engine is a research one, whose results carry a warning in the interface. R1 exists to try
 * ideas GRT's model doesn't have; it is not a better engine, and against the measured rounds we have it
 * reads further under the peak than GRT Traditional does.
 */
export function isResearchEngine(engine: Engine): boolean {
  return engine.id !== grtTraditional.id;
}
