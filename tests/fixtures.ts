import { vi } from 'vitest';
import type {
  Member,
  RequestContext,
  ReviewerProvider,
  ReviewerSnapshot,
} from '../src/types.js';
export const member = (
  username = 'alice',
  extra: Partial<Member> = {},
): Member => ({
  provider: 'github',
  host: 'https://api.github.com',
  id: username,
  username,
  active: true,
  bot: false,
  access: 0.6,
  emails: [`${username}@example.com`],
  ...extra,
});
export const context = (
  extra: Partial<RequestContext> = {},
): RequestContext => ({
  repository: 'org/repo',
  number: 1,
  author: 'author',
  existingReviewers: [],
  baseSha: 'base',
  state: 'open',
  draft: false,
  files: [{ path: 'src/a.ts', status: 'modified' }],
  ...extra,
});
export const snapshot = (
  extra: Partial<ReviewerSnapshot> = {},
): ReviewerSnapshot => ({
  context: context(),
  members: [member()],
  files: [
    {
      path: 'src/a.ts',
      contributions: [{ sha: '1', username: 'alice', date: '2026-01-01' }],
      owners: ['alice'],
      historySource: 'src/a.ts',
    },
  ],
  loads: { alice: 0 },
  warnings: [],
  ...extra,
});
export const provider = (
  extra: Partial<ReviewerProvider> = {},
): ReviewerProvider => ({
  platform: 'github',
  host: 'https://api.github.com',
  context: vi.fn(async () => context()),
  members: vi.fn(async () => [member()]),
  history: vi.fn(async () => [
    { sha: '1', username: 'alice', date: '2026-01-01' },
  ]),
  file: vi.fn(async () => '* @alice'),
  owners: vi.fn(async () => ['alice']),
  loads: vi.fn(async () => ({})),
  assign: vi.fn(async () => undefined),
  ...extra,
});
export const json = (
  body: unknown,
  status = 200,
  headers: Record<string, string> = {},
): Response =>
  new Response(status === 204 ? null : JSON.stringify(body), {
    status,
    headers,
  });
export const fetchMock = (
  handler: (url: URL, init?: RequestInit) => Response | Promise<Response>,
): typeof fetch =>
  vi.fn<typeof fetch>(async (input, init) =>
    handler(
      new URL(input instanceof Request ? input.url : input.toString()),
      init,
    ),
  );
