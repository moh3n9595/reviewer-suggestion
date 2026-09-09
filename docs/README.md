# Reviewer Suggestion

**Find reviewers who know the code—and explain why they fit.**

A deterministic TypeScript library, CLI, and GitHub Action for **GitHub and
GitLab**, including custom API hosts. Ranks repository members using commit
history, CODEOWNERS, recency, access, and current review load. No AI service,
telemetry, or runtime dependencies.

Every selection includes its five signal scores, contributed files, owned files,
history sources, and selection reason. Suggestions are read-only. Assignment is a
separate, explicit operation.

## Install

Requires Node.js **22.14 or newer**.

```sh
pnpm add reviewer-suggestion
# or: npm install reviewer-suggestion
```

The package provides ESM, CommonJS, TypeScript declarations, and the
`reviewer-suggestion` executable.

## Suggest reviewers

```ts
import { createGitHubProvider, suggestReviewers } from 'reviewer-suggestion';

const provider = createGitHubProvider({ token: process.env.GITHUB_TOKEN! });

const result = await suggestReviewers(
  provider,
  { repository: 'your-org/your-repo', number: 42 },
  { limit: 2 },
);

for (const reviewer of result.selected) {
  console.log(reviewer.username, reviewer.score, reviewer.breakdown);
}
```

For GitLab, use `createGitLabProvider` and the merge request **IID** (the number
shown in its URL), not its global database ID. Assignment is never implied by a
suggestion: call [`assignReviewers`](api/functions/assignReviewers.md)
explicitly.

## Where to go next

- [API overview](api/README.md) — every exported function, interface, and type,
  generated from the source TSDoc.
- [`suggestReviewers`](api/functions/suggestReviewers.md) and
  [`rankReviewers`](api/functions/rankReviewers.md) — network-backed and offline
  entry points.
- [`RankingOptions`](api/interfaces/RankingOptions.md) — limits, weights,
  aliases, and fallback behavior.
- [CLI, GitHub Action, ranking model, and authentication](https://github.com/moh3n9595/reviewer-suggestion#cli)
  — the repository README.
- [Releases](https://github.com/moh3n9595/reviewer-suggestion/releases) and the
  [changelog](https://github.com/moh3n9595/reviewer-suggestion/blob/main/CHANGELOG.md).
