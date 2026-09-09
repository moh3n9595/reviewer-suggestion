import { resolve } from 'node:path';
import { codecovVitePlugin } from '@codecov/vite-plugin';
import { defineConfig } from 'vite';

const analyzeBundle = process.env.CODECOV_BUNDLE_ANALYSIS === 'true';

export default defineConfig({
  plugins: [
    codecovVitePlugin({
      enableBundleAnalysis: analyzeBundle,
      bundleName: 'reviewer-suggestion-action',
      gitService: 'github',
      oidc: { useGitHubOIDC: true },
    }),
  ],
  build: {
    target: 'node24',
    outDir: 'action-dist',
    emptyOutDir: true,
    minify: false,
    sourcemap: false,
    lib: {
      entry: resolve(import.meta.dirname, 'src/action-entry.ts'),
      formats: ['es'],
      fileName: () => 'index.mjs',
    },
    rollupOptions: {
      external: [/^node:/],
    },
  },
});
