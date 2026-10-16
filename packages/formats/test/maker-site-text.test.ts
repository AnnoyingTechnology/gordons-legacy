import { describe, expect, it } from 'vitest';
import { decodeEntities, plainText } from '../../../tools/data/firearms/maker-site.ts';

/**
 * The text every maker's extractor reads its figures out of (tools/data/firearms/maker-site.ts, issue
 * #30). The strings below are the shapes the makers' own pages wrote: Bergara prints `6.5&#215;55 SE`,
 * Henry prints `Glock &reg; Mag Well`, and both reached the published corpus undecoded once — a
 * cartridge spelled with an entity matches no load, so this is the reading, not the typesetting.
 */
describe('a maker page as text', () => {
  it('decodes a numeric reference from its code point, in either notation', () => {
    expect(decodeEntities('6.5&#215;55 SE')).toBe('6.5×55 SE');
    expect(decodeEntities('1:10&#8221;')).toBe('1:10”');
    expect(decodeEntities('&#x27;')).toBe("'");
    expect(decodeEntities('&#X2033;')).toBe('″');
  });

  it('decodes the named entities the makers write', () => {
    expect(decodeEntities('Glock &reg; Mag Well')).toBe('Glock ® Mag Well');
    expect(decodeEntities('S&amp;W M&amp;P')).toBe('S&W M&P');
    expect(decodeEntities('M-LOK&trade; 20&deg;')).toBe('M-LOK™ 20°');
    expect(decodeEntities('&ldquo;long&rdquo; &ndash; or not')).toBe('“long” – or not');
  });

  it('decodes a reference once, so a page writing one as text keeps it', () => {
    // `&amp;#215;` displays the five characters `&#215;`; a second pass would read a multiplication sign.
    expect(decodeEntities('&amp;#215;')).toBe('&#215;');
  });

  it('leaves what it cannot read as it stands, instead of dropping it', () => {
    expect(decodeEntities('&notanentity; &#0; &#1114112;')).toBe('&notanentity; &#0; &#1114112;');
    expect(decodeEntities('50% & 1 < 2')).toBe('50% & 1 < 2');
  });

  it('reads a figure out of markup: tags out, one space, no typesetting left', () => {
    expect(plainText('<span>WEIGHT</span>&nbsp;&nbsp;29 oz<br />')).toBe('WEIGHT 29 oz');
    expect(plainText('  <td>1:9,5&#8221;</td>  ')).toBe('1:9,5"');
    expect(plainText('<p>24&#8243; barrel</p>')).toBe('24" barrel');
  });

  it('settles the two spellings a cartridge is compared by', () => {
    // The calibre database writes `5.45 x 39`: a gun whose cartridge reads `8×57` would match no load.
    expect(plainText('8&#215;57 JRS')).toBe('8x57 JRS');
    expect(plainText('6.5&#215;55 SE')).toBe('6.5x55 SE');
  });

  it('drops the marks a maker prints, which are not part of a gun&apos;s identity', () => {
    // The same maker writes both, and two names would put one gun in the corpus twice.
    expect(plainText('Henry H27 Homesteader M-LOK&reg; Carbine')).toBe('Henry H27 Homesteader M-LOK Carbine');
    expect(plainText('GLOCK&reg; 19 Gen5')).toBe('GLOCK 19 Gen5');
    expect(plainText('Ruger<sup>&reg;</sup> American<sup>&reg;</sup>')).toBe('Ruger American');
  });
});
