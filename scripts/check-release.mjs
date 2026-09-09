import { execFileSync } from 'node:child_process';
const gh = (args) => JSON.parse(execFileSync('gh', args, { encoding: 'utf8' }));
const sha = execFileSync('git', ['rev-parse', 'HEAD'], {
  encoding: 'utf8',
}).trim();
const repo = process.env.GITHUB_REPOSITORY;
const checks = gh([
  'api',
  `repos/${repo}/commits/${sha}/check-runs`,
  '--paginate',
  '--slurp',
]).flatMap((page) => page.check_runs);
const statuses = gh(['api', `repos/${repo}/commits/${sha}/status`]).statuses;
const successful = (name) =>
  checks.find((check) => check.name === name)?.conclusion === 'success' ||
  statuses.find((status) => status.context === name)?.state === 'success';
for (const name of ['Release readiness', 'codecov/project', 'CodeFactor'])
  if (!successful(name))
    throw new Error(`Required check not successful for ${sha}: ${name}`);
