import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { runCli } from '../src/cli-runner.js';
import type { CliEnvironment } from '../src/cli-runner.js';
import { runAction } from '../src/action.js';
import type { ActionEnvironment } from '../src/action.js';
import { parseConfig } from '../src/config.js';
import { ReviewerError } from '../src/index.js';
import { fetchMock, json, member, provider } from './fixtures.js';
const baseArgs = [
  'suggest',
  '--provider',
  'github',
  '--repository',
  'org/repo',
  '--number',
  '1',
];
const cli = (extra: Partial<CliEnvironment> = {}): CliEnvironment => ({
  env: { GITHUB_TOKEN: 'secret', GITLAB_TOKEN: 'secret' },
  stdout: vi.fn(),
  stderr: vi.fn(),
  read: vi.fn(async () => '{}'),
  provider: () => provider(),
  ...extra,
});
const action = (
  inputs: Record<string, string> = {},
  extra: Partial<ActionEnvironment> = {},
): ActionEnvironment => ({
  input: (name) => inputs[name] ?? '',
  event: { repository: { full_name: 'org/repo' }, pull_request: { number: 1 } },
  provider: () => provider(),
  output: vi.fn(async () => undefined),
  summary: vi.fn(async () => undefined),
  ...extra,
});
const network = fetchMock((url) => {
  if (
    url.pathname.endsWith('/collaborators') ||
    url.pathname.endsWith('/files') ||
    url.pathname.endsWith('/members/all') ||
    url.pathname.endsWith('/diffs') ||
    url.pathname.endsWith('/pulls') ||
    url.pathname.endsWith('/merge_requests')
  )
    return json([]);
  if (url.pathname.includes('/branches/'))
    return json({ commit: { id: 'base' } });
  if (
    url.pathname.includes('/contents/') ||
    url.pathname.includes('/repository/files/')
  )
    return json({}, 404);
  if (url.pathname.includes('/merge_requests/'))
    return json({
      author: { id: 1, username: 'author' },
      reviewers: [],
      state: 'opened',
      target_branch: 'main',
      changes_count: '0',
    });
  return json({
    user: { id: 1, login: 'author' },
    requested_reviewers: [],
    base: { sha: 'base' },
    state: 'open',
    changed_files: 0,
  });
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  process.exitCode = 0;
});
describe('JSON configuration', () => {
  it('accepts valid options and rejects malformed/unknown types', () => {
    expect(parseConfig('{"limit":3}')).toEqual({ limit: 3 });
    for (const text of [
      'bad',
      'null',
      '[]',
      '{"unknown":true}',
      '{"fallback":"yes"}',
      '{"exclude":[1]}',
      '{"aliases":{"a":2}}',
      '{"weights":{"expertise":null}}',
    ])
      expect(() => parseConfig(text)).toThrow();
  });
});
describe('CLI', () => {
  it('offers help and handles invalid arguments and missing credentials', async () => {
    const io = cli();
    expect(await runCli(['--help'], io)).toBe(0);
    expect(io.stdout).toHaveBeenCalledWith(
      expect.stringContaining('suggest|assign'),
    );
    for (const args of [
      [],
      ['oops'],
      [...baseArgs, '--unknown'],
      [...baseArgs, 'extra'],
      ['suggest', '--provider', 'other'],
      ['assign', '--provider', 'github', '--repository', 'x'],
    ])
      expect(await runCli(args, io)).toBe(2);
    expect(await runCli(baseArgs, cli({ env: {} }))).toBe(2);
    expect(
      await runCli(
        [
          'suggest',
          '--provider',
          'gitlab',
          '--repository',
          '1',
          '--number',
          '2',
        ],
        cli({ env: {} }),
      ),
    ).toBe(2);
  });
  it('applies flags over JSON config and returns machine-readable suggestions', async () => {
    const io = cli({ read: vi.fn(async () => '{"limit":0,"minScore":1}') });
    expect(
      await runCli(
        [
          ...baseArgs,
          '--config',
          'config.json',
          '--limit',
          '2',
          '--min-score',
          '0',
          '--exclude',
          'bob,,',
          '--fallback',
          '--api-url',
          'https://host',
          '--json',
        ],
        io,
      ),
    ).toBe(0);
    expect(io.stdout).toHaveBeenCalledWith(expect.stringContaining('"alice"'));
    const lab = cli();
    expect(
      await runCli(
        [
          'suggest',
          '--provider',
          'gitlab',
          '--repository',
          '1',
          '--number',
          '2',
        ],
        lab,
      ),
    ).toBe(0);
  });
  it('assigns only on explicit command, supports dry runs, and reports failures', async () => {
    const p = provider();
    const io = cli({ provider: () => p });
    expect(
      await runCli(['assign', ...baseArgs.slice(1), '--dry-run'], io),
    ).toBe(0);
    expect(p.assign).not.toHaveBeenCalled();
    expect(await runCli(['assign', ...baseArgs.slice(1)], io)).toBe(0);
    expect(p.assign).toHaveBeenCalledOnce();
    expect(await runCli(['assign', ...baseArgs.slice(1), '--json'], io)).toBe(
      0,
    );
    const failing = cli({
      provider: () =>
        provider({ assign: vi.fn().mockRejectedValue(new Error('secret')) }),
    });
    expect(await runCli(['assign', ...baseArgs.slice(1)], failing)).toBe(1);
    expect(failing.stdout).toHaveBeenCalledWith(
      expect.stringContaining('failed: 1'),
    );
  });
  it('writes partial diagnostics and sanitizes unexpected failures', async () => {
    const io = cli({
      provider: () =>
        provider({ loads: vi.fn().mockRejectedValue(new Error('secret')) }),
    });
    expect(await runCli(baseArgs, io)).toBe(0);
    expect(io.stderr).toHaveBeenCalledWith(
      expect.stringContaining('UNEXPECTED_ERROR'),
    );
    const failing = cli({
      read: vi.fn().mockRejectedValue(new Error('token')),
    });
    expect(await runCli([...baseArgs, '--config', 'x'], failing)).toBe(1);
    expect(failing.stderr).toHaveBeenCalledWith(
      'UNEXPECTED_ERROR: Command failed.\n',
    );
  });
  it('uses real default I/O and providers without requiring consumer SDKs', async () => {
    const stdout = vi.spyOn(process.stdout, 'write').mockReturnValue(true);
    const stderr = vi.spyOn(process.stderr, 'write').mockReturnValue(true);
    expect(await runCli(['--help'])).toBe(0);
    expect(await runCli([])).toBe(2);
    expect(stdout).toHaveBeenCalled();
    expect(stderr).toHaveBeenCalled();
    vi.stubGlobal('fetch', network);
    vi.stubEnv('GITHUB_TOKEN', 'x');
    vi.stubEnv('GITLAB_TOKEN', 'x');
    const dir = await mkdtemp(join(tmpdir(), 'reviewer-cli-'));
    try {
      const path = join(dir, 'config.json');
      await writeFile(path, '{}');
      expect(await runCli([...baseArgs, '--config', path])).toBe(0);
      expect(
        await runCli([
          'suggest',
          '--provider',
          'gitlab',
          '--repository',
          'org/repo',
          '--number',
          '1',
        ]),
      ).toBe(0);
    } finally {
      await rm(dir, { recursive: true });
    }
  });
  it('runs the executable entrypoint', async () => {
    vi.spyOn(process.stdout, 'write').mockReturnValue(true);
    vi.spyOn(process, 'argv', 'get').mockReturnValue(['node', 'cli', '--help']);
    await import('../src/cli.js');
    expect(process.exitCode).toBe(0);
  });
});
describe('Action', () => {
  it('infers GitHub event context and never assigns by default', async () => {
    const p = provider();
    const io = action({}, { provider: () => p });
    await runAction(io);
    expect(p.assign).not.toHaveBeenCalled();
    expect(io.output).toHaveBeenCalledWith('reviewers', '["alice"]');
    expect(io.summary).toHaveBeenCalledWith(expect.stringContaining('alice'));
  });
  it('reads configuration at the captured base and supports explicit GitLab inputs', async () => {
    const p = provider({
      file: vi.fn(async (_ctx, path: string) =>
        path === 'config.json' ? '{"limit":0}' : '* @alice',
      ),
    });
    const io = action(
      {
        provider: 'gitlab',
        repository: '123',
        number: '4',
        'api-url': 'https://host/api/v4',
        'config-path': 'config.json',
        limit: '2',
        assign: 'true',
      },
      { event: {}, provider: () => p },
    );
    await runAction(io);
    expect(p.assign).toHaveBeenCalledOnce();
    expect(p.file).toHaveBeenCalledWith(
      expect.objectContaining({ baseSha: 'base' }),
      'config.json',
    );
  });
  it('rejects invalid providers, booleans and missing explicit configuration', async () => {
    await expect(runAction(action({ provider: 'other' }))).rejects.toThrow();
    await expect(runAction(action({ provider: 'gitlab' }))).rejects.toThrow();
    await expect(
      runAction(action({ provider: 'gitlab', repository: 'org/repo' })),
    ).rejects.toThrow();
    await expect(runAction(action({ assign: 'yes' }))).rejects.toThrow();
    await expect(
      runAction(
        action(
          { 'config-path': 'missing' },
          { provider: () => provider({ file: vi.fn(async () => null) }) },
        ),
      ),
    ).rejects.toThrow();
  });
  it('escapes summaries, exposes diagnostics and fails unconfirmed assignment', async () => {
    const special = 'a<|\n';
    const p = provider({
      members: vi.fn(async () => [member(special)]),
      owners: vi.fn(async () => [special]),
      loads: vi.fn().mockRejectedValue(new Error('secret')),
    });
    const io = action({}, { provider: () => p });
    await runAction(io);
    expect(io.summary).toHaveBeenCalledWith(
      expect.stringContaining('a&#60;&#124;&#10;'),
    );
    expect(io.summary).toHaveBeenCalledWith(
      expect.stringContaining('unavailable'),
    );
    await expect(
      runAction(
        action(
          { assign: 'true' },
          {
            provider: () =>
              provider({
                assign: vi
                  .fn()
                  .mockRejectedValue(new ReviewerError('HTTP_403', 'no')),
              }),
          },
        ),
      ),
    ).rejects.toMatchObject({ code: 'ASSIGNMENT_FAILED' });
  });
  it('constructs either built-in provider', async () => {
    vi.stubGlobal('fetch', network);
    for (const platform of ['github', 'gitlab']) {
      const io = action({
        provider: platform,
        token: 'x',
        repository: 'org/repo',
        number: '1',
      });
      delete io.provider;
      await runAction(io);
      expect(io.output).toHaveBeenCalledWith('reviewers', '[]');
    }
  });
  it('runs the Action entrypoint and writes GitHub environment files', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'reviewer-action-'));
    vi.stubGlobal('fetch', network);
    try {
      const eventPath = join(dir, 'event.json');
      const outputPath = join(dir, 'output');
      const summaryPath = join(dir, 'summary');
      await writeFile(
        eventPath,
        JSON.stringify({
          repository: { full_name: 'org/repo' },
          pull_request: { number: 1 },
        }),
      );
      vi.stubEnv('GITHUB_EVENT_PATH', eventPath);
      vi.stubEnv('GITHUB_OUTPUT', outputPath);
      vi.stubEnv('GITHUB_STEP_SUMMARY', summaryPath);
      vi.stubEnv('INPUT_TOKEN', 'x');
      await import('../src/action-entry.js');
      expect(await readFile(outputPath, 'utf8')).toContain('reviewers<<');
      expect(await readFile(summaryPath, 'utf8')).toContain(
        'Reviewer suggestions',
      );
      vi.resetModules();
      vi.stubEnv('GITHUB_EVENT_PATH', join(dir, 'missing'));
      const stderr = vi.spyOn(process.stderr, 'write').mockReturnValue(true);
      await import('../src/action-entry.js');
      expect(process.exitCode).toBe(1);
      expect(stderr).toHaveBeenCalledWith(
        'Reviewer Action failed: UNEXPECTED_ERROR\n',
      );
    } finally {
      await rm(dir, { recursive: true });
    }
  });
});
