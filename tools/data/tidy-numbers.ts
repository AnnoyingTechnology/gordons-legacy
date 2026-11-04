/**
 * The same figure without the noise a unit conversion leaves behind: a 1:14" twist comes out of
 * `14 * 0.0254` as 0.35559999999999997 metres, which is the same length written unreadably. Ten
 * significant digits keep every figure a maker publishes — a barrel measured to the micrometre needs
 * seven — and drop the binary remainder, so the published files read as the numbers they are.
 *
 * GRT's database asks for more: a bullet of 168.5 gr is 10.918616335 g, eleven digits, so its
 * catalogue keeps twelve (tools/data/build-grt-catalogue.ts).
 */
export function tidyNumbers(value: unknown, significantDigits = 10): unknown {
  if (typeof value === 'number') return Number.isFinite(value) ? Number(value.toPrecision(significantDigits)) : value;
  if (Array.isArray(value)) return value.map((inner) => tidyNumbers(inner, significantDigits));
  if (value !== null && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).map(([key, inner]) => [key, tidyNumbers(inner, significantDigits)]));
  }
  return value;
}
