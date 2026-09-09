import { ReviewerError } from './errors.js';
import type {
  Contribution,
  Member,
  RankingOptions,
  ReviewerSnapshot,
  Scores,
  ScoredCandidate,
  SuggestionResult,
} from './types.js';

/** Default weights; custom weights must sum to one. */
export const DEFAULT_WEIGHTS: Readonly<Scores> = Object.freeze({
  expertise: 0.45,
  ownership: 0.25,
  recency: 0.15,
  access: 0.1,
  availability: 0.05,
});
const defaults = {
  limit: 2,
  minScore: 0.05,
  historyLimit: 30,
  maxReviewLoad: 8,
  halfLifeDays: 30,
  horizonDays: 180,
  fallback: false,
};
const keys = Object.keys(DEFAULT_WEIGHTS) as (keyof Scores)[];
const lower = (value: string): string => value.toLowerCase();
const clamp = (n: number): number =>
  Number.isFinite(n) ? Math.max(0, Math.min(1, n)) : 0;
const compare = (a: string, b: string): number => Number(a > b) - Number(a < b);

/** Validate ranking options and capture a single clock value for the entire run. */
export function resolveOptions(options: RankingOptions) {
  const result = {
    ...defaults,
    ...options,
    now: options.now ?? new Date().toISOString(),
    exclude: options.exclude ?? [],
    aliases: options.aliases ?? {},
    weights: { ...DEFAULT_WEIGHTS, ...options.weights },
  };
  for (const key of ['limit', 'historyLimit', 'maxReviewLoad'] as const) {
    if (
      !Number.isInteger(result[key]) ||
      result[key] < (key === 'limit' ? 0 : 1)
    )
      throw new ReviewerError(
        'INVALID_OPTIONS',
        `${key} must be a valid nonnegative count.`,
      );
  }
  for (const key of ['minScore', 'halfLifeDays', 'horizonDays'] as const) {
    if (
      !Number.isFinite(result[key]) ||
      result[key] < 0 ||
      (key !== 'minScore' && result[key] === 0)
    )
      throw new ReviewerError('INVALID_OPTIONS', `${key} is out of range.`);
  }
  if (
    result.minScore > 1 ||
    !Number.isFinite(Date.parse(result.now)) ||
    typeof result.fallback !== 'boolean' ||
    !Array.isArray(result.exclude) ||
    !result.exclude.every((x) => typeof x === 'string') ||
    typeof result.aliases !== 'object' ||
    Array.isArray(result.aliases) ||
    !Object.values(result.aliases).every((x) => typeof x === 'string')
  )
    throw new ReviewerError('INVALID_OPTIONS', 'Invalid ranking options.');
  if (
    keys.some(
      (key) => !Number.isFinite(result.weights[key]) || result.weights[key] < 0,
    ) ||
    Math.abs(keys.reduce((n, key) => n + result.weights[key], 0) - 1) > 1e-9
  )
    throw new ReviewerError(
      'INVALID_OPTIONS',
      'Weights must be nonnegative and sum to one.',
    );
  return result;
}

function authorResolver(
  members: Member[],
  aliases: Record<string, string>,
): (commit: Contribution) => string | undefined {
  const emails = new Map<string, Set<string>>();
  for (const member of members)
    for (const email of member.emails) {
      const key = lower(email);
      const owners = emails.get(key) ?? new Set<string>();
      owners.add(lower(member.username));
      emails.set(key, owners);
    }
  for (const [email, username] of Object.entries(aliases))
    emails.set(lower(email), new Set([lower(username)]));
  return (commit) => {
    if (commit.username) return lower(commit.username);
    const owners = emails.get(lower(commit.email ?? ''));
    return owners?.size === 1 ? [...owners][0] : undefined;
  };
}

/**
 * Rank normalized repository evidence deterministically without network requests.
 * @param snapshot - Captured request, candidates, file evidence, and known review loads.
 * @param options - Ranking policy; defaults to two suggestions and no fallback.
 * @returns Explained rankings; no candidates is a successful empty result.
 * @throws {@link ReviewerError} For invalid ranking options.
 * @example
 * ```ts
 * const result = rankReviewers(snapshot, { limit: 2, now: '2026-01-01T00:00:00Z' });
 * ```
 */
export function rankReviewers(
  snapshot: ReviewerSnapshot,
  options: RankingOptions = {},
): SuggestionResult {
  const opts = resolveOptions(options);
  const forbidden = new Set(
    [
      snapshot.context.author,
      ...snapshot.context.existingReviewers.map((m) => m.username),
      ...opts.exclude,
    ].map(lower),
  );
  const members = [
    ...new Map(snapshot.members.map((member) => [member.id, member])).values(),
  ];
  const resolveAuthor = authorResolver(members, opts.aliases);
  const files = [
    ...new Map(snapshot.files.map((file) => [file.path, file])).values(),
  ];
  const now = Date.parse(opts.now);
  const scored: ScoredCandidate[] = members
    .filter(
      (m) =>
        m.active &&
        !m.bot &&
        m.access >= 0.6 &&
        !forbidden.has(lower(m.username)),
    )
    .map((member) => {
      const username = lower(member.username);
      let expertise = 0;
      let recency = 0;
      const contributedFiles: string[] = [];
      const ownedFiles: string[] = [];
      const historySources: Record<string, string> = {};
      for (const file of files) {
        const commits = [
          ...new Map(
            file.contributions
              .filter((c) => resolveAuthor(c) === username)
              .map((c) => [c.sha, c]),
          ).values(),
        ];
        if (commits.length) {
          contributedFiles.push(file.path);
          Object.defineProperty(historySources, file.path, {
            value: file.historySource,
            enumerable: true,
          });
        }
        expertise +=
          Math.log1p(Math.min(commits.length, opts.historyLimit)) /
          Math.log1p(opts.historyLimit);
        const dates = commits
          .map((c) => Date.parse(c.date))
          .filter(Number.isFinite);
        if (dates.length) {
          const age = Math.max(0, (now - Math.max(...dates)) / 86_400_000);
          if (age <= opts.horizonDays)
            recency += 2 ** (-age / opts.halfLifeDays);
        }
        if (file.owners.some((owner) => lower(owner) === username))
          ownedFiles.push(file.path);
      }
      const load = snapshot.loads[username];
      const breakdown: Scores = {
        expertise: expertise / (files.length || 1),
        ownership: ownedFiles.length / (files.length || 1),
        recency: recency / (files.length || 1),
        access: clamp(member.access),
        availability:
          load === undefined || !Number.isFinite(load) || load < 0
            ? 0
            : clamp(1 - load / opts.maxReviewLoad),
      };
      return {
        provider: member.provider,
        host: member.host,
        id: member.id,
        username: member.username,
        score: clamp(
          keys.reduce(
            (sum, key) => sum + breakdown[key] * opts.weights[key],
            0,
          ),
        ),
        breakdown,
        evidence: {
          contributedFiles: contributedFiles.sort(),
          ownedFiles: ownedFiles.sort(),
          historySources: Object.fromEntries(
            Object.entries(historySources).sort(([a], [b]) => compare(a, b)),
          ),
        },
        reason: 'ranked' as const,
      };
    })
    .sort(
      (a, b) =>
        b.score - a.score ||
        compare(lower(a.username), lower(b.username)) ||
        compare(a.id, b.id),
    );
  const evidenced = scored.filter(
    (c) =>
      c.evidence.contributedFiles.length + c.evidence.ownedFiles.length > 0,
  );
  let selected = evidenced
    .filter((c) => c.score >= opts.minScore)
    .slice(0, opts.limit);
  if (!selected.length && opts.fallback && files.length) {
    const tier = (c: ScoredCandidate): number =>
      c.evidence.ownedFiles.length ? 0 : c.breakdown.access >= 0.9 ? 1 : 2;
    selected = [...scored]
      .sort(
        (a, b) =>
          tier(a) - tier(b) ||
          b.score - a.score ||
          compare(lower(a.username), lower(b.username)),
      )
      .slice(0, opts.limit)
      .map((c) => ({
        ...c,
        reason: c.evidence.ownedFiles.length
          ? 'owner-fallback'
          : c.breakdown.access >= 0.9
            ? 'maintainer-fallback'
            : 'member-fallback',
      }));
  }
  return {
    selected,
    belowThreshold: evidenced
      .filter((c) => c.score < opts.minScore)
      .slice(0, 3),
    warnings: [...snapshot.warnings],
    partial: snapshot.warnings.length > 0,
    context: snapshot.context,
  };
}
