import { execFileSync } from 'node:child_process';
const status = execFileSync(
  'git',
  ['status', '--porcelain', '--untracked-files=all', '--', 'docs'],
  { encoding: 'utf8' },
);
if (status.trim())
  throw new Error(
    `Generated documentation is not committed. Run \`pnpm run docs\` and commit:\n${status}`,
  );
console.log('Committed documentation matches the current API.');
