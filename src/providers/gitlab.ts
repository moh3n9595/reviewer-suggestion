import { ReviewerError } from '../errors.js';
import { array, HttpClient, id, number, object, string } from '../http.js';
import type {
  Identity,
  Member,
  ProviderOptions,
  RequestReference,
  ReviewerProvider,
} from '../types.js';

/**
 * Create a GitLab REST provider, including Self-Managed hosts.
 * @param options Token and optional full API root (ending in /api/v4).
 * @returns A provider; creation performs no network requests.
 * @throws {@link ReviewerError} For invalid authentication or transport configuration.
 * @example
 * ```ts
 * const provider = createGitLabProvider({ token: process.env.GITLAB_TOKEN! });
 * ```
 */
export function createGitLabProvider(
  options: ProviderOptions,
): ReviewerProvider {
  const http = new HttpClient(
    options.apiUrl ?? 'https://gitlab.com/api/v4',
    options,
    { 'PRIVATE-TOKEN': options.token },
  );
  const host = http.base.origin;
  const identity = (value: unknown): Identity => {
    const user = object(value);
    return {
      provider: 'gitlab',
      host,
      id: id(user.id),
      username: string(user.username),
    };
  };
  const root = (request: RequestReference): string =>
    `projects/${encodeURIComponent(request.repository)}`;
  const member = (value: unknown): Member => {
    const raw = object(value);
    const access = number(raw.access_level);
    return {
      ...identity(raw),
      active: raw.state === 'active',
      bot:
        raw.bot === true ||
        /^(project|group)_\d+_bot/.test(string(raw.username)),
      access: access >= 50 ? 1 : access >= 40 ? 0.9 : access >= 30 ? 0.6 : 0,
      emails: typeof raw.email === 'string' ? [raw.email] : [],
    };
  };
  const eligibleGroups = async (
    request: RequestReference,
  ): Promise<Set<string>> => {
    const project = object((await http.request(root(request))).data);
    const groups = new Set<string>();
    const addShares = (resource: Record<string, unknown>): void => {
      for (const value of array(resource.shared_with_groups)) {
        const share = object(value);
        if (number(share.group_access_level) >= 30)
          groups.add(id(share.group_id));
      }
    };
    addShares(project);
    const namespace = object(project.namespace);
    let parent: unknown = namespace.kind === 'group' ? namespace.id : null;
    const visited = new Set<string>();
    while (parent !== null) {
      const groupId = id(parent);
      if (visited.has(groupId) || visited.size >= 100)
        throw new ReviewerError('INVALID_RESPONSE', 'Invalid group ancestry.');
      visited.add(groupId);
      groups.add(groupId);
      const group = object(
        (await http.request(`groups/${encodeURIComponent(groupId)}`)).data,
      );
      addShares(group);
      parent = group.parent_id;
    }
    return groups;
  };
  return {
    platform: 'gitlab',
    host,
    ...(options.logger ? { logger: options.logger } : {}),
    async context(request) {
      const path = `${root(request)}/merge_requests/${request.number}`;
      const raw = object((await http.request(path)).data);
      const diffs = await http.pages(`${path}/diffs`);
      if (
        typeof raw.changes_count !== 'string' ||
        raw.changes_count.endsWith('+') ||
        Number(raw.changes_count) !== diffs.length
      )
        throw new ReviewerError(
          'TRUNCATED',
          'GitLab changed-file list is incomplete.',
        );
      const branch = object(
        (
          await http.request(
            `${root(request)}/repository/branches/${encodeURIComponent(string(raw.target_branch))}`,
          )
        ).data,
      );
      return {
        ...request,
        author: identity(raw.author).username,
        existingReviewers: array(raw.reviewers).map(identity),
        baseSha: string(object(branch.commit).id),
        state: raw.state === 'opened' ? 'open' : 'closed',
        draft: raw.draft === true || raw.work_in_progress === true,
        files: diffs.map((value) => {
          const file = object(value);
          return {
            path: string(file.new_path),
            status:
              file.new_file === true
                ? 'added'
                : file.deleted_file === true
                  ? 'deleted'
                  : file.renamed_file === true
                    ? 'renamed'
                    : 'modified',
            ...(file.renamed_file === true
              ? { previousPath: string(file.old_path) }
              : {}),
          };
        }),
      };
    },
    async members(request) {
      return (await http.pages(`${root(request)}/members/all`)).map(member);
    },
    async history(context, path, limit) {
      return (
        await http.pages(
          `${root(context)}/repository/commits`,
          { path, ref_name: context.baseSha },
          limit,
        )
      ).map((value) => {
        const raw = object(value);
        return {
          sha: string(raw.id),
          date: string(raw.authored_date),
          ...(typeof raw.author_email === 'string'
            ? { email: raw.author_email }
            : {}),
        };
      });
    },
    async file(context, path) {
      const response = await http.request(
        `${root(context)}/repository/files/${encodeURIComponent(path)}`,
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
          'GitLab file content is unavailable in base64.',
        );
      return Buffer.from(string(raw.content), 'base64').toString('utf8');
    },
    async owners(context, owners, members) {
      const resolved = new Set<string>();
      const eligible = members.filter(
        (m) => m.access >= 0.6 && m.active && !m.bot,
      );
      let direct: Member[] | undefined;
      let groups: Set<string> | undefined;
      for (const owner of owners) {
        if (owner.startsWith('@@')) {
          const role = owner.slice(2).replace(/s$/, '');
          const level = (
            { developer: 0.6, maintainer: 0.9, owner: 1 } as Record<
              string,
              number
            >
          )[role];
          if (level === undefined) continue;
          direct ??= (await http.pages(`${root(context)}/members`)).map(member);
          for (const person of direct)
            if (
              person.access === level &&
              eligible.some((e) => e.id === person.id)
            )
              resolved.add(person.username);
          continue;
        }
        const users = eligible.filter(
          (m) =>
            m.username.toLowerCase() === owner ||
            m.emails.some((email) => email.toLowerCase() === owner),
        );
        if (users.length) {
          for (const user of users) resolved.add(user.username);
          continue;
        }
        if (owner.includes('@')) continue;
        const group = await http.request(
          `groups/${encodeURIComponent(owner)}`,
          {},
          'GET',
          undefined,
          true,
        );
        if (!group) continue;
        groups ??= await eligibleGroups(context);
        if (!groups.has(id(object(group.data).id))) continue;
        for (const raw of await http.pages(
          `groups/${id(object(group.data).id)}/members`,
        )) {
          const person = identity(raw);
          if (eligible.some((e) => e.id === person.id))
            resolved.add(person.username);
        }
      }
      return [...resolved];
    },
    async loads(context) {
      const loads: Record<string, number> = Object.create(null) as Record<
        string,
        number
      >;
      for (const value of await http.pages(`${root(context)}/merge_requests`, {
        state: 'opened',
        scope: 'all',
      })) {
        const request = object(value);
        if (number(request.iid) === context.number) continue;
        const reviewers = await http.pages(
          `${root(context)}/merge_requests/${number(request.iid)}/reviewers`,
        );
        for (const value of reviewers) {
          const review = object(value);
          if (review.state === 'reviewed') continue;
          if (review.state !== 'unreviewed')
            throw new ReviewerError(
              'UNSUPPORTED',
              'Unknown GitLab reviewer state.',
            );
          const username = identity(review.user).username.toLowerCase();
          loads[username] = (loads[username] ?? 0) + 1;
        }
      }
      return loads;
    },
    async assign(context, reviewers) {
      await http.request(
        `${root(context)}/merge_requests/${context.number}`,
        {},
        'PUT',
        {
          reviewer_ids: [
            ...new Set(
              [...context.existingReviewers, ...reviewers].map((r) => r.id),
            ),
          ],
        },
      );
    },
  };
}
