import { ReviewerError } from './errors.js';
import { object } from './http.js';
import { resolveOptions } from './ranking.js';
import type { RankingOptions } from './types.js';

const rankingKeys = new Set([
  'limit',
  'minScore',
  'historyLimit',
  'maxReviewLoad',
  'halfLifeDays',
  'horizonDays',
  'now',
  'exclude',
  'aliases',
  'weights',
  'fallback',
]);
/** Parse non-executable JSON configuration and reject unknown options. */
export function parseConfig(content: string): RankingOptions {
  try {
    const value = object(JSON.parse(content) as unknown);
    if (Object.keys(value).some((key) => !rankingKeys.has(key)))
      throw new Error('Unknown option');
    const config = value as RankingOptions;
    resolveOptions(config);
    return config;
  } catch {
    throw new ReviewerError(
      'INVALID_OPTIONS',
      'Configuration must contain valid JSON ranking options.',
    );
  }
}
