import { parseArgs } from 'node:util';
import { readFile } from 'node:fs/promises';
import { errorCode, ReviewerError } from './errors.js';
import { parseConfig } from './config.js';
import { createGitHubProvider } from './providers/github.js';
import { createGitLabProvider } from './providers/gitlab.js';
import { assignReviewers, suggestReviewers } from './service.js';
import type {
  ProviderOptions,
  RankingOptions,
  ReviewerProvider,
} from './types.js';

/** Injectable CLI I/O and provider factory for embedding and testing. */
export interface CliEnvironment {
  env: NodeJS.ProcessEnv;
  stdout(text: string): void;
  stderr(text: string): void;
  read(path: string): Promise<string>;
  provider?: (
    platform: 'github' | 'gitlab',
    options: ProviderOptions,
  ) => ReviewerProvider;
}
const help = `reviewer-suggestion <suggest|assign> --provider <github|gitlab> --repository <owner/repo|project> --number <n>
  --config <file>       JSON ranking options (flags override configuration)
  --limit <n>           Reviewer count (default 2)
  --min-score <0..1>    Minimum score (default 0.05)
  --exclude <a,b>       Exclude usernames
  --fallback           Enable owner/maintainer/member fallback
  --api-url <url>       Custom HTTPS API root
  --json               Machine-readable output
  --dry-run            Suggest without assigning
  --help               Show usage
Tokens: GITHUB_TOKEN or GITLAB_TOKEN. No token command-line arguments.\n`;

/**
 * Run CLI arguments without exiting the process.
 * @returns Exit code: 0 success, 1 operational failure, 2 invalid input.
 */
export async function runCli(
  args: string[],
  io: CliEnvironment = {
    env: process.env,
    stdout: (text) => process.stdout.write(text),
    stderr: (text) => process.stderr.write(text),
    read: (path) => readFile(path, 'utf8'),
  },
): Promise<number> {
  try {
    let parsed: ReturnType<typeof parseArgs>;
    try {
      parsed = parseArgs({
        args,
        allowPositionals: true,
        strict: true,
        options: {
          provider: { type: 'string' },
          repository: { type: 'string' },
          number: { type: 'string' },
          config: { type: 'string' },
          limit: { type: 'string' },
          'min-score': { type: 'string' },
          exclude: { type: 'string' },
          fallback: { type: 'boolean' },
          'api-url': { type: 'string' },
          json: { type: 'boolean' },
          'dry-run': { type: 'boolean' },
          help: { type: 'boolean' },
        },
      });
    } catch {
      throw new ReviewerError(
        'INVALID_OPTIONS',
        'Invalid command-line arguments.',
      );
    }
    const { values, positionals } = parsed;
    if (values.help === true) {
      io.stdout(help);
      return 0;
    }
    const command = positionals[0];
    if (
      positionals.length !== 1 ||
      (command !== 'suggest' && command !== 'assign') ||
      (values.provider !== 'github' && values.provider !== 'gitlab') ||
      typeof values.repository !== 'string' ||
      typeof values.number !== 'string'
    )
      throw new ReviewerError(
        'INVALID_OPTIONS',
        'Expected command, provider, repository, and request number.',
      );
    const platform = values.provider;
    const token =
      io.env[platform === 'github' ? 'GITHUB_TOKEN' : 'GITLAB_TOKEN'];
    if (!token)
      throw new ReviewerError(
        'INVALID_OPTIONS',
        `Set ${platform === 'github' ? 'GITHUB_TOKEN' : 'GITLAB_TOKEN'}.`,
      );
    const options: RankingOptions =
      typeof values.config === 'string'
        ? parseConfig(await io.read(values.config))
        : {};
    if (typeof values.limit === 'string') options.limit = Number(values.limit);
    if (typeof values['min-score'] === 'string')
      options.minScore = Number(values['min-score']);
    if (typeof values.exclude === 'string')
      options.exclude = values.exclude.split(',').filter(Boolean);
    if (values.fallback === true) options.fallback = true;
    const connection: ProviderOptions = {
      token,
      ...(typeof values['api-url'] === 'string'
        ? { apiUrl: values['api-url'] }
        : {}),
    };
    const provider = io.provider
      ? io.provider(platform, connection)
      : platform === 'github'
        ? createGitHubProvider(connection)
        : createGitLabProvider(connection);
    const request = {
      repository: values.repository,
      number: Number(values.number),
    };
    const result = await suggestReviewers(provider, request, options);
    const assignment =
      command === 'assign' && values['dry-run'] !== true
        ? await assignReviewers(provider, request, result.selected)
        : undefined;
    if (values.json === true)
      io.stdout(
        `${JSON.stringify({ ...result, ...(assignment ? { assignment } : {}) }, null, 2)}\n`,
      );
    else {
      io.stdout(
        `REVIEWER\tSCORE\tREASON\n${result.selected.map((r) => `${r.username}\t${r.score.toFixed(4)}\t${r.reason}`).join('\n')}\n`,
      );
      for (const warning of result.warnings)
        io.stderr(`${warning.code}: ${warning.message}\n`);
      if (assignment)
        io.stdout(
          `Assigned: ${assignment.assigned.length}; skipped: ${assignment.skipped.length}; failed: ${assignment.failed.length}\n`,
        );
    }
    return assignment?.failed.length ? 1 : 0;
  } catch (error) {
    const code = errorCode(error);
    io.stderr(
      `${code}: ${error instanceof ReviewerError ? error.message : 'Command failed.'}\n`,
    );
    return code === 'INVALID_OPTIONS' ? 2 : 1;
  }
}
