import { execFileSync } from 'node:child_process';
import {
  mkdtempSync,
  writeFileSync,
  rmSync,
  readFileSync,
  existsSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
const npmCli = [
  resolve(dirname(process.execPath), '../lib/node_modules/npm/bin/npm-cli.js'),
  resolve(dirname(process.execPath), 'node_modules/npm/bin/npm-cli.js'),
].find((path) => existsSync(path));
if (!npmCli) throw new Error('Cannot locate the npm CLI bundled with Node.js.');
const run = (command, args, options = {}) =>
  execFileSync(command, args, { encoding: 'utf8', stdio: 'pipe', ...options });
const directory = mkdtempSync(join(tmpdir(), 'reviewer-package-'));
try {
  const packed = JSON.parse(
    run(process.execPath, [
      npmCli,
      'pack',
      '--json',
      '--ignore-scripts',
      '--pack-destination',
      directory,
    ]),
  )[0];
  const files = packed.files.map((file) => file.path);
  const allowed = /^(dist\/|package\.json$|README\.md$|LICENSE$)/;
  if (files.some((path) => !allowed.test(path)))
    throw new Error(
      `Unexpected package contents: ${files.filter((path) => !allowed.test(path)).join(', ')}`,
    );
  for (const file of [
    'dist/index.js',
    'dist/index.cjs',
    'dist/index.d.ts',
    'dist/index.d.cts',
    'dist/cli.js',
    'README.md',
    'LICENSE',
  ])
    if (!files.includes(file)) throw new Error(`Missing ${file}`);
  writeFileSync(
    join(directory, 'package.json'),
    JSON.stringify({ private: true, type: 'module' }),
  );
  run(
    process.execPath,
    [
      npmCli,
      'install',
      '--omit=dev',
      '--no-audit',
      '--no-fund',
      join(directory, packed.filename),
    ],
    { cwd: directory },
  );
  for (const [file, source] of [
    [
      'esm.mjs',
      "import { rankReviewers } from 'reviewer-suggestion'; if (typeof rankReviewers !== 'function') throw Error('Missing ESM export');",
    ],
    [
      'cjs.cjs',
      "const { rankReviewers } = require('reviewer-suggestion'); if (typeof rankReviewers !== 'function') throw Error('Missing CJS export');",
    ],
    [
      'types.mts',
      "import { rankReviewers, type ReviewerSnapshot } from 'reviewer-suggestion'; declare const input: ReviewerSnapshot; rankReviewers(input, { limit: 2 });",
    ],
    [
      'types.cts',
      "import { rankReviewers, type ReviewerSnapshot } from 'reviewer-suggestion'; declare const input: ReviewerSnapshot; rankReviewers(input, { limit: 2 });",
    ],
  ])
    writeFileSync(join(directory, file), source);
  run(process.execPath, [join(directory, 'esm.mjs')]);
  run(process.execPath, [join(directory, 'cjs.cjs')]);
  const output = run(process.execPath, [
    join(directory, 'node_modules/reviewer-suggestion/dist/cli.js'),
    '--help',
  ]);
  const executableOutput = run(
    process.execPath,
    [npmCli, 'exec', '--offline', '--', 'reviewer-suggestion', '--help'],
    { cwd: directory },
  );
  if (!executableOutput.includes('suggest|assign'))
    throw new Error('Installed CLI executable failed');
  if (!output.includes('suggest|assign')) throw new Error('CLI help failed');
  run(process.execPath, [
    resolve('node_modules/typescript/bin/tsc'),
    '--noEmit',
    '--skipLibCheck',
    '--target',
    'ES2022',
    '--module',
    'NodeNext',
    '--moduleResolution',
    'NodeNext',
    join(directory, 'types.mts'),
    join(directory, 'types.cts'),
  ]);
  const manifest = JSON.parse(
    readFileSync(
      join(directory, 'node_modules/reviewer-suggestion/package.json'),
      'utf8',
    ),
  );
  if (manifest.dependencies && Object.keys(manifest.dependencies).length)
    throw new Error('Unexpected runtime dependencies');
  console.log(
    `Verified ${packed.filename}: ${files.length} files, ${packed.unpackedSize} unpacked bytes; ESM, CommonJS, TypeScript, and CLI passed.`,
  );
} finally {
  rmSync(directory, { recursive: true, force: true });
}
