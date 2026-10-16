/**
 * Whether a caliber a maker printed is one cartridge a reloader can load for (issue #30,
 * docs/firearm-data.md). One module, because there is one answer: every extractor and the corpus
 * checker ask this question, and on 2026-10-16 sixteen of them answered it sixteen different ways —
 * one knew that Browning writes `22 S L LR`, another that Glock prints `Training ammunition`, and a
 * rimfire slipped into the corpus through whichever one had not been told.
 *
 * The question matters because of what the application does with a gun: it offers it as something to
 * build a load for. A rimfire, a shotgun gauge, an air rifle or a marking round is a gun nobody
 * handloads, and a cell that names two cartridges at once (`.45 Colt/.45 ACP`) does not say which of
 * them the barrel and the weight beside it belong to.
 *
 * Every pattern here is a spelling a maker's page actually uses; the comment on each says whose.
 */

/**
 * Cartridges a reloader does not load, in the spellings the makers print.
 *
 * A pattern must not catch a centrefire name that only looks like one: `.22 Hornet`, `.22 Nosler`,
 * `.22-250 Rem`, `.220 Swift`, `.223 Rem`, `.17 Remington` and `.17 Hornet` are all handloaded, which
 * is why each rimfire pattern names the rimfire's own words rather than the calibre alone.
 */
const UNLOADABLE = [
  // .22 rimfire. `22 S L LR` (short, long and long rifle) is Browning's, `22 S/L/LR` Henry's,
  // `22 Magnum Rimfire` Smith & Wesson's, `.22 l.r.` Pedersoli's.
  /\b\.?22\s*(s\s*l\s*lr|s\/l\/lr|s\/l|s\b|lr|l\.r\.|l\b|long\s*rifle|long|short|wmrf?|wrf|win\.?\s*mag\w*|magnum|mag\b|rimfire|bb|cb)\b/i,
  // .17 rimfire: HMR, Mach 2 (which Browning prints `17 M 2`) and the .17 Winchester Super Magnum.
  /\b\.?17\s*(hmr|hm2|m\s*2|mach\s*2|wsm|rimfire)\b/i,
  // The two other rimfires still sold: Winchester's .21 Sharp (2024) and the 5 mm Remington Magnum.
  /\b\.?21\s*sharp\b/i,
  /\b5\s*mm\s*(rem(ington)?\s*)?(rimfire|magnum)\b/i,
  // A shotgun fires shot, not the single projectile the engine models. `12/76` is Sabatti's spelling
  // of a 12 gauge with a 76 mm chamber, and `gaugé` a French page's.
  /\b(4|8|10|12|16|20|24|28|32|36)\s*(ga|gauge|gaugé|bore)\b/i,
  /\b(12|16|20|24|28|32|36)\s*\/\s*(65|70|76|89)\b/,
  /\b\.?410\b/i,
  // Air guns, and the Flobert cartridge CZ lists for its parlour rifles.
  /airgun|air\s*(gun|rifle|pistol)|\b177\b|\b4[.,]5\s*mm\b|pellet|\bbb\b|flobert/i,
  // Rounds that are not a load: blanks, and the police training and marking rounds Glock, Ruger and
  // Smith & Wesson list beside their service pistols (`FX`, `UTM`, `Simunition`, German `Farbmunition`).
  /\bblank|training|marking|simunition|farbmunition|\bfx\b|\butm\b/i,
];

/**
 * What separates two cartridge names in one cell: a slash, a comma, a semicolon, or the maker's own
 * word. `300 H&H Mag`, `.45 S&W` and `.45-70 Gov't` are one name each, so an ampersand or a hyphen
 * inside a name does not separate; a comma between two figures is the decimal comma of a metric page
 * (`6,5 Creedmoor`, `7,62 x 39`), so only a comma with a space or a letter beside it does.
 */
const SEPARATOR = /\s*(?:\/|;|(?<![0-9]),|,(?![0-9])|\sor\s|\sand\s|\s&\s|\s\+\s)\s*/i;

/** `.45/70` and `.44/40` are one cartridge written the old way, not two (uberti.ts, henry.ts). */
const OLD_SPELLING = /^\.?[0-9]{2,3}\s*\/\s*[0-9]{2,3}$/;

/** The cartridge names a caliber cell holds, in the order the maker printed them. */
export function cartridgeNames(caliber: string): string[] {
  const cell = caliber.trim();
  if (OLD_SPELLING.test(cell)) return [cell];
  return cell.split(SEPARATOR).filter((name) => name !== '');
}

/**
 * The bore a cartridge's name gives, in metres, or nothing when it names none. Nominal and not a
 * measurement: it is only ever compared with another name's, to tell one barrel from two.
 *
 * The makers write a bore three ways, and which one it is can be read off the figure: a `mm` says
 * millimetres whatever the figure (`10mm Auto`, `9 mm`), a leading dot or three digits are thousandths
 * of an inch (`.308`, `223`), two digits are hundredths (`45 Colt`), and a bare figure under twenty is
 * millimetres (`6.5 Creedmoor`, `7,62x39`).
 */
function boreOf(name: string): number | undefined {
  const match = /^\s*(\.)?([0-9]+(?:[.,][0-9]+)?)\s*(mm)?/.exec(name);
  if (!match) return undefined;
  const figure = Number(match[2]!.replace(',', '.'));
  const whole = match[2]!.replace(/[.,].*/, '');
  if (match[3] !== undefined) return figure / 1000;
  if (match[1] !== undefined || whole.length === 3) return (figure / (whole.length === 3 ? 1000 : 100)) * 0.0254;
  if (whole.length === 2 && !/[.,]/.test(match[2]!)) return (figure / 100) * 0.0254;
  return figure <= 20 ? figure / 1000 : undefined;
}

/** How far two names of one bore may differ: `.357 Magnum` and `.38 Spl` are the same hole, 6% apart. */
const SAME_BORE = 0.08;

/**
 * Whether a cell names cartridges of more than one bore.
 *
 * One bore is one gun as far as a record goes. The three figures a record keeps — barrel length, twist
 * and mass — belong to the barrel and the gun, not to the chamber cut at the back of it, so a cell such
 * as `.357 Magnum/.38 Spl`, `.223 Rem/5.56 NATO` or `45 Colt / 45 Auto` describes one gun whose figures
 * the page gives, and the record keeps the cell exactly as printed. The application matches a load
 * against each of the names (packages/app/src/state/firearms.ts).
 *
 * Two bores are two different guns: a model offered in `.308 Win or 6.5 Creedmoor` under one weight, or
 * `9mm/.40 S&W`. The page does not say which of them its figures belong to, so the gun is skipped
 * rather than given figures that may be the other one's.
 */
export function severalCartridges(caliber: string): boolean {
  const names = cartridgeNames(caliber);
  if (names.length <= 1) return false;
  const bores = names.map(boreOf);
  const first = bores[0];
  if (first === undefined) return true;
  return !bores.every((bore) => bore !== undefined && Math.abs(bore - first) <= SAME_BORE * first);
}

/**
 * Whether a caliber names a cartridge at all. A bare bore (`.45`, `.54`, `12`, `17,5 mm`) is what a
 * muzzle-loader's page gives (pedersoli.ts) and what a revolver sold as cap-and-ball carries
 * (uberti.ts): there is no cartridge to load. A cartridge has a word in its name (`.45 Colt`,
 * `.450 Nitro Express`) or is a pair of figures (`.45-70`, `6,5x55`, `9x19`).
 */
export function namedCartridge(caliber: string): boolean {
  const words = caliber.replace(/\bmm\b/gi, '');
  return /[A-Za-z]{3,}/.test(words) || /[0-9]\s*[-x×\/]\s*[0-9]/i.test(caliber);
}

/**
 * Whether this is one cartridge a reloader can load for. A caliber with no figure in it is not a
 * cartridge name at all (a page's `Centerfire`, an empty cell read as a label).
 */
export function loadableCartridge(caliber: string | undefined): boolean {
  if (caliber === undefined || caliber.trim() === '' || !/[0-9]/.test(caliber)) return false;
  if (UNLOADABLE.some((pattern) => pattern.test(caliber))) return false;
  return !severalCartridges(caliber);
}
