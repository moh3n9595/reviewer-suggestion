import { execFileSync } from 'node:child_process';
const run = (command, args) =>
  execFileSync(command, args, { encoding: 'utf8' }).trim();
const sha = run('git', ['rev-parse', 'HEAD']);
const tags = run('git', ['tag', '--points-at', sha]).split('\n');
const tag = tags.find((value) => /^v\d+\.\d+\.\d+$/.test(value));
if (tag) {
  const version = tag.slice(1);
  const metadata = JSON.parse(
    run('npm', ['view', `reviewer-suggestion@${version}`, '--json']),
  );
  if (!metadata.dist?.attestations?.provenance)
    throw new Error('Published provenance missing');
  run('git', ['tag', '-f', `v${version.split('.')[0]}`, sha]);
  run('git', [
    'push',
    'origin',
    `refs/tags/v${version.split('.')[0]}`,
    '--force',
  ]);
}
