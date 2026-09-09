import { ReviewerError } from '../errors.js';
import { array, HttpClient, id, number, object, string } from '../http.js';
import type {
  ChangedFile,
  Identity,
  ProviderOptions,
  RequestReference,
  ReviewerProvider,
} from '../types.js';

/**
 * Create a GitHub REST provider for GitHub.com or an Enterprise API root.
 * @param options - Token, optional API URL, injectable fetch/logger, and request limits.
 * @returns A provider; creation performs no network requests.
 * @throws {@link ReviewerError} For invalid authentication or transport configuration.
 * @example
 * ```ts
 * const provider = createGitHubProvider({ token: process.env.GITHUB_TOKEN! });
 * ```
 */
export function createGitHubProvider(
  options: ProviderOptions,
): ReviewerProvider {
  const http = new HttpClient(
    options.apiUrl ?? 'https://api.github.com',
    options,
    {
      Authorization: `Bearer ${options.token}`,
      'X-GitHub-Api-Version': '2022-11-28',
    },
  );
  const host = http.base.origin;
  const identity = (value: unknown): Identity => {
    const user = object(value);
    return {
      provider: 'github',
      host,
      id: id(user.id),
      username: string(user.login),
    };
  };
  const root = (request: RequestReference): string => {
    if (!/^[^/]+\/[^/]+$/.test(request.repository))
      throw new ReviewerError(
        'INVALID_OPTIONS',
        'GitHub repository must be owner/repo.',
      );
    return `repos/${request.repository.split('/').map(encodeURIComponent).join('/')}`;
  };
  return {
    platform: 'github',
    host,
    ...(options.logger ? { logger: options.logger } : {}),
    async context(request) {
      const path = root(request);
      const raw = object(
        (await http.request(`${path}/pulls/${request.number}`)).data,
      );
      const files = await http.pages(`${path}/pulls/${request.number}/files`);
      if (files.length !== number(raw.changed_files))
        throw new ReviewerError(
          'TRUNCATED',
          'GitHub changed-file list is incomplete.',
        );
      const changed: ChangedFile[] = files.map((value) => {
        const file = object(value);
        const status = string(file.status);
        return {
          path: string(file.filename),
          status:
            status === 'added'
              ? 'added'
              : status === 'removed'
                ? 'deleted'
                : status === 'renamed'
                  ? 'renamed'
                  : 'modified',
          ...(typeof file.previous_filename === 'string'
            ? { previousPath: file.previous_filename }
            : {}),
        };
      });
      return {
        ...request,
        author: identity(raw.user).username,
        existingReviewers: array(raw.requested_reviewers).map(identity),
        baseSha: string(object(raw.base).sha),
        state: raw.state === 'open' ? 'open' : 'closed',
        draft: raw.draft === true,
        files: changed,
      };
    },
    async members(request) {
      return (
        await http.pages(`${root(request)}/collaborators`, {
          affiliation: 'all',
        })
      ).map((value) => {
        const member = object(value);
        const permissions = object(member.permissions);
        return {
          ...identity(member),
          active: !member.suspended_at,
          bot: member.type === 'Bot',
          access:
            permissions.admin === true
              ? 1
              : permissions.maintain === true
                ? 0.9
                : permissions.push === true
                  ? 0.6
                  : 0,
          emails: [],
        };
      });
    },
    async history(context, path, limit) {
      return (
        await http.pages(
          `${root(context)}/commits`,
          { path, sha: context.baseSha },
          limit,
        )
      ).map((value) => {
        const commit = object(value);
        const author = object(object(commit.commit).author);
        return {
          sha: string(commit.sha),
          date: string(author.date),
          ...(typeof author.email === 'string' ? { email: author.email } : {}),
          ...(commit.author
            ? { username: identity(commit.author).username }
            : {}),
        };
      });
    },
    async file(context, path) {
      const response = await http.request(
        `${root(context)}/contents/${path.split('/').map(encodeURIComponent).join('/')}`,
        { ref: context.baseSha },
        'GET',
        undefined,
        true,
      );
      if (!response) return null;
      const raw = object(response.data);
      if (raw.encoding !== 'base64')
        throw new ReviewerError(
          'UNSUPPORTED',
          'GitHub file content is unavailable in base64.',
        );
      return Buffer.from(string(raw.content), 'base64').toString('utf8');
    },
    async owners(context, owners, members) {
      const resolved = new Set<string>();
      const candidates = new Map(
        members
          .filter((m) => m.access >= 0.6 && m.active && !m.bot)
          .map((m) => [m.username.toLowerCase(), m.username]),
      );
      for (const owner of owners) {
        if (owner.includes('/')) {
          const [org, team] = owner.split('/');
          if (
            !org ||
            org !== context.repository.split('/')[0]?.toLowerCase() ||
            !team
          )
            continue;
          const access = await http.request(
            `orgs/${encodeURIComponent(org)}/teams/${encodeURIComponent(team)}/repos/${context.repository.split('/').map(encodeURIComponent).join('/')}`,
            {},
            'GET',
            undefined,
            true,
          );
          if (!access || object(object(access.data).permissions).push !== true)
            continue;
          for (const value of await http.pages(
            `orgs/${encodeURIComponent(org)}/teams/${encodeURIComponent(team)}/members`,
          )) {
            const username = identity(value).username.toLowerCase();
            if (candidates.has(username)) resolved.add(username);
          }
        } else if (owner.includes('@')) {
          for (const member of members)
            if (
              member.emails.some((email) => email.toLowerCase() === owner) &&
              candidates.has(member.username.toLowerCase())
            )
              resolved.add(member.username);
        } else if (candidates.has(owner)) resolved.add(owner);
      }
      return [...resolved];
    },
    async loads(context) {
      const loads: Record<string, number> = Object.create(null) as Record<
        string,
        number
      >;
      for (const value of await http.pages(`${root(context)}/pulls`, {
        state: 'open',
      })) {
        const request = object(value);
        if (number(request.number) === context.number) continue;
        for (const reviewer of array(request.requested_reviewers)) {
          const username = identity(reviewer).username.toLowerCase();
          loads[username] = (loads[username] ?? 0) + 1;
        }
      }
      return loads;
    },
    async assign(context, reviewers) {
      await http.request(
        `${root(context)}/pulls/${context.number}/requested_reviewers`,
        {},
        'POST',
        { reviewers: reviewers.map((r) => r.username) },
      );
    },
  };
}
