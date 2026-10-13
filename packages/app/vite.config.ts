import { execSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { defineConfig } from 'vite';

function commit(): string {
  try {
    return execSync('git rev-parse HEAD', { encoding: 'utf8' }).trim();
  } catch {
    return 'unknown';
  }
}

// The milestone line of the handoff record, without its Markdown markup.
function milestone(): string {
  const progress = readFileSync(new URL('../../docs/PROGRESS.md', import.meta.url), 'utf8');
  const line = /^- \*\*Milestone:\*\* (.+)$/m.exec(progress)?.[1] ?? 'unknown';
  return line.replace(/[*`]/g, '');
}

export default defineConfig({
  base: './',
  define: {
    __BUILD_COMMIT__: JSON.stringify(commit()),
    __BUILD_DATE__: JSON.stringify(new Date().toISOString().slice(0, 16).replace('T', ' ') + ' UTC'),
    __MILESTONE__: JSON.stringify(milestone()),
  },
});
