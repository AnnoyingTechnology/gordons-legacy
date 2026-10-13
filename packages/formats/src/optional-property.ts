/**
 * Returns `{ [key]: value }`, or `{}` when the value is undefined, so that optional properties can be
 * spread into an object literal without writing `key: undefined`:
 *
 *     const projectile = { name, ...optionalProperty('material', material) };
 */
export function optionalProperty<Key extends string, Value>(
  key: Key,
  value: Value | undefined,
): { [K in Key]?: Value } {
  return (value === undefined ? {} : { [key]: value }) as { [K in Key]?: Value };
}
