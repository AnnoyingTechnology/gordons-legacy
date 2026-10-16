import { describe, expect, it } from 'vitest';
import { clashes, printedLength, printedMass, printedTwist, sitemapLocations, textLines } from '../../../tools/data/firearms/german-speaking-makers.ts';

/** The figure readers the German-speaking makers' extractors share (tools/data/firearms/german-speaking-makers.ts, issue #30). */

describe('a length as these makers print it', () => {
  it('takes the finer step of two units: 14.5 inches keeps the digit 37 cm has lost', () => {
    expect(printedLength('37 cm / 14.5"')).toBeCloseTo(0.3683, 12);
    expect(printedLength('423mm')).toBeCloseTo(0.423, 12);
    expect(printedLength('508 mm / 20"')).toBeCloseTo(0.508, 12);
  });

  it('reads a comma decimal and a dot of thousands', () => {
    expect(printedLength('31,75 cm')).toBeCloseTo(0.3175, 12);
    expect(printedLength('1.060 mm')).toBeCloseTo(1.06, 12);
  });

  it('gives nothing for a cell holding two lengths, or two units that contradict each other', () => {
    expect(printedLength('508 mm / 20" 558 mm / 22"')).toBeUndefined();
    expect(printedLength('51 cm / 18"')).toBeUndefined();
    expect(printedLength('long')).toBeUndefined();
  });
});

describe('a mass as these makers print it', () => {
  it('reads kilograms and grams, and ignores the pounds beside them', () => {
    expect(printedMass('ca. 3,1 kg')).toBeCloseTo(3.1, 12);
    expect(printedMass('approx. 3,35 kg / 7.45 lbs')).toBeCloseTo(3.35, 12);
    expect(printedMass('787 g / 27.76 oz')).toBeCloseTo(0.787, 12);
  });

  it('reads 4.350 g as four kilograms and a third, the dot being a thousands separator', () => {
    expect(printedMass('4.350 g')).toBeCloseTo(4.35, 12);
  });

  it('gives nothing for a range or a list of weights', () => {
    expect(printedMass('ca. 4,3kg - 4,6kg')).toBeUndefined();
    expect(printedMass('2,4 kg / 5,29 lbs*2,5 kg / 5,5 lbs')).toBeUndefined();
  });
});

describe('a twist as these makers print it', () => {
  it('reads inches in every form the pages use', () => {
    expect(printedTwist('1:9')).toBeCloseTo(9 * 0.0254, 12);
    expect(printedTwist('1:12,0"')).toBeCloseTo(12 * 0.0254, 12);
    expect(printedTwist('1 in 10"')).toBeCloseTo(0.254, 12);
    expect(printedTwist('1 turn right in 7,9"')).toBeCloseTo(7.9 * 0.0254, 12);
    expect(printedTwist('11,0"')).toBeCloseTo(11 * 0.0254, 12);
  });

  it('honours a metric mark and refuses what no rifle has', () => {
    expect(printedTwist('1:250 mm')).toBeCloseTo(0.25, 12);
    expect(printedTwist('1:1')).toBeUndefined();
    expect(printedTwist('1:9 | 1:12')).toBeUndefined();
    expect(printedTwist('varies')).toBeUndefined();
  });
});

describe('the small shared readers', () => {
  it('cuts markup into lines, one per block, with entities decoded', () => {
    expect(textLines('<style>p{}</style><div><p>Barrel</p><p>37&nbsp;cm / 14.5&#8243;</p></div>')).toEqual(['Barrel', '37 cm / 14.5"']);
  });

  it('lists the locations of a sitemap', () => {
    expect(sitemapLocations('<urlset><url><loc>https://example.invalid/a/</loc></url><url><loc> https://example.invalid/b/ </loc></url></urlset>')).toEqual(['https://example.invalid/a/', 'https://example.invalid/b/']);
  });

  it('finds the names that two guns share', () => {
    const found = clashes([{ name: 'A' }, { name: 'B' }, { name: 'A' }]);
    expect([...found.keys()]).toEqual(['A']);
    expect(found.get('A')).toHaveLength(2);
  });
});
