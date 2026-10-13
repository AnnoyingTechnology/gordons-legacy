import { createHash } from 'node:crypto';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import type { Plugin } from 'vite';

const TEMPLATE = new URL('../offline/service-worker.js', import.meta.url);

/**
 * Vite plugin that emits `service-worker.js`, which keeps a copy of the built application for offline
 * use. The worker's file list is every file of the build, plus the files of `public/`.
 */
export function offline(): Plugin {
  let publicDir = '';
  return {
    name: 'gordons-legacy-offline',
    apply: 'build',
    // After Vite's own plugins, so that index.html is in the bundle.
    enforce: 'post',
    configResolved(config) {
      publicDir = config.publicDir;
    },
    generateBundle(_options, bundle) {
      // Contents by file name, to name the cache after them: any change makes a new copy.
      const contents = new Map<string, string | Uint8Array>();
      for (const [name, output] of Object.entries(bundle)) {
        if (!name.endsWith('.map')) contents.set(name, output.type === 'chunk' ? output.code : output.source);
      }
      for (const name of publicDir ? readdirSync(publicDir, { recursive: true, encoding: 'utf8' }) : []) {
        const path = join(publicDir, name);
        if (statSync(path).isFile()) contents.set(name, readFileSync(path));
      }
      const files = [...contents.keys()].sort();
      const hash = createHash('sha256');
      for (const name of files) hash.update(name).update(contents.get(name)!);
      const cacheName = `gordons-legacy-${hash.digest('hex').slice(0, 12)}`;
      const source = readFileSync(TEMPLATE, 'utf8')
        .replace("'__CACHE_NAME__'", JSON.stringify(cacheName))
        .replace('__FILES__', JSON.stringify(['./', ...files.map((name) => `./${name}`)], null, 2));
      this.emitFile({ type: 'asset', fileName: 'service-worker.js', source });
    },
  };
}
