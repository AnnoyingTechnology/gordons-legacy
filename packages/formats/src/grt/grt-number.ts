/** A decimal number as GRT writes it: a dot as separator, optional exponent, no thousands separators. */
// The fraction only after a point: `\d+\.?\d*` let two digit runs share a long number, and rejecting
// thirty thousand digits took a second (quadratic backtracking, #32).
const GRT_NUMBER = /^[-+]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][-+]?\d+)?$/;

/** Parses a GRT number, or returns undefined when the text isn't one or overflows (`1e309`). */
export function parseGrtNumber(text: string): number | undefined {
  const trimmed = text.trim();
  if (!GRT_NUMBER.test(trimmed)) return undefined;
  const value = Number(trimmed);
  return Number.isFinite(value) ? value : undefined;
}
