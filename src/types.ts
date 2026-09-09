/** Supported repository hosting providers. */
export type Platform = 'github' | 'gitlab';
/** Provider-qualified identity; IDs are strings to avoid numeric assumptions. */
export interface Identity {
  /** Hosting platform; combine with host and ID when comparing identities. */
  provider: Platform;
  /** API origin, such as `https://api.github.com`; excludes the API path. */
  host: string;
  /** Provider-assigned account ID, represented as a string. */
  id: string;
  /** Provider-linked login; display names are never identity evidence. */
  username: string;
}
/** A candidate whose repository permissions have been established. */
export interface Member extends Identity {
  active: boolean;
  bot: boolean;
  /** Normalized permission score: writer .6, maintainer .9, administrator 1. */
  access: number;
  /** Only known, unambiguous emails should be supplied. */
  emails: string[];
}
/** Repository identifier and pull/merge request number (GitLab IID). */
export interface RequestReference {
  /** GitHub owner/repo; GitLab numeric project ID or namespace/project. */
  repository: string;
  number: number;
}
/** Captured request state; history/configuration are read at baseSha. */
export interface RequestContext extends RequestReference {
  author: string;
  existingReviewers: Identity[];
  baseSha: string;
  state: 'open' | 'closed';
  draft: boolean;
  files: ChangedFile[];
}
/** A changed file; previousPath preserves history for renames. */
export interface ChangedFile {
  path: string;
  previousPath?: string;
  status: 'added' | 'modified' | 'renamed' | 'deleted';
}
/** Historical commit author with optional provider-linked identity. */
export interface Contribution {
  sha: string;
  username?: string;
  email?: string;
  date: string;
}
/** Normalized historical and ownership evidence for one changed file. */
export interface FileSignal {
  path: string;
  contributions: Contribution[];
  owners: string[];
  historySource: string;
}
/** Machine-readable diagnostic without response bodies or credentials. */
export interface Diagnostic {
  code: string;
  message: string;
}
/** Serializable input to the pure ranking function. */
export interface ReviewerSnapshot {
  context: RequestContext;
  members: Member[];
  files: FileSignal[];
  /** Missing key means unavailable; zero means successfully observed no load. */
  loads: Record<string, number>;
  warnings: Diagnostic[];
}
/** Normalized values and configurable weights for the five ranking signals. */
export interface Scores {
  expertise: number;
  ownership: number;
  recency: number;
  access: number;
  availability: number;
}
/** Ranking configuration. All fields are optional and validated at runtime. */
export interface RankingOptions {
  /** Maximum selections, including fallback selections. @defaultValue 2 */
  limit?: number;
  /** Inclusive score threshold in the range zero to one. @defaultValue 0.05 */
  minScore?: number;
  /** Maximum history commits collected per distinct path. @defaultValue 30 */
  historyLimit?: number;
  /** Pending reviews at which availability reaches zero. @defaultValue 8 */
  maxReviewLoad?: number;
  /** Positive number of days before recency evidence halves. @defaultValue 30 */
  halfLifeDays?: number;
  /** Positive age cutoff in days for recency evidence. @defaultValue 180 */
  horizonDays?: number;
  /** Defaults to captured current time; use an ISO string for reproducible runs. */
  now?: string;
  /** Case-insensitive usernames to exclude. @defaultValue [] */
  exclude?: string[];
  /** Explicit email → username aliases; never guesses using display names. */
  aliases?: Record<string, string>;
  /** Overrides merged with DEFAULT_WEIGHTS; resulting weights must sum to one. */
  weights?: Partial<Scores>;
  /** Defaults to false; activates only when normal selection is empty. */
  fallback?: boolean;
}
/** A ranked reviewer and the evidence explaining their score. */
export interface ScoredCandidate extends Identity {
  /** Weighted sum of the normalized signals, between zero and one. */
  score: number;
  /** Unweighted signal values, each between zero and one. */
  breakdown: Scores;
  /** Deduplicated paths that justify contribution and ownership signals. */
  evidence: {
    contributedFiles: string[];
    ownedFiles: string[];
    /** Changed path → history path; exposes parent-directory proxies. */ historySources: Record<
      string,
      string
    >;
  };
  reason:
    'ranked' | 'owner-fallback' | 'maintainer-fallback' | 'member-fallback';
}
/** Suggested reviewers, diagnostics, and captured request context. */
export interface SuggestionResult {
  /** Ranked suggestions in stable score, normalized username, and ID order. */
  selected: ScoredCandidate[];
  /** Up to three eligible candidates with evidence below the score threshold. */
  belowThreshold: ScoredCandidate[];
  /** Safe diagnostics for optional collection failures and truncated signals. */
  warnings: Diagnostic[];
  /** True when optional collection produced warnings. */
  partial: boolean;
  /** Captured request context; assignment always refreshes it before writing. */
  context: RequestContext;
}
/** Result of explicit assignment. Failures never masquerade as success. */
export interface AssignmentResult {
  /** New assignments confirmed by a successful write or reconciliation read. */
  assigned: Identity[];
  /** Reviewers already present when assignment refreshed the request. */
  skipped: Identity[];
  /** Requested identities that could not be confirmed as assigned. */
  failed: { reviewer: Identity; code: string }[];
}
/** Transport configuration; tokens are supplied by the caller, never logged. */
export interface ProviderOptions {
  /** Optional Consola-compatible observer; defaults to silent operation. */
  logger?: Logger;
  /** API credential; kept in transport headers and omitted from diagnostics. */
  token: string;
  /** Full API root, including /api/v3 or /api/v4 on custom hosts. */
  apiUrl?: string;
  /** Injectable Fetch implementation; defaults to the Node.js global fetch. */
  fetch?: typeof fetch;
  /** Cancels queued and active requests for this provider instance. */
  signal?: AbortSignal;
  /** Positive timeout per HTTP attempt in milliseconds. @defaultValue 15000 */
  timeoutMs?: number;
  /** Extra attempts for rate-limited/server-failed reads. @defaultValue 2 */
  retries?: number;
  /** Maximum simultaneous HTTP attempts for this provider. @defaultValue 5 */
  concurrency?: number;
  /** Pagination safety bound; hitting it reports truncation. @defaultValue 100 */
  maxPages?: number;
}
/** Extension contract for repository providers; all writes are explicit. */
export interface ReviewerProvider {
  readonly logger?: Logger;
  readonly platform: Platform;
  readonly host: string;
  /** Fetch complete changed-file and request metadata; failures are essential. */
  context(request: RequestReference): Promise<RequestContext>;
  /** Enumerate repository members including inherited access; failures are essential. */
  members(request: RequestReference): Promise<Member[]>;
  /** Fetch at most limit commits at the captured base revision. */
  history(
    context: RequestContext,
    path: string,
    limit: number,
  ): Promise<Contribution[]>;
  /** Read a UTF-8 file at baseSha; return null only for a missing file. */
  file(context: RequestContext, path: string): Promise<string | null>;
  /** Expand ownership references to eligible individual usernames. */
  owners(
    context: RequestContext,
    owners: string[],
    members: Member[],
  ): Promise<string[]>;
  /** Count repository-local pending reviews, excluding the current request. */
  loads(context: RequestContext): Promise<Record<string, number>>;
  /** Write additional reviewers; preserve current existing reviewers. */
  assign(context: RequestContext, reviewers: Identity[]): Promise<void>;
}

/** Optional structured logger compatible with Consola; omitted means silent. */
export interface Logger {
  /** Report collection progress without sensitive values. */
  debug(message: string, context?: Record<string, unknown>): void;
  /** Report completed suggestion/assignment counts. */
  info(message: string, context?: Record<string, unknown>): void;
  /** Report safe diagnostic codes for partial or failed operations. */
  warn(message: string, context?: Record<string, unknown>): void;
}
