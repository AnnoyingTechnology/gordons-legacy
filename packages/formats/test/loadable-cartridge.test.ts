import { describe, expect, it } from 'vitest';
import { bareBore, loadableCartridge, namedCartridge, severalCartridges } from '../../../tools/data/firearms/loadable-cartridge.ts';

/**
 * The one rule for "is this a cartridge a reloader can load for?"
 * (tools/data/firearms/loadable-cartridge.ts, issue #30).
 *
 * Every spelling below is one a maker's page prints, and most of them were a separate rule in a
 * separate extractor until 2026-10-16. They are kept together because that is the point of the module:
 * a spelling only one extractor knew about now holds for all of them.
 */
describe('one cartridge a reloader can load for', () => {
  it('takes the centrefire cartridges the makers print, in their own spellings', () => {
    for (const cartridge of [
      '308 Win', '.308 Win.', '6.5 Creedmoor', '6,5 Creedmoor', '.223 Rem.', '223 Rem', '9mm Luger', '9MM', '9x19 mm',
      '9 × 19', '9x19', '.45 Auto', '45 Colt', '5.7x28mm', '45-70 GOVT', '.45-70', '6,5x55 SE', '6.5 PRC', '9,3x62',
      '.357 Mag', '.450 Nitro Express', '300 H&H MAG', '.30-06 Springfield', '10mm AUTO',
      // Centrefire names that only look like a rimfire's: all four are handloaded.
      '22 Hornet', '22-250 REM', '17 Hornet', '.220 Swift',
      // The old spelling of one cartridge, not two.
      '.45/70', '.44/40',
      // One chamber written two ways: the same bore, so the page's figures are that one gun's.
      '.357 Magnum/.38 Spl', '.223 Rem/5.56 NATO', '.308 Win/7.62x51 NATO', '.44 Magnum/.44 Spl',
      '.327 Fed Magnum/.32 H&R Mag', '45 Colt / 45 Auto', '357 Mag / 9mm Luger', '223 Rem/5.56mm',
      // One barrel, two cases: the barrel length, twist and mass a page prints are the same gun's.
      '308 Win / 30-06', '.40 S&W / 10mm AUTO',
    ]) {
      expect(loadableCartridge(cartridge), cartridge).toBe(true);
    }
  });

  it('refuses the rimfires, in every spelling the pages use', () => {
    for (const cartridge of [
      '22 LR', '.22 LR', '22 Long Rifle', '.22 l.r.', '.22 S/L/LR', '22 S L LR', '22 S', '22 WMR', '.22 WMR',
      '22 MAGNUM', '22 Magnum Rimfire', '.22 Win. Mag.', '22 Short', '17 HMR', '.17 HMR', '17 M 2', '17 HM2',
      '17 WSM', '.21 Sharp', '5mm Remington Magnum',
    ]) {
      expect(loadableCartridge(cartridge), cartridge).toBe(false);
    }
  });

  it('refuses what is not a single projectile, a handload or a cartridge name', () => {
    for (const cartridge of [
      '12 Gauge', '12 GAUGE', '20 ga', '.410 bore', '410', '12/76', // shot, not one projectile
      'Training ammunition', 'Training round', '9mm FX', '.223 Farbmunition (FX-Simunition)', '9mm UTM', 'AIRGUN',
      '4,5 mm', '.22 Flobert', 'Blank',
      '–', '', 'Centerfire', // no figure: not a cartridge name at all
    ]) {
      expect(loadableCartridge(cartridge), cartridge).toBe(false);
    }
    expect(loadableCartridge(undefined)).toBe(false);
  });

  it('refuses a cell that names two cartridges, because the figures beside it belong to one of them', () => {
    for (const cartridge of [
      '.308 Win / 6.5 Creedmoor', '9mm/.40 S&W', '6.5 Creedmoor, .308 Win', '410,45 COLT,45 AUTO',
      '.45 LC and .410', '.45 Colt/.410', '.223 Rem/300 BLK',
    ]) {
      expect(severalCartridges(cartridge), cartridge).toBe(true);
      expect(loadableCartridge(cartridge), cartridge).toBe(false);
    }
    // A decimal comma is not a join, and neither is the ampersand inside a cartridge's name.
    expect(severalCartridges('6,5 Creedmoor')).toBe(false);
    expect(severalCartridges('.45 S&W')).toBe(false);
    // Two names of one bore are one gun, whose barrel and weight the page gives.
    expect(severalCartridges('.357 Magnum/.38 Spl')).toBe(false);
    expect(severalCartridges('.45/70')).toBe(false);
  });

  it('tells a cartridge name from a bore, for the makers who sell both', () => {
    // Pedersoli sell muzzle-loaders, whose caliber is a bore: there is no cartridge to load for it.
    for (const bore of ['.45', '.54', '12', '17,5 mm', '.44']) expect(namedCartridge(bore), bore).toBe(false);
    for (const cartridge of ['.45 Colt', '.45-70 Gov.', '6,5x55', '9x19', '.38-55 WINCHESTER']) {
      expect(namedCartridge(cartridge), cartridge).toBe(true);
    }
    // Uberti's pages mix cartridge revolvers with cap-and-ball ones, where the bore is bare and the
    // cartridges are named in the maker's short way: both of these are guns to load for.
    for (const bore of ['.44', '.36', '12', '.45']) expect(bareBore(bore), bore).toBe(true);
    for (const cartridge of ['.45 LC', '9 mm', '.357 Mag', '.45/70']) expect(bareBore(cartridge), cartridge).toBe(false);
  });
});
