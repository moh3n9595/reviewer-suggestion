import { ReviewerError } from './errors.js';
import type { ProviderOptions } from './types.js';

/** Validate an API object without trusting JSON response types. */
export function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new ReviewerError('INVALID_RESPONSE', 'Expected an API object.');
  return value as Record<string, unknown>;
}
/** Validate an API array. */
export function array(value: unknown): unknown[] {
  if (!Array.isArray(value))
    throw new ReviewerError('INVALID_RESPONSE', 'Expected an API array.');
  return value as unknown[];
}
/** Read a required string from an API object. */
export function string(value: unknown): string {
  if (typeof value !== 'string')
    throw new ReviewerError('INVALID_RESPONSE', 'Expected an API string.');
  return value;
}
/** Read an API identifier without coercing absent or malformed values. */
export function id(value: unknown): string {
  if (
    typeof value !== 'string' &&
    (typeof value !== 'number' || !Number.isSafeInteger(value))
  )
    throw new ReviewerError('INVALID_RESPONSE', 'Expected an API identifier.');
  return String(value);
}
/** Read a finite API number. */
export function number(value: unknown): number {
  if (typeof value !== 'number' || !Number.isFinite(value))
    throw new ReviewerError('INVALID_RESPONSE', 'Expected an API number.');
  return value;
}

/** Bounded HTTP client; retries reads only and never logs response bodies. */
export class HttpClient {
  readonly base: URL;
  private readonly fetcher: typeof fetch;
  private readonly concurrency: number;
  private active = 0;
  private readonly waiting: (() => void)[] = [];
  /** @param apiUrl API root. @param options Request policy. @param headers Authentication headers. */
  constructor(
    apiUrl: string,
    private readonly options: ProviderOptions,
    private readonly headers: Record<string, string>,
  ) {
    try {
      this.base = new URL(apiUrl.endsWith('/') ? apiUrl : `${apiUrl}/`);
    } catch {
      throw new ReviewerError('INVALID_OPTIONS', 'Invalid API URL.');
    }
    if (
      this.base.protocol !== 'https:' ||
      this.base.username ||
      this.base.password ||
      this.base.search ||
      this.base.hash
    )
      throw new ReviewerError(
        'INVALID_OPTIONS',
        'API URL must be an HTTPS URL without credentials, query, or fragment.',
      );
    if (!options.token.trim())
      throw new ReviewerError(
        'INVALID_OPTIONS',
        'A provider token is required.',
      );
    this.fetcher = options.fetch ?? fetch;
    this.concurrency = options.concurrency ?? 5;
    for (const [key, value, min] of [
      ['concurrency', this.concurrency, 1],
      ['timeoutMs', options.timeoutMs ?? 15000, 1],
      ['retries', options.retries ?? 2, 0],
      ['maxPages', options.maxPages ?? 100, 1],
    ] as const) {
      if (!Number.isInteger(value) || value < min)
        throw new ReviewerError('INVALID_OPTIONS', `${key} is invalid.`);
    }
  }
  private async slot<T>(run: () => Promise<T>): Promise<T> {
    if (this.active >= this.concurrency)
      await new Promise<void>((resolve) => this.waiting.push(resolve));
    else this.active++;
    try {
      return await run();
    } finally {
      const next = this.waiting.shift();
      if (next) next();
      else this.active--;
    }
  }
  request(
    path: string,
    query?: Record<string, string | number>,
    method?: string,
    body?: unknown,
    optional?: false,
  ): Promise<{ data: unknown; headers: Headers }>;
  request(
    path: string,
    query: Record<string, string | number>,
    method: string,
    body: unknown,
    optional: true,
  ): Promise<{ data: unknown; headers: Headers } | null>;
  /** Send a JSON request; null represents a missing optional resource only. */
  async request(
    path: string,
    query: Record<string, string | number> = {},
    method = 'GET',
    body?: unknown,
    optional = false,
  ): Promise<{ data: unknown; headers: Headers } | null> {
    const url = new URL(path, this.base);
    if (
      url.origin !== this.base.origin ||
      !url.pathname.startsWith(this.base.pathname)
    )
      throw new ReviewerError(
        'INVALID_OPTIONS',
        'API path escapes configured root.',
      );
    for (const [key, value] of Object.entries(query))
      url.searchParams.set(key, String(value));
    const retries = method === 'GET' ? (this.options.retries ?? 2) : 0;
    for (let attempt = 0; ; attempt++) {
      this.options.signal?.throwIfAborted();
      const response = await this.slot(async () => {
        const signal = AbortSignal.any([
          AbortSignal.timeout(this.options.timeoutMs ?? 15000),
          ...(this.options.signal ? [this.options.signal] : []),
        ]);
        try {
          return await this.fetcher(url, {
            method,
            headers: {
              Accept: 'application/json',
              'Content-Type': 'application/json',
              ...this.headers,
            },
            signal,
            redirect: 'error',
            ...(body === undefined ? {} : { body: JSON.stringify(body) }),
          });
        } catch {
          throw new ReviewerError(
            this.options.signal?.aborted ? 'CANCELLED' : 'NETWORK_ERROR',
            'Provider request failed or timed out.',
          );
        }
      });
      if (optional && response.status === 404) return null;
      const rateLimited =
        response.status === 429 ||
        (response.status === 403 &&
          (response.headers.get('x-ratelimit-remaining') === '0' ||
            response.headers.has('retry-after')));
      if (!response.ok) {
        if ((rateLimited || response.status >= 500) && attempt < retries) {
          const retry = response.headers.get('retry-after');
          const reset = response.headers.get('x-ratelimit-reset');
          const delay =
            retry === null
              ? reset === null
                ? 250 * 2 ** attempt
                : Number(reset) * 1000 - Date.now()
              : /^\d+$/.test(retry)
                ? Number(retry) * 1000
                : Date.parse(retry) - Date.now();
          if (delay > 30000)
            throw new ReviewerError(
              'RATE_LIMIT',
              'Provider retry window exceeds request budget.',
            );
          await new Promise<void>((resolve) =>
            setTimeout(
              resolve,
              Math.max(0, Number.isFinite(delay) ? delay : 250),
            ),
          );
          continue;
        }
        throw new ReviewerError(
          rateLimited ? 'RATE_LIMIT' : `HTTP_${response.status}`,
          'Provider rejected the request.',
        );
      }
      if (response.status === 204)
        return { data: null, headers: response.headers };
      try {
        return {
          data: (await response.json()) as unknown,
          headers: response.headers,
        };
      } catch {
        throw new ReviewerError(
          'INVALID_RESPONSE',
          'Provider returned invalid JSON.',
        );
      }
    }
  }
  /** Collect paginated arrays, reporting truncation rather than silently losing data. */
  async pages(
    path: string,
    query: Record<string, string | number> = {},
    limit = Infinity,
  ): Promise<unknown[]> {
    const result: unknown[] = [];
    const pageSize = Math.min(100, limit);
    for (let page = 1; page <= (this.options.maxPages ?? 100); page++) {
      const response = await this.request(path, {
        ...query,
        per_page: pageSize,
        page,
      });
      const values = array(response.data);
      result.push(...values);
      if (result.length >= limit) return result.slice(0, limit);
      const next = response.headers.get('x-next-page');
      const link = response.headers.get('link');
      if (
        next === '' ||
        (next === null &&
          (link !== null
            ? !link.includes('rel="next"')
            : values.length < pageSize))
      )
        return result;
    }
    throw new ReviewerError(
      'TRUNCATED',
      'Provider pagination exceeded the configured page budget.',
    );
  }
}
