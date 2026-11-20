import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import fs from 'fs';

const WASM_SRC = 'node_modules/sql.js/dist/sql-wasm.wasm';

/**
 * Copies the sql.js WebAssembly binary into the build output.
 *
 * The app fetches this file at runtime, so it must exist next to the built
 * assets in both development (served from node_modules) and production.
 */
function copySqlWasm() {
  return {
    name: 'copy-sql-wasm',
    apply: 'build' as const,
    buildStart() {
      this.emitFile({
        type: 'asset' as const,
        fileName: 'assets/sql-wasm.wasm',
        source: fs.readFileSync(WASM_SRC),
      });
    },
  };
}

export default defineConfig({
  // Relative paths so the built site works on GitHub Pages, in a subfolder,
  // or from any plain static file server.
  base: './',
  plugins: [react(), copySqlWasm()],
  resolve: {
    alias: { '@': path.resolve(__dirname, 'src') }
  },
  server: {
    port: 5173,
    host: true,
    // Let the dev server serve the wasm from node_modules with a binary type.
    fs: { allow: ['.'] }
  },
  build: {
    outDir: 'dist',
    chunkSizeWarningLimit: 2000
  }
});
