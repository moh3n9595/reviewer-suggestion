import { parseCodeOwners, resolveCodeOwners } from './codeowners.js';
import { errorCode, ReviewerError } from './errors.js';
import { rankReviewers, resolveOptions } from './ranking.js';
import type {
  AssignmentResult,
  Diagnostic,
  FileSignal,
  Identity,
  RankingOptions,
  RequestReference,
  ReviewerProvider,
  SuggestionResult,
} from './types.js';

function validateRequest(request: RequestReference): void {
  if (
    !request.repository.trim() ||
    !Number.isSafeInteger(request.number) ||
    request.number < 1
  )
    throw new ReviewerError(
      'INVALID_OPTIONS',
      'Repository and positive request number are required.',
    );
}

/**
 * Collect repository evidence and suggest reviewers without changing the request.
 * @param provider GitHub, GitLab, or an implementation of the provider contract.
 * @param request Repository and PR number/MR IID.
 * @param options Ranking options; optional failures are returned as warnings.
 * @returns Explained selections and captured request metadata.
 * @throws {@link ReviewerError} If essential context, eligibility, or options fail.
 */
export async function suggestReviewers(
  provider: ReviewerProvider,
  request: RequestReference,
  options: RankingOptions = {},
): Promise<SuggestionResult> {
  validateRequest(request);
  const opts = resolveOptions(options);
  provider.logger?.debug('Collecting reviewer evidence.', {
    provider: provider.platform,
  });
  const [context, fetchedMembers] = await Promise.all([
    provider.context(request),
    provider.members(request),
  ]);
  const members = fetchedMembers.map((member) => ({
    ...member,
    emails: [...member.emails],
  }));
  const warnings: Diagnostic[] = [];
  const optional = async <T>(
    operation: () => Promise<T>,
    fallback: T,
    label: string,
  ): Promise<T> => {
    try {
      return await operation();
    } catch (error) {
      const warning = {
        code: errorCode(error),
        message: `${label} unavailable.`,
      };
      warnings.push(warning);
      provider.logger?.warn(warning.message, { code: warning.code });
      return fallback;
    }
  };
  for (const member of members)
    for (const [email, username] of Object.entries(opts.aliases))
      if (member.username.toLowerCase() === username.toLowerCase())
        member.emails = [...member.emails, email];
  let content = '';
  const locations =
    provider.platform === 'github'
      ? ['.github/CODEOWNERS', 'CODEOWNERS', 'docs/CODEOWNERS']
      : ['CODEOWNERS', 'docs/CODEOWNERS', '.gitlab/CODEOWNERS'];
  await optional(
    async () => {
      for (const location of locations) {
        const file = await provider.file(context, location);
        if (file !== null) {
          content = file;
          break;
        }
      }
    },
    undefined,
    'CODEOWNERS',
  );
  const rules = parseCodeOwners(content, provider.platform);
  const histories = new Map<string, Promise<FileSignal['contributions']>>();
  const owners = new Map<string, Promise<string[]>>();
  const history = (path: string): Promise<FileSignal['contributions']> => {
    if (!histories.has(path))
      histories.set(
        path,
        optional(
          () => provider.history(context, path, opts.historyLimit),
          [],
          'Commit history',
        ),
      );
    return histories.get(path) as Promise<FileSignal['contributions']>;
  };
  const [files, loads] = await Promise.all([
    Promise.all(
      [...new Map(context.files.map((file) => [file.path, file])).values()].map(
        async (file) => {
          let historySource = file.previousPath ?? file.path;
          let contributions = await history(historySource);
          const parent = historySource.includes('/')
            ? historySource.slice(0, historySource.lastIndexOf('/'))
            : '';
          if (!contributions.length && parent) {
            historySource = parent;
            contributions = await history(parent);
          }
          const refs = resolveCodeOwners(file.path, rules);
          const key = JSON.stringify(refs);
          if (!owners.has(key))
            owners.set(
              key,
              optional(
                () => provider.owners(context, refs, members),
                [],
                'Owner resolution',
              ),
            );
          return {
            path: file.path,
            historySource,
            contributions,
            owners: await (owners.get(key) as Promise<string[]>),
          };
        },
      ),
    ),
    optional(
      async () => {
        const known = await provider.loads(context);
        return Object.fromEntries(
          members.map((member) => [
            member.username.toLowerCase(),
            known[member.username.toLowerCase()] ?? 0,
          ]),
        );
      },
      {},
      'Review workload',
    ),
  ]);
  warnings.sort(
    (a, b) =>
      a.code.localeCompare(b.code) || a.message.localeCompare(b.message),
  );
  const result = rankReviewers(
    { context, members, files, loads, warnings },
    opts,
  );
  provider.logger?.info('Reviewer suggestions ready.', {
    selected: result.selected.length,
    partial: result.partial,
  });
  return result;
}

/**
 * Explicitly request reviews, preserving existing assignments.
 * Revalidates eligibility and re-reads assignment state after ambiguous writes.
 * @param provider Provider with write-capable credentials.
 * @param request Repository and PR number/MR IID.
 * @param reviewers Provider-qualified identities, normally from suggestion results.
 * @returns Assigned, already assigned, and failed identities; no automatic removals.
 * @throws {@link ReviewerError} For closed/draft requests, invalid identities, or missing essential context.
 * @remarks Provider APIs cannot guarantee atomicity against concurrent external edits.
 */
export async function assignReviewers(
  provider: ReviewerProvider,
  request: RequestReference,
  reviewers: Identity[],
): Promise<AssignmentResult> {
  validateRequest(request);
  const [context, members] = await Promise.all([
    provider.context(request),
    provider.members(request),
  ]);
  if (context.state !== 'open' || context.draft)
    throw new ReviewerError(
      'NOT_ASSIGNABLE',
      'Request must be open and ready for review.',
    );
  const unique = [
    ...new Map(reviewers.map((reviewer) => [reviewer.id, reviewer])).values(),
  ];
  for (const reviewer of unique) {
    if (
      reviewer.provider !== provider.platform ||
      reviewer.host !== provider.host ||
      !members.some(
        (m) =>
          m.id === reviewer.id &&
          m.username.toLowerCase() === reviewer.username.toLowerCase() &&
          m.active &&
          !m.bot &&
          m.access >= 0.6,
      ) ||
      reviewer.username.toLowerCase() === context.author.toLowerCase()
    )
      throw new ReviewerError(
        'INELIGIBLE',
        'Reviewer identity or eligibility could not be verified.',
      );
  }
  const skipped = unique.filter((r) =>
    context.existingReviewers.some((e) => e.id === r.id),
  );
  const pending = unique.filter((r) => !skipped.includes(r));
  if (!pending.length) return { assigned: [], skipped, failed: [] };
  try {
    await provider.assign(context, pending);
    provider.logger?.info('Reviewers assigned.', { count: pending.length });
    return { assigned: pending, skipped, failed: [] };
  } catch (error) {
    provider.logger?.warn('Assignment requires reconciliation.', {
      code: errorCode(error),
    });
    try {
      const current = await provider.context(request);
      return {
        assigned: pending.filter((r) =>
          current.existingReviewers.some((e) => e.id === r.id),
        ),
        skipped,
        failed: pending
          .filter((r) => !current.existingReviewers.some((e) => e.id === r.id))
          .map((reviewer) => ({ reviewer, code: errorCode(error) })),
      };
    } catch {
      return {
        assigned: [],
        skipped,
        failed: pending.map((reviewer) => ({
          reviewer,
          code: 'ASSIGNMENT_UNCONFIRMED',
        })),
      };
    }
  }
}
