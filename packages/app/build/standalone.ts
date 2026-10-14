import type { Plugin, Rolldown } from 'vite';

/** Name of the single-file copy, next to index.html in the build. */
export const STANDALONE_FILE = 'gordons-legacy.html';

/**
 * Vite plugin that also writes the whole application as one HTML file, with its script and styles
 * inlined, for users who want their own copy: it runs from disk with no server and no install.
 */
export function standalone(): Plugin {
  return {
    name: 'gordons-legacy-standalone',
    apply: 'build',
    // After Vite's own plugins, so that index.html is in the bundle.
    enforce: 'post',
    generateBundle(_options, bundle) {
      const page = bundle['index.html'] as Rolldown.OutputAsset | undefined;
      if (!page) return;
      let html = String(page.source);
      for (const output of Object.values(bundle)) {
        if (output.type === 'chunk' && output.isEntry) {
          html = html.replace(
            new RegExp(`<script type="module" crossorigin src="\\./${escape(output.fileName)}"></script>`),
            () => `<script type="module">${inlineScript(output)}</script>`,
          );
        } else if (output.type === 'asset' && output.fileName.endsWith('.css')) {
          html = html.replace(
            new RegExp(`<link rel="stylesheet" crossorigin href="\\./${escape(output.fileName)}">`),
            () => `<style>${String(output.source)}</style>`,
          );
        }
      }
      // A copy on disk has no manifest to install, and its icon would point to a missing file.
      html = html.replace(/\s*<link rel="(icon|manifest)"[^>]*>/g, '');
      this.emitFile({ type: 'asset', fileName: STANDALONE_FILE, source: html });
    },
  };
}

/** The chunk's code, safe inside a `<script>` element. */
function inlineScript(chunk: Rolldown.OutputChunk): string {
  return chunk.code.replace(/<\/script/gi, '<\\/script');
}

function escape(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
