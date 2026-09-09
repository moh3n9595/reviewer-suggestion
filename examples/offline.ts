import { rankReviewers, type ReviewerSnapshot } from '../src/index.js';
const snapshot: ReviewerSnapshot = {
  context: {
    repository: 'org/repo',
    number: 42,
    author: 'author',
    existingReviewers: [],
    baseSha: 'abc',
    state: 'open',
    draft: false,
    files: [{ path: 'src/index.ts', status: 'modified' }],
  },
  members: [
    {
      provider: 'github',
      host: 'https://api.github.com',
      id: '1',
      username: 'alice',
      active: true,
      bot: false,
      access: 0.6,
      emails: [],
    },
  ],
  files: [
    {
      path: 'src/index.ts',
      historySource: 'src/index.ts',
      owners: ['alice'],
      contributions: [{ sha: '123', username: 'alice', date: '2026-01-01' }],
    },
  ],
  loads: { alice: 0 },
  warnings: [],
};
console.log(rankReviewers(snapshot, { now: '2026-01-01' }).selected);
