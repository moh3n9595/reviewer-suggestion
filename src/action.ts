import { ReviewerError } from './errors.js';
import { parseConfig } from './config.js';
import { object, number, string } from './http.js';
import { createGitHubProvider } from './providers/github.js';
import { createGitLabProvider } from './providers/gitlab.js';
import { assignReviewers, suggestReviewers } from './service.js';
import type { ProviderOptions, ReviewerProvider } from './types.js';

/** Action boundary supplied by the runner; values are never executed as code. */
export interface ActionEnvironment {
  input(name: string): string;
  event: unknown;
  provider?: (
    platform: 'github' | 'gitlab',
    options: ProviderOptions,
  ) => ReviewerProvider;
  output(name: string, value: string): Promise<void>;
  summary(value: string): Promise<void>;
}
const escape = (value: string): string =>
  value.replace(/[&<>|\r\n]/g, (char) => `&#${char.charCodeAt(0)};`);

/** Run the Action from explicit inputs or GitHub event metadata. Writes only when assign=true. */
export async function runAction(io: ActionEnvironment): Promise<void> {
  const platform = io.input('provider') || 'github';
  if (platform !== 'github' && platform !== 'gitlab')
    throw new ReviewerError('INVALID_OPTIONS', 'Unknown provider.');
  const assign = io.input('assign') || 'false';
  if (assign !== 'true' && assign !== 'false')
    throw new ReviewerError('INVALID_OPTIONS', 'assign must be true or false.');
  if (platform === 'gitlab' && (!io.input('repository') || !io.input('number')))
    throw new ReviewerError(
      'INVALID_OPTIONS',
      'GitLab requires explicit repository and number inputs.',
    );
  const event = object(io.event);
  const repository =
    io.input('repository') || string(object(event.repository).full_name);
  const requestNumber = io.input('number');
  const request = {
    repository,
    number: requestNumber
      ? Number(requestNumber)
      : number(object(event.pull_request).number),
  };
  const connection: ProviderOptions = {
    token: io.input('token'),
    ...(io.input('api-url') ? { apiUrl: io.input('api-url') } : {}),
  };
  const provider = io.provider
    ? io.provider(platform, connection)
    : platform === 'github'
      ? createGitHubProvider(connection)
      : createGitLabProvider(connection);
  const configPath = io.input('config-path');
  let config = {};
  if (configPath) {
    const context = await provider.context(request);
    const content = await provider.file(context, configPath);
    if (content === null)
      throw new ReviewerError(
        'INVALID_OPTIONS',
        'Requested configuration file was not found at the base revision.',
      );
    config = parseConfig(content);
  }
  const limit = io.input('limit');
  const result = await suggestReviewers(provider, request, {
    ...config,
    ...(limit ? { limit: Number(limit) } : {}),
  });
  const assignment =
    assign === 'true'
      ? await assignReviewers(provider, request, result.selected)
      : { assigned: [], skipped: [], failed: [] };
  await io.output(
    'reviewers',
    JSON.stringify(result.selected.map((r) => r.username)),
  );
  await io.output('result', JSON.stringify(result));
  await io.output('assignment', JSON.stringify(assignment));
  await io.summary(
    `## Reviewer suggestions\n\n| Reviewer | Score | Reason |\n| --- | ---: | --- |\n${result.selected.map((r) => `| ${escape(r.username)} | ${r.score.toFixed(4)} | ${r.reason} |`).join('\n')}\n\n${result.partial ? 'Some optional signals were unavailable. Inspect result.warnings.\n' : ''}`,
  );
  if (assignment.failed.length)
    throw new ReviewerError(
      'ASSIGNMENT_FAILED',
      'Some reviewers could not be assigned. Inspect the assignment output.',
    );
}
