import type { DataIndex } from './repository.ts';

/** Validate the whole manifest before a synchronisation can download or remove cached files. */
export function isDataIndex(value: unknown): value is DataIndex {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false;
  const index = value as Record<string, unknown>;
  if (index['format'] !== 'gordons-legacy.data-index' || index['version'] !== 1 || !Array.isArray(index['files'])) return false;
  return index['files'].every((value: unknown) => {
    if (typeof value !== 'object' || value === null || Array.isArray(value)) return false;
    const entry = value as Record<string, unknown>;
    return typeof entry['path'] === 'string' && !entry['path'].includes('\\')
      && entry['path'].split('/').every((part) => part !== '' && part !== '.' && part !== '..')
      && typeof entry['name'] === 'string'
      && typeof entry['kind'] === 'string' && ['powder', 'projectile', 'caliber', 'firearm'].includes(entry['kind'])
      && typeof entry['sha256'] === 'string' && /^[a-f0-9]{64}$/.test(entry['sha256']);
  });
}
