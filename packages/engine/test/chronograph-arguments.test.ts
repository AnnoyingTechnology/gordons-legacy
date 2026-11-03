import { describe, expect, it } from 'vitest';
import { chronographArguments } from '../../../tools/validation/chronograph.ts';
import { grtTraditional, researchEngine } from '../src/index.ts';

/**
 * The command line of the chronograph comparison (tools/validation/chronograph.ts). Every load file
 * named must be compared: a file dropped here would quietly change the velocity statistics.
 */
describe('reading the chronograph command line', () => {
  it('compares every file with GRT Traditional when no engine is named', () => {
    expect(chronographArguments(['first.grtload', 'second.grtload'])).toEqual({
      engine: grtTraditional,
      paths: ['first.grtload', 'second.grtload'],
    });
  });

  it('takes the engine named by --engine, wherever it stands, and keeps every file', () => {
    expect(chronographArguments(['--engine', 'research-1', 'first.grtload', 'second.grtload'])).toEqual({
      engine: researchEngine,
      paths: ['first.grtload', 'second.grtload'],
    });
    expect(chronographArguments(['first.grtload', '--engine', 'grt-traditional', 'second.json'])).toEqual({
      engine: grtTraditional,
      paths: ['first.grtload', 'second.json'],
    });
  });

  it('refuses an engine it does not know rather than running another one under its name', () => {
    expect(chronographArguments(['--engine', 'research-2', 'first.grtload'])).toEqual({
      problem: '--engine takes one of grt-traditional, research-1, not research-2',
    });
    expect(chronographArguments(['first.grtload', '--engine'])).toEqual({
      problem: '--engine takes one of grt-traditional, research-1, not nothing',
    });
  });
});
