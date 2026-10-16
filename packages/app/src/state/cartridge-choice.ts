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
  };
  // Parenthesized synonyms appear in imported GRT names; an explicit +P suffix stays distinct.
  if (normalized.includes('+p')) return normalized;
  return aliases[normalized] ?? aliases[normalize(name.split('(')[0]!)] ?? normalized;
}

/** Prefer a user's exact definition; conflicting matches leave the gun's named cartridge selected. */
export function matchingCaliber(cartridge: string, entries: readonly ComponentEntry[]): CaliberEntry | undefined {
  if (!cartridge.trim()) return undefined;
  const matches = entries.filter((entry): entry is CaliberEntry => entry.kind === 'caliber' && identity(entry.value.name) === identity(cartridge));
  const own = matches.filter((entry) => entry.source.origin === 'user');
  const candidates = own.length ? own : matches;
  const distinct = new Map(candidates.map((entry) => [JSON.stringify(entry.value), entry]));
  return distinct.size === 1 ? distinct.values().next().value : undefined;
}
