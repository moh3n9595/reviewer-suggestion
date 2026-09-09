import { describe, expect, it, vi } from 'vitest';
import {
  assignReviewers,
  ReviewerError,
  suggestReviewers,
} from '../src/index.js';
import { errorCode } from '../src/errors.js';
import { context, member, provider } from './fixtures.js';
const request = { repository: 'org/repo', number: 1 };
const logger = () => ({ debug: vi.fn(), info: vi.fn(), warn: vi.fn() });
describe('collection', () => {
  it('collects known zero load, aliases and logger events', async () => {
    const log = logger();
    const p = provider({ logger: log });
    const result = await suggestReviewers(p, request, {
      now: '2026-01-01',
      aliases: { 'alias@example.com': 'ALICE' },
    });
    expect(result.selected).toHaveLength(1);
    expect(result.selected[0]!.breakdown.availability).toBe(1);
    expect(log.debug).toHaveBeenCalled();
    expect(log.info).toHaveBeenCalled();
    expect(p.owners).toHaveBeenCalledWith(
      expect.anything(),
      ['alice'],
      [
        expect.objectContaining({
          emails: ['alice@example.com', 'alias@example.com'],
        }),
      ],
    );
  });
  it('caches directory history and owner resolution, deduplicates changed paths', async () => {
    const history = vi.fn(async (_ctx, path: string) =>
      path === 'src'
        ? [{ sha: '1', username: 'alice', date: '2026-01-01' }]
        : [],
    );
    const p = provider({
      context: vi.fn(async () =>
        context({
          files: [
            { path: 'src/a', status: 'added' },
            { path: 'src/b', status: 'added' },
            { path: 'src/b', status: 'added' },
            { path: 'new', previousPath: 'src/old', status: 'renamed' },
          ],
        }),
      ),
      history,
    });
    const result = await suggestReviewers(p, request);
    expect(result.selected[0]!.evidence.contributedFiles).toHaveLength(3);
    expect(history.mock.calls.filter((call) => call[1] === 'src')).toHaveLength(
      1,
    );
    expect(p.owners).toHaveBeenCalledTimes(1);
  });
  it('looks up correct provider CODEOWNERS precedence and handles empty roots', async () => {
    const file = vi.fn(async (_ctx, path: string) =>
      path === 'docs/CODEOWNERS' ? '' : null,
    );
    const p = provider({
      platform: 'gitlab',
      file,
      context: vi.fn(async () =>
        context({ files: [{ path: 'root', status: 'added' }] }),
      ),
      history: vi.fn(async () => []),
    });
    await suggestReviewers(p, request);
    expect(file.mock.calls.map((call) => call[1])).toEqual([
      'CODEOWNERS',
      'docs/CODEOWNERS',
    ]);
    expect(p.history).toHaveBeenCalledTimes(1);
  });
  it('treats missing CODEOWNERS as normal and errors as partial without revealing messages', async () => {
    const p = provider({ file: vi.fn(async () => null) });
    expect((await suggestReviewers(p, request)).partial).toBe(false);
    expect(p.file).toHaveBeenCalledTimes(3);
    const secret = new Error('TOKEN_DO_NOT_LEAK');
    const log = logger();
    const failing = provider({
      logger: log,
      file: vi.fn().mockRejectedValue(secret),
      history: vi
        .fn()
        .mockRejectedValue(new ReviewerError('HTTP_403', 'secret')),
      owners: vi.fn().mockRejectedValue(secret),
      loads: vi.fn().mockRejectedValue(secret),
    });
    const result = await suggestReviewers(failing, request);
    expect(result.partial).toBe(true);
    expect(result.selected).toEqual([]);
    expect(JSON.stringify(result)).not.toContain('TOKEN_DO_NOT_LEAK');
    expect(log.warn).toHaveBeenCalled();
  });
  it('never swallows essential failures or invalid request inputs', async () => {
    await expect(
      suggestReviewers(
        provider({ members: vi.fn().mockRejectedValue(new Error('failed')) }),
        request,
      ),
    ).rejects.toThrow('failed');
    await expect(
      suggestReviewers(provider(), { ...request, number: 0 }),
    ).rejects.toMatchObject({ code: 'INVALID_OPTIONS' });
    await expect(
      suggestReviewers(provider(), { ...request, repository: '' }),
    ).rejects.toThrow();
  });
  it('counts known workloads and defaults unmatched aliases safely', async () => {
    const p = provider({ loads: vi.fn(async () => ({ alice: 8 })) });
    expect(
      (await suggestReviewers(p, request, { aliases: { email: 'nobody' } }))
        .selected[0]!.breakdown.availability,
    ).toBe(0);
  });
});
describe('assignment', () => {
  it('deduplicates candidates, preserves existing reviewers and logs successful assignment', async () => {
    const log = logger();
    const p = provider({ logger: log });
    expect(
      await assignReviewers(p, request, [member(), member()]),
    ).toMatchObject({ assigned: [member()], skipped: [], failed: [] });
    expect(p.assign).toHaveBeenCalledOnce();
    expect(log.info).toHaveBeenCalled();
    const existing = provider({
      context: vi.fn(async () => context({ existingReviewers: [member()] })),
    });
    expect(await assignReviewers(existing, request, [member()])).toMatchObject({
      skipped: [member()],
      assigned: [],
    });
    expect(existing.assign).not.toHaveBeenCalled();
  });
  it.each([{ draft: true }, { state: 'closed' as const }])(
    'rejects non-reviewable request %j',
    async (extra) => {
      await expect(
        assignReviewers(
          provider({ context: vi.fn(async () => context(extra)) }),
          request,
          [],
        ),
      ).rejects.toMatchObject({ code: 'NOT_ASSIGNABLE' });
    },
  );
  it.each([
    { provider: 'gitlab' as const },
    { host: 'https://elsewhere' },
    { id: 'unknown' },
    { username: 'impostor' },
  ])('rejects invalid reviewer identity %j', async (extra) => {
    await expect(
      assignReviewers(provider(), request, [member('alice', extra)]),
    ).rejects.toMatchObject({ code: 'INELIGIBLE' });
  });
  it('rejects inactive, bot, low access and author accounts', async () => {
    for (const extra of [{ active: false }, { bot: true }, { access: 0.1 }])
      await expect(
        assignReviewers(
          provider({ members: vi.fn(async () => [member('alice', extra)]) }),
          request,
          [member()],
        ),
      ).rejects.toThrow();
    await expect(
      assignReviewers(
        provider({ context: vi.fn(async () => context({ author: 'alice' })) }),
        request,
        [member()],
      ),
    ).rejects.toThrow();
  });
  it('reconciles an ambiguous write without retrying blindly', async () => {
    const log = logger();
    const p = provider({
      logger: log,
      members: vi.fn(async () => [member(), member('bob')]),
      context: vi
        .fn()
        .mockResolvedValueOnce(context())
        .mockResolvedValueOnce(context({ existingReviewers: [member()] })),
      assign: vi
        .fn()
        .mockRejectedValue(new ReviewerError('NETWORK_ERROR', 'timeout')),
    });
    const result = await assignReviewers(p, request, [member(), member('bob')]);
    expect(result.assigned).toEqual([member()]);
    expect(result.failed).toEqual([
      { reviewer: member('bob'), code: 'NETWORK_ERROR' },
    ]);
    expect(p.assign).toHaveBeenCalledOnce();
    expect(log.warn).toHaveBeenCalled();
  });
  it('reports unconfirmed assignment when reconciliation also fails', async () => {
    const p = provider({
      context: vi
        .fn()
        .mockResolvedValueOnce(context())
        .mockRejectedValueOnce(new Error()),
      assign: vi.fn().mockRejectedValue(new Error()),
    });
    expect(
      (await assignReviewers(p, request, [member()])).failed[0]!.code,
    ).toBe('ASSIGNMENT_UNCONFIRMED');
    expect(errorCode(new Error('token'))).toBe('UNEXPECTED_ERROR');
  });
});
