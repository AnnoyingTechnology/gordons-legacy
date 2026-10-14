import { describe, expect, it } from 'vitest';
import { ICONS, type IconName } from '../src/icons/icons.ts';

describe('icons', () => {
  const names = Object.keys(ICONS) as IconName[];

  it('defines 33 icons', () => {
    expect(names).toHaveLength(33);
  });

  it.each(names)('%s has markup and no hard-coded colour', (name) => {
    const markup = ICONS[name].strings.join('');
    expect(markup).toMatch(/<(path|circle|rect|ellipse|line)/);
    expect(markup).not.toMatch(/(fill|stroke)="#/);
  });
});
