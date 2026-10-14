import { describe, expect, it } from 'vitest';
import { ICONS, type IconName } from '../src/icons/icons.ts';

describe('icons', () => {
  const names = Object.keys(ICONS) as IconName[];

  it('defines 38 icons', () => {
    expect(names).toHaveLength(38);
  });

  it.each(names)('%s has markup and no hard-coded colour', (name) => {
    const markup = ICONS[name].strings.join('');
    expect(markup).toMatch(/<(path|circle|rect|ellipse|line)/);
    expect(markup).not.toMatch(/(fill|stroke)="#/);
  });
});
