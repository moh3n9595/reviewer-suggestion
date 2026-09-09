import {
  createGitHubProvider,
  createGitLabProvider,
  suggestReviewers,
  assignReviewers,
  type Logger,
} from '../src/index.js';
const logger: Logger = {
  debug: console.debug,
  info: console.info,
  warn: console.warn,
};
const github = createGitHubProvider({
  token: 'provided-by-your-secret-store',
  logger,
});
const gitlab = createGitLabProvider({
  token: 'provided-by-your-secret-store',
  apiUrl: 'https://gitlab.example.com/api/v4',
});
export async function example(): Promise<void> {
  const request = { repository: 'org/repo', number: 42 };
  const result = await suggestReviewers(github, request);
  await assignReviewers(github, request, result.selected);
  await suggestReviewers(gitlab, request, {
    aliases: { 'alice@example.com': 'alice' },
  });
}
// Compile examples without contacting real repositories.
