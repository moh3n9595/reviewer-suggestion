/** Supported repository hosting providers. */
export type Platform = 'github' | 'gitlab';
/** Provider-qualified identity; IDs are strings to avoid numeric assumptions. */
export interface Identity {
  provider: Platform;
  host: string;
  id: string;
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
  limit?: number;
  minScore?: number;
  historyLimit?: number;
  maxReviewLoad?: number;
  halfLifeDays?: number;
  horizonDays?: number;
  /** Defaults to captured current time; use an ISO string for reproducible runs. */
  now?: string;
  exclude?: string[];
  /** Explicit email → username aliases; never guesses using display names. */
  aliases?: Record<string, string>;
  weights?: Partial<Scores>;
  /** Defaults to false; activates only when normal selection is empty. */
  fallback?: boolean;
}
/** A ranked reviewer and the evidence explaining their score. */
export interface ScoredCandidate extends Identity {
  score: number;
  breakdown: Scores;
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
  selected: ScoredCandidate[];
  belowThreshold: ScoredCandidate[];
  warnings: Diagnostic[];
  partial: boolean;
  context: RequestContext;
}
/** Result of explicit assignment. Failures never masquerade as success. */
export interface AssignmentResult {
  assigned: Identity[];
  skipped: Identity[];
  failed: { reviewer: Identity; code: string }[];
}
/** Transport configuration; tokens are supplied by the caller, never logged. */
export interface ProviderOptions {
  logger?: Logger;
  token: string;
  /** Full API root, including /api/v3 or /api/v4 on custom hosts. */
  apiUrl?: string;
  /** Injectable Fetch implementation; defaults to the Node.js global fetch. */
  fetch?: typeof fetch;
  signal?: AbortSignal;
  timeoutMs?: number;
  retries?: number;
  concurrency?: number;
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
