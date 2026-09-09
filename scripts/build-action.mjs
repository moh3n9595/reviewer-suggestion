import { build } from 'esbuild';
await build({
  entryPoints: ['src/action-entry.ts'],
  outfile: 'action-dist/index.mjs',
  bundle: true,
  platform: 'node',
  target: 'node24',
  format: 'esm',
  legalComments: 'eof',
});
