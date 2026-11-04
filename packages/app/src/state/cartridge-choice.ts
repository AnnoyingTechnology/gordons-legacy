import type { ComponentEntry } from './components.ts';
import type { CloneSource } from './load-copy.ts';

type CaliberEntry = Extract<ComponentEntry, { kind: 'caliber' }>;

/** Existing loads can supply definitions missing from the community component snapshot. */
export function calibersFromLoads(sources: readonly CloneSource[]): CaliberEntry[] {
  return sources.flatMap((source) => source.load.cartridge.definition ? [{
    id: `load-caliber:${source.id}`, kind: 'caliber' as const, value: source.load.cartridge.definition,
    source: { origin: 'user' as const, file: source.name, author: source.name, date: '' },
  }] : []);
}

/** Exact names and explicit synonyms only: a bare calibre must not pick a different cartridge. */
function identity(name: string): string {
  const normalize = (value: string) => value.toLowerCase().replace(/×/g, 'x').replace(/[^a-z0-9+]/g, '');
  const normalized = normalize(name);
  const aliases: Record<string, string> = {
    '9x19mm': '9x19', '9mmluger': '9x19', '9luger': '9x19',
    '9mmparabellum': '9x19', '9parabellum': '9x19', '9mmpara': '9x19',
    '308winchester': '308win',
    // Makers' spellings of the cartridges GRT's catalogue defines (#19), each to a name or an
    // alternative name GRT gives. 5.56 NATO is an alternative name of GRT's (CIP's) .223 Rem.
    // Left out on purpose: `.300 WIN` (Magnum or Short Magnum?) and a bare `9mm`.
    '3006sprg': '3006springfield',
    '380auto': '380acp',
    '556nato': '556x45nato', '556mmnato': '556x45nato', '556x45mm': '556x45nato', '556x45mmnato': '556x45nato',
    '556nato223rem': '556x45nato',
    '4570gov': '4570govt',
    '240wbymag': '240weathmag', '257wbymag': '257weathmag', '300wbymag': '300weathmag',
    '350lgnd': '350legend',
    '6creedmoor': '6mmcreedmoor',
    '65crdmr': '65creedmoor',
    '44magnum': '44remmag',
  };
  // Parenthesized synonyms appear in imported GRT names; an explicit +P suffix stays distinct.
  if (normalized.includes('+p')) return normalized;
  return aliases[normalized] ?? aliases[normalize(name.split('(')[0]!)] ?? normalized;
}

/**
 * The order in which definitions of one cartridge are preferred: the user's own, then GRT's (the CIP and
 * SAAMI tables, which most of GRT's are drawn from), then the community's.
 */
const ORIGIN_PREFERENCE = ['user', 'grt', 'community'] as const;

/** Catalogued alternative names connect a gun's cartridge to case-specific definitions. */
export function caliberChoices(cartridge: string, entries: readonly ComponentEntry[]): CaliberEntry[] {
  if (!cartridge.trim()) return [];
  const wanted = identity(cartridge);
  const matches = entries.filter((entry): entry is CaliberEntry => {
    if (entry.kind !== 'caliber') return false;
    // A +P definition cannot become an ordinary cartridge through an unqualified alternate name.
    if (identity(entry.value.name).includes('+p') !== wanted.includes('+p')) return false;
    return [entry.value.name, ...entry.value.alternativeNames.split(/[,;]/)]
      .some((name) => identity(name) === wanted);
  });
  const distinct = new Map<string, CaliberEntry>();
  for (const entry of matches) {
    const key = JSON.stringify(entry.value);
    // Of identical definitions, the one of the most trusted origin is the one offered.
    const kept = distinct.get(key);
    if (!kept || ORIGIN_PREFERENCE.indexOf(entry.source.origin) < ORIGIN_PREFERENCE.indexOf(kept.source.origin)) distinct.set(key, entry);
  }
  return [...distinct.values()];
}

/** Prefer the most trusted origin's exact definition; conflicting matches leave the gun's named cartridge selected. */
export function matchingCaliber(cartridge: string, entries: readonly ComponentEntry[]): CaliberEntry | undefined {
  const matches = caliberChoices(cartridge, entries);
  const origin = ORIGIN_PREFERENCE.find((candidate) => matches.some((entry) => entry.source.origin === candidate));
  const candidates = matches.filter((entry) => entry.source.origin === origin);
  const distinct = new Map(candidates.map((entry) => [JSON.stringify(entry.value), entry]));
  return distinct.size === 1 ? distinct.values().next().value : undefined;
}
