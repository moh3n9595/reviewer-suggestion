import { string } from '../src/http.js';
import { describe, expect, it, vi } from 'vitest';
import { createGitHubProvider, createGitLabProvider } from '../src/index.js';
import { context, fetchMock, json, member } from './fixtures.js';
const ghUser = { id: 1, login: 'alice' };
const glUser = { id: 1, username: 'alice' };
const ghContext = {
  user: ghUser,
  requested_reviewers: [ghUser],
  base: { sha: 'base' },
  state: 'open',
  draft: false,
  changed_files: 4,
};
const glContext = {
  author: glUser,
  reviewers: [glUser],
  target_branch: 'main',
  changes_count: '4',
  state: 'opened',
  draft: false,
};
const ghFiles = ['added', 'removed', 'renamed', 'modified'].map((status) => ({
  filename: status,
  status,
  ...(status === 'renamed' ? { previous_filename: 'old' } : {}),
}));
const glFiles = [
  { new_path: 'a', new_file: true },
  { new_path: 'd', deleted_file: true },
  { new_path: 'r', old_path: 'old', renamed_file: true },
  { new_path: 'm' },
];
const ghMembers = [
  { ...ghUser, permissions: { push: true } },
  { id: 2, login: 'admin', permissions: { admin: true } },
  { id: 3, login: 'maintainer', permissions: { maintain: true } },
  {
    id: 4,
    login: 'reader',
    permissions: {},
    type: 'Bot',
    suspended_at: 'yesterday',
  },
];
const glMembers = [30, 40, 50, 20].map((access_level, i) => ({
  id: i + 1,
  username: i === 0 ? 'alice' : `user${i}`,
  access_level,
  state: i === 3 ? 'blocked' : 'active',
  ...(i === 0 ? { email: 'alice@example.com' } : {}),
}));
const ctx = context();
describe('GitHub REST adapter', () => {
  it('collects context, file statuses and permission tiers', async () => {
    const p = createGitHubProvider({
      token: 'secret',
      fetch: fetchMock((url) => {
        if (url.pathname.endsWith('/files')) return json(ghFiles);
        if (url.pathname.endsWith('/collaborators')) return json(ghMembers);
        return json(ghContext);
      }),
    });
    const result = await p.context(ctx);
    expect(result.files.map((f) => f.status)).toEqual([
      'added',
      'deleted',
      'renamed',
      'modified',
    ]);
    expect(result.existingReviewers[0]!.id).toBe('1');
    expect((await p.members(ctx)).map((m) => m.access)).toEqual([
      0.6, 1, 0.9, 0,
    ]);
    await expect(p.context({ repository: 'bad', number: 1 })).rejects.toThrow();
  });
  it('handles closed/draft requests, truncated diffs and custom API roots', async () => {
    const log = { debug: vi.fn(), info: vi.fn(), warn: vi.fn() };
    const fetcher = fetchMock((url) =>
      url.pathname.endsWith('/files')
        ? json([])
        : json({
            ...ghContext,
            changed_files: 0,
            state: 'closed',
            draft: true,
          }),
    );
    const p = createGitHubProvider({
      token: 'x',
      apiUrl: 'https://enterprise.test/api/v3',
      fetch: fetcher,
      logger: log,
    });
    expect(await p.context(ctx)).toMatchObject({
      state: 'closed',
      draft: true,
    });
    expect(p.logger).toBe(log);
    const bad = createGitHubProvider({
      token: 'x',
      fetch: fetchMock((url) =>
        url.pathname.endsWith('/files') ? json([]) : json(ghContext),
      ),
    });
    await expect(bad.context(ctx)).rejects.toMatchObject({ code: 'TRUNCATED' });
  });
  it('captures historical identity and base ref, decodes optional files', async () => {
    const fetcher = fetchMock((url) => {
      if (url.pathname.endsWith('/commits')) {
        expect(url.searchParams.get('sha')).toBe('base');
        expect(url.searchParams.get('per_page')).toBe('30');
        return json([
          {
            sha: '1',
            author: ghUser,
            commit: { author: { email: 'a@example.com', date: 'today' } },
          },
          { sha: '2', author: null, commit: { author: { date: 'yesterday' } } },
        ]);
      }
      if (url.pathname.endsWith('/missing')) return json({}, 404);
      if (url.pathname.endsWith('/unsupported'))
        return json({ encoding: 'none' });
      expect(url.searchParams.get('ref')).toBe('base');
      return json({
        encoding: 'base64',
        content: Buffer.from('* @alice').toString('base64'),
      });
    });
    const p = createGitHubProvider({ token: 'x', fetch: fetcher });
    expect(await p.history(ctx, 'file', 30)).toEqual([
      { sha: '1', username: 'alice', email: 'a@example.com', date: 'today' },
      { sha: '2', date: 'yesterday' },
    ]);
    expect(await p.file(ctx, 'CODEOWNERS')).toBe('* @alice');
    expect(await p.file(ctx, 'missing')).toBeNull();
    await expect(p.file(ctx, 'unsupported')).rejects.toThrow();
  });
  it('resolves teams only with repository write access and intersects eligibility', async () => {
    const fetcher = fetchMock((url) => {
      if (url.pathname.includes('/teams/noaccess/'))
        return json({ permissions: { push: false } });
      if (url.pathname.includes('/teams/missing/')) return json({}, 404);
      if (url.pathname.endsWith('/members'))
        return json([ghUser, { id: 9, login: 'outsider' }]);
      return json({ permissions: { push: true } });
    });
    const p = createGitHubProvider({ token: 'x', fetch: fetcher });
    expect(
      await p.owners(
        ctx,
        [
          'alice',
          'alice@example.com',
          'org/team',
          'other/team',
          'org/',
          '/team',
          'org/noaccess',
          'org/missing',
          'nobody',
        ],
        [
          member(),
          member('reader', { access: 0 }),
          member('bot', { bot: true }),
          member('inactive', { active: false }),
        ],
      ),
    ).toEqual(['alice']);
  });
  it('counts pending individual reviews and adds only supplied reviewers', async () => {
    const fetcher = fetchMock((_url, init) => {
      if (init?.method === 'POST') {
        expect(JSON.parse(string(init.body))).toEqual({ reviewers: ['alice'] });
        return json({});
      }
      return json([
        { number: 1, requested_reviewers: [ghUser] },
        { number: 2, requested_reviewers: [ghUser] },
        { number: 3, requested_reviewers: [ghUser] },
      ]);
    });
    const p = createGitHubProvider({ token: 'x', fetch: fetcher });
    expect(await p.loads(ctx)).toEqual({ alice: 2 });
    await p.assign(ctx, [member()]);
  });
});
describe('GitLab REST adapter', () => {
  it('collects context, target revision, statuses, inherited access and emails', async () => {
    const p = createGitLabProvider({
      token: 'x',
      fetch: fetchMock((url) => {
        if (url.pathname.endsWith('/diffs')) return json(glFiles);
        if (url.pathname.includes('/branches/'))
          return json({ commit: { id: 'target-head' } });
        if (url.pathname.endsWith('/members/all')) return json(glMembers);
        return json(glContext);
      }),
    });
    const result = await p.context(ctx);
    expect(result.baseSha).toBe('target-head');
    expect(result.files.map((f) => f.status)).toEqual([
      'added',
      'deleted',
      'renamed',
      'modified',
    ]);
    expect((await p.members(ctx)).map((m) => m.access)).toEqual([
      0.6, 0.9, 1, 0,
    ]);
  });
  it('identifies bots and exposes custom roots/logger', async () => {
    const logger = { debug: vi.fn(), info: vi.fn(), warn: vi.fn() };
    const p = createGitLabProvider({
      token: 'x',
      apiUrl: 'https://lab.test/api/v4',
      logger,
      fetch: fetchMock(() =>
        json([
          { ...glMembers[0], username: 'project_1_bot_xyz' },
          { ...glMembers[0], bot: true },
        ]),
      ),
    });
    expect((await p.members(ctx)).every((m) => m.bot)).toBe(true);
    expect(p.logger).toBe(logger);
  });
  it('rejects missing, overflowed or mismatched changed-file counts', async () => {
    for (const changes_count of [undefined, '1000+', '3']) {
      const p = createGitLabProvider({
        token: 'x',
        fetch: fetchMock((url) =>
          url.pathname.endsWith('/diffs')
            ? json(glFiles)
            : json({ ...glContext, changes_count }),
        ),
      });
      await expect(p.context(ctx)).rejects.toMatchObject({ code: 'TRUNCATED' });
    }
  });
  it('handles closed and legacy draft states', async () => {
    const p = createGitLabProvider({
      token: 'x',
      fetch: fetchMock((url) =>
        url.pathname.endsWith('/diffs')
          ? json([])
          : url.pathname.includes('/branches/')
            ? json({ commit: { id: 'base' } })
            : json({
                ...glContext,
                changes_count: '0',
                state: 'closed',
                work_in_progress: true,
              }),
      ),
    });
    expect(await p.context(ctx)).toMatchObject({
      state: 'closed',
      draft: true,
    });
  });
  it('reads history and CODEOWNERS at base revision with encoded project/file paths', async () => {
    const p = createGitLabProvider({
      token: 'x',
      fetch: fetchMock((url) => {
        expect(url.pathname).toContain('/projects/org%2Frepo/');
        if (url.pathname.endsWith('/commits')) {
          expect(url.searchParams.get('ref_name')).toBe('base');
          return json([
            { id: '1', authored_date: 'today', author_email: 'a' },
            { id: '2', authored_date: 'yesterday' },
          ]);
        }
        if (url.pathname.endsWith('/missing')) return json({}, 404);
        if (url.pathname.endsWith('/unsupported'))
          return json({ encoding: 'none' });
        expect(url.searchParams.get('ref')).toBe('base');
        return json({
          encoding: 'base64',
          content: Buffer.from('* @alice').toString('base64'),
        });
      }),
    });
    expect(await p.history(ctx, 'a', 30)).toEqual([
      { sha: '1', email: 'a', date: 'today' },
      { sha: '2', date: 'yesterday' },
    ]);
    expect(await p.file(ctx, '.gitlab/CODEOWNERS')).toBe('* @alice');
    expect(await p.file(ctx, 'missing')).toBeNull();
    await expect(p.file(ctx, 'unsupported')).rejects.toThrow();
  });
  it('resolves direct role members, usernames/emails, groups and unknown owners', async () => {
    const fetcher = fetchMock((url) => {
      if (url.pathname.endsWith('/projects/org%2Frepo'))
        return json({
          namespace: { kind: 'user' },
          shared_with_groups: [
            { group_id: 7, group_access_level: 30 },
            { group_id: 8, group_access_level: 20 },
          ],
        });
      if (url.pathname.includes('/groups/missing')) return json({}, 404);
      if (url.pathname.endsWith('/members')) return json(glMembers);
      return json({ id: 7 });
    });
    const p = createGitLabProvider({ token: 'x', fetch: fetcher });
    const members = glMembers.map((raw, index) =>
      member(raw.username, {
        provider: 'gitlab',
        host: 'https://gitlab.com',
        id: String(raw.id),
        access: index === 0 ? 0.6 : index === 1 ? 0.9 : index === 2 ? 1 : 0,
        emails: index === 0 ? ['alice@example.com'] : [],
      }),
    );
    expect(
      await p.owners(
        ctx,
        [
          'alice',
          'alice@example.com',
          '@@developers',
          '@@maintainer',
          '@@unknown',
          'group/sub',
          'missing',
          'no@example.com',
        ],
        members,
      ),
    ).toEqual(['alice', 'user1', 'user2']);
  });
  it('counts workloads and preserves existing IDs during update', async () => {
    const fetcher = fetchMock((url, init) => {
      if (url.pathname.endsWith('/reviewers'))
        return json([
          { user: glUser, state: 'unreviewed' },
          { user: { id: 7, username: 'reviewed' }, state: 'reviewed' },
        ]);
      if (init?.method === 'PUT') {
        expect(JSON.parse(string(init.body))).toEqual({
          reviewer_ids: ['other', 'alice'],
        });
        return json({});
      }
      return json([
        { iid: 1, reviewers: [glUser] },
        { iid: 2, reviewers: [glUser] },
        { iid: 3, reviewers: [glUser] },
      ]);
    });
    const p = createGitLabProvider({ token: 'x', fetch: fetcher });
    expect(await p.loads(ctx)).toEqual({ alice: 2 });
    await p.assign(context({ existingReviewers: [member('other')] }), [
      member(),
      member(),
    ]);
  });
});

it('limits GitLab group owners to project ancestry and invited groups', async () => {
  const fetcher = fetchMock((url) => {
    if (url.pathname.endsWith('/projects/org%2Frepo'))
      return json({
        namespace: { kind: 'group', id: 5 },
        shared_with_groups: [],
      });
    if (url.pathname.endsWith('/groups/team')) return json({ id: 6 });
    if (url.pathname.endsWith('/groups/unrelated')) return json({ id: 8 });
    if (url.pathname.endsWith('/groups/5'))
      return json({
        parent_id: 6,
        shared_with_groups: [{ group_id: 9, group_access_level: 40 }],
      });
    if (url.pathname.endsWith('/groups/6'))
      return json({ parent_id: null, shared_with_groups: [] });
    return json([glUser]);
  });
  const p = createGitLabProvider({ token: 'x', fetch: fetcher });
  expect(
    await p.owners(ctx, ['team', 'unrelated'], [member('alice', { id: '1' })]),
  ).toEqual(['alice']);
});

it('rejects cyclic GitLab ancestry and unknown review states', async () => {
  const p = createGitLabProvider({
    token: 'x',
    fetch: fetchMock((url) => {
      if (url.pathname.endsWith('/projects/org%2Frepo'))
        return json({
          namespace: { kind: 'group', id: 5 },
          shared_with_groups: [],
        });
      if (url.pathname.endsWith('/groups/team')) return json({ id: 5 });
      return json({ parent_id: 5, shared_with_groups: [] });
    }),
  });
  await expect(p.owners(ctx, ['team'], [])).rejects.toThrow();
  const workload = createGitLabProvider({
    token: 'x',
    fetch: fetchMock((url) =>
      url.pathname.endsWith('/reviewers')
        ? json([{ state: 'unknown', user: glUser }])
        : json([{ iid: 2 }]),
    ),
  });
  await expect(workload.loads(ctx)).rejects.toMatchObject({
    code: 'UNSUPPORTED',
  });
});
