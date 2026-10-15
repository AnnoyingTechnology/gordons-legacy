import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { expect, test } from 'vitest';
import { en } from '../src/i18n/en.ts';

/**
 * Message families looked up with a computed key, such as `` t(`problem.${code}`) ``: their keys never
 * appear whole in the code. Each must appear in the code as such a template.
 */
const COMPUTED_FAMILIES = [
  'quantity',
  'problem',
  'warning',
  'finding',
  'finding.temperatureLimit',
  'converter',
  'sensitivity',
  'temperatureRange',
  'synthesis.none',
  'synthesis.invalid',
  'base',
  'assessment.level',
  'limit',
  'components.source',
  'boreArea',
];

function sources(folder: string): string {
  return readdirSync(folder, { recursive: true, encoding: 'utf8' })
    .filter((path) => path.endsWith('.ts') && !path.startsWith('i18n'))
    .map((path) => readFileSync(join(folder, path), 'utf8'))
    .join('\n');
}

const code = sources(new URL('../src', import.meta.url).pathname);

test('every message is used: a leftover key is one more string to translate five times', () => {
  const unused = Object.keys(en).filter((key) => {
    if (code.includes(`'${key}'`)) return false;
    const family = key.slice(0, key.lastIndexOf('.'));
    return !COMPUTED_FAMILIES.includes(family);
  });
  expect(unused).toEqual([]);
});

test('every computed family is looked up with a template in the code', () => {
  const unused = COMPUTED_FAMILIES.filter((family) => !code.includes(`${family}.\${`));
  expect(unused).toEqual([]);
});
