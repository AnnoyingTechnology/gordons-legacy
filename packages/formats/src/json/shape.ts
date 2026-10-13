import type { IssueLog } from '../import-issues.ts';

/**
 * A small declarative description of a JSON object's fields, used to validate documents read from disk.
 * Each shape mirrors a TypeScript type; `ShapeOf<T>` makes the compiler check that a shape lists exactly
 * the type's fields.
 */
export type FieldSpec =
  | 'string'
  | 'boolean'
  /** Any finite number. */
  | 'number'
  /** A finite number greater than 0. */
  | 'positive'
  /** A finite number of 0 or more. */
  | 'nonNegative'
  | 'integer'
  | { optional: FieldSpec }
  | { literal: string | number }
  | { object: Shape }
  | { arrayOf: FieldSpec }
  /** An object whose values are all strings, such as `unmapped`. */
  | 'stringRecord'
  /** Objects told apart by the value of one field, such as a projectile base's `shape`. */
  | { variants: { field: string; shapes: Record<string, Shape> } };

export type Shape = Record<string, FieldSpec>;

/** A shape that lists every field of `T`, required or optional, and no other. */
export type ShapeOf<T> = { [K in keyof Required<T>]: FieldSpec };

/**
 * Checks `value` against `spec`, logging an error for every mismatch and a warning for every unknown
 * field. Returns the value with unknown fields removed.
 */
export function checkValue(value: unknown, spec: FieldSpec, path: string, log: IssueLog): unknown {
  if (typeof spec === 'object' && 'optional' in spec) {
    return value === undefined ? undefined : checkValue(value, spec.optional, path, log);
  }
  if (value === undefined) {
    log.error('missing-field', 'Required field is missing.', path);
    return value;
  }

  if (spec === 'string') return expect(typeof value === 'string', value, 'a string', path, log);
  if (spec === 'boolean') return expect(typeof value === 'boolean', value, 'true or false', path, log);
  if (spec === 'number') return expect(isFiniteNumber(value), value, 'a number', path, log);
  if (spec === 'positive') {
    return expect(isFiniteNumber(value) && value > 0, value, 'a number greater than 0', path, log);
  }
  if (spec === 'nonNegative') {
    return expect(isFiniteNumber(value) && value >= 0, value, 'a number of 0 or more', path, log);
  }
  if (spec === 'integer') return expect(Number.isInteger(value), value, 'a whole number', path, log);
  if (spec === 'stringRecord') {
    const valid = isPlainObject(value) && Object.values(value).every((item) => typeof item === 'string');
    return expect(valid, value, 'an object of strings', path, log);
  }
  if ('literal' in spec) return expect(value === spec.literal, value, JSON.stringify(spec.literal), path, log);
  if ('arrayOf' in spec) {
    if (!Array.isArray(value)) return expect(false, value, 'a list', path, log);
    return value.map((item, index) => checkValue(item, spec.arrayOf, `${path}[${index}]`, log));
  }
  if ('object' in spec) return checkObject(value, spec.object, path, log);
  return checkVariants(value, spec.variants, path, log);
}

function checkObject(value: unknown, shape: Shape, path: string, log: IssueLog): unknown {
  if (!isPlainObject(value)) return expect(false, value, 'an object', path, log);
  const checked: Record<string, unknown> = {};
  for (const [name, spec] of Object.entries(shape)) {
    const fieldValue = checkValue(value[name], spec, join(path, name), log);
    if (fieldValue !== undefined) checked[name] = fieldValue;
  }
  for (const name of Object.keys(value)) {
    if (!(name in shape)) {
      log.warning('unknown-field', 'Unknown field, probably from a newer version; it was ignored.', join(path, name));
    }
  }
  return checked;
}

function checkVariants(
  value: unknown,
  variants: { field: string; shapes: Record<string, Shape> },
  path: string,
  log: IssueLog,
): unknown {
  if (!isPlainObject(value)) return expect(false, value, 'an object', path, log);
  const tag = value[variants.field];
  const shape = typeof tag === 'string' ? variants.shapes[tag] : undefined;
  if (shape === undefined) {
    const allowed = Object.keys(variants.shapes).map((name) => JSON.stringify(name)).join(', ');
    log.error('invalid-value', `Expected one of ${allowed}, found ${describe(tag)}.`, join(path, variants.field));
    return value;
  }
  return checkObject(value, shape, path, log);
}

function expect(valid: boolean, value: unknown, expected: string, path: string, log: IssueLog): unknown {
  if (!valid) log.error('invalid-value', `Expected ${expected}, found ${describe(value)}.`, path);
  return value;
}

function describe(value: unknown): string {
  if (value === undefined) return 'nothing';
  if (Array.isArray(value)) return 'a list';
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  return 'an object';
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function join(path: string, name: string): string {
  return path === '' ? name : `${path}.${name}`;
}
