/** A decimal number as GRT writes it: a dot as separator, optional exponent, no thousands separators. */
const GRT_NUMBER = /^[-+]?(\d+\.?\d*|\.\d+)([eE][-+]?\d+)?$/;

/** Parses a GRT number, or returns undefined when the text isn't one. */
export function parseGrtNumber(text: string): number | undefined {
  const trimmed = text.trim();
  return GRT_NUMBER.test(trimmed) ? Number(trimmed) : undefined;
}
