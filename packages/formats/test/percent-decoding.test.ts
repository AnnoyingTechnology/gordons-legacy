import { expect, test } from 'vitest';
import { decodeGrtString } from '../src/grt/percent-decoding.ts';

test('decodes percent escapes as UTF-8', () => {
  expect(decodeGrtString('HP%2FXTP%2032050')).toBe('HP/XTP 32050');
  expect(decodeGrtString('Est-ce%20vraiment%200.17%3F%21')).toBe('Est-ce vraiment 0.17?!');
  expect(decodeGrtString('Kal%C3%A9')).toBe('Kalé');
  expect(decodeGrtString('line%0D%0Anext')).toBe('line\r\nnext');
});

test('falls back to Latin-1 when the bytes are not valid UTF-8', () => {
  expect(decodeGrtString('Kal%E9')).toBe('Kalé');
});

test('keeps a replacement character that GRT itself stored', () => {
  expect(decodeGrtString('Environ%2020%EF%BF%BDC')).toBe('Environ 20\uFFFDC');
});

test('returns strings without escapes unchanged', () => {
  expect(decodeGrtString('Hornady')).toBe('Hornady');
  expect(decodeGrtString('')).toBe('');
});

test('keeps a stray percent sign literally', () => {
  expect(decodeGrtString('100%')).toBe('100%');
  expect(decodeGrtString('5%%20off')).toBe('5% off');
});
