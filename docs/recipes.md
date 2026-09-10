---
title: Recipes
---

# Recipes

Task-oriented configurations for common setups. All configuration is plain JSON with strict validation — unknown keys are rejected — and the same file works in the library, the CLI, and the Action.

## Small team

Small pools rarely need tuning. Pick one reviewer, keep the bot out, and enable fallback so quiet areas of the repository still get a reviewer:

```json
{
  "limit": 1,
  "exclude": ["automation-bot"],
  "fallback": true
}
```

Fallback selections are labeled (`owner-fallback`, `maintainer-fallback`, `member-fallback`), so you can always tell an evidence-based pick from a coverage pick.

## Monorepo

In a monorepo, ownership is usually the strongest signal and directory history stands in for brand-new files. Raise the history budget and shift weight toward ownership:

```json
{
  "historyLimit": 50,
  "weights": {
    "expertise": 0.35,
    "ownership": 0.35,
    "recency": 0.15,
    "access": 0.1,
    "availability": 0.05
  }
}
```

Files without their own history automatically consult their parent directory; `evidence.historySources` shows exactly when that proxy was used, so a suggestion for a new file remains explainable.

## GitLab CI

Run suggestions on merge requests using a project access token (`read_api`, Developer role or above) stored as a masked CI/CD variable named `GITLAB_TOKEN`. The job token is not a substitute — see [authentication and permissions](permissions.md).

```yaml
suggest-reviewers:
  image: node:24
  rules:
    - if: $CI_PIPELINE_SOURCE == "merge_request_event"
  script:
    - npx --yes reviewer-suggestion suggest
      --provider gitlab
      --repository "$CI_PROJECT_ID"
      --number "$CI_MERGE_REQUEST_IID"
      --json
```

`CI_MERGE_REQUEST_IID` is the MR **IID** — the number in the MR URL — which is exactly what `--number` expects. For self-managed instances add `--api-url "$CI_API_V4_URL"`.

## Custom hosts

GitHub Enterprise Server uses the GitHub provider with an explicit API root; self-managed GitLab does the same with `/api/v4`:

```ts
import {
  createGitHubProvider,
  createGitLabProvider,
} from 'reviewer-suggestion';

const enterprise = createGitHubProvider({
  token: process.env.GITHUB_TOKEN!,
  apiUrl: 'https://github.example.com/api/v3',
});
const selfManaged = createGitLabProvider({
  token: process.env.GITLAB_TOKEN!,
  apiUrl: 'https://gitlab.example.com/api/v4',
});
```

Hosts must present trusted TLS certificates; for a private CA, point `NODE_EXTRA_CA_CERTS` at your bundle. Proxy specifics are covered in the [enterprise guide](enterprise.md).

## Incomplete identity data

When commit emails are private or unlinked — the common case on GitLab — historical expertise cannot be attributed without help. Map known emails to usernames explicitly:

```json
{
  "aliases": {
    "developer@example.com": "alice",
    "12345-old-laptop@users.noreply.github.com": "alice"
  }
}
```

Aliases are exact, case-insensitive email matches; display names are never used, and ambiguous matches are ignored rather than guessed. To see whether attribution is working, inspect `belowThreshold` and `evidence.contributedFiles` in `--json` output, or replay a captured snapshot offline with `rankReviewers` while iterating on the alias map.

## Bring your own logger

The library is silent by default. Pass any logger implementing `debug`, `info`, and `warn` — **Consola** is compatible and remains your optional dependency:

```ts
import { consola } from 'consola';
import { createGitHubProvider } from 'reviewer-suggestion';

const provider = createGitHubProvider({
  token: process.env.GITHUB_TOKEN!,
  logger: consola,
});
```

Built-in events contain counts and diagnostic codes, not tokens, raw API bodies, or email mappings. A logger should not throw.
