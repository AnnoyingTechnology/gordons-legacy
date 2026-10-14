import { execSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { defineConfig } from 'vite';
import { offline } from './build/offline.ts';
import { standalone } from './build/standalone.ts';

function commit(): string {
  try {
    return execSync('git rev-parse HEAD', { encoding: 'utf8' }).trim();
  } catch {
    return 'unknown';
  }
}

// The milestone of the handoff record: the lead of its bullet, up to the first colon ("M2 done, M3 in progress").
function milestone(): string {
  const progress = readFileSync(new URL('../../docs/PROGRESS.md', import.meta.url), 'utf8');
  const bullet = /^- \*\*Milestone:\*\* ([^:\n]+)/m.exec(progress)?.[1] ?? 'unknown';
  return bullet.replace(/[*`]/g, '').trim();
}

export default defineConfig({
  base: './',
  plugins: [standalone(), offline()],
  define: {
    __BUILD_COMMIT__: JSON.stringify(commit()),
    __BUILD_DATE__: JSON.stringify(new Date().toISOString().slice(0, 16).replace('T', ' ') + ' UTC'),
    __MILESTONE__: JSON.stringify(milestone()),
  },
});
