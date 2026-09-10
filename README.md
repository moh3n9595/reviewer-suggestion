<p align="center">
  <img src="https://github.com/moh3n9595/reviewer-suggestion/raw/main/assets/logo.png" alt="Reviewer Suggestion" width="120" height="120">
</p>

# Reviewer Suggestion

**Find reviewers who know the code—and explain why they fit.**

[![npm version](https://img.shields.io/npm/v/reviewer-suggestion)](https://www.npmjs.com/package/reviewer-suggestion)
[![npm downloads](https://img.shields.io/npm/dm/reviewer-suggestion)](https://www.npmjs.com/package/reviewer-suggestion)
[![CI](https://github.com/moh3n9595/reviewer-suggestion/actions/workflows/ci.yml/badge.svg)](https://github.com/moh3n9595/reviewer-suggestion/actions/workflows/ci.yml)
[![codecov](https://codecov.io/gh/moh3n9595/reviewer-suggestion/graph/badge.svg)](https://codecov.io/gh/moh3n9595/reviewer-suggestion)
[![CodeFactor](https://www.codefactor.io/repository/github/moh3n9595/reviewer-suggestion/badge)](https://www.codefactor.io/repository/github/moh3n9595/reviewer-suggestion)
[![Node.js](https://img.shields.io/node/v/reviewer-suggestion)](https://nodejs.org/)
[![MIT license](https://img.shields.io/github/license/moh3n9595/reviewer-suggestion)](LICENSE)

A deterministic TypeScript library, CLI, and GitHub Action for **GitHub and GitLab**, including custom API hosts. Ranks repository members using commit history, CODEOWNERS, recency, access, and current review load. No AI service, telemetry, or runtime dependencies.

```text
REVIEWER  SCORE   REASON
alice     0.6008  ranked
```

Every selection includes its five signal scores, contributed files, owned files, history sources, and selection reason. Suggestions are read-only. Assignment is a separate, explicit operation.

[API documentation](https://moh3n9595.github.io/reviewer-suggestion/) · [Guides](#guides) · [CLI](#cli) · [GitHub Action](#github-action) · [Enterprise](#enterprise-adoption) · [Releases](https://github.com/moh3n9595/reviewer-suggestion/releases)

## Install

Requires Node.js **22.14 or newer**.

```sh
pnpm add reviewer-suggestion
# or: npm install reviewer-suggestion
```

The package provides ESM, CommonJS, TypeScript declarations, and the `reviewer-suggestion` executable.

## Library

```ts
import {
  createGitHubProvider,
  suggestReviewers,
  assignReviewers,
} from 'reviewer-suggestion';

const provider = createGitHubProvider({ token: process.env.GITHUB_TOKEN! });
const request = { repository: 'your-org/your-repo', number: 42 };

const result = await suggestReviewers(provider, request, {
  limit: 2,
  exclude: ['automation-bot'],
});

for (const reviewer of result.selected) {
  console.log(reviewer.username, reviewer.score, reviewer.breakdown);
}

// Explicit write: omit this call when you only want recommendations.
const assignment = await assignReviewers(provider, request, result.selected);
if (assignment.failed.length) console.error(assignment.failed);
```

For GitLab, use the MR **IID** (the number shown in its URL), not its global database ID:

```ts
import { createGitLabProvider, suggestReviewers } from 'reviewer-suggestion';

const provider = createGitLabProvider({
  token: process.env.GITLAB_TOKEN!,
  // Omit for GitLab.com. Enterprise GitHub uses createGitHubProvider instead.
  apiUrl: 'https://gitlab.example.com/api/v4',
});

const result = await suggestReviewers(
  provider,
  { repository: 'group/project', number: 17 },
  { aliases: { 'developer@example.com': 'alice' } },
);
console.log(result.selected);
```

Providers accept an optional Consola-compatible `logger` and a custom `fetch`; the library is silent by default, and custom `ReviewerProvider` implementations can wrap existing Octokit or Gitbeaker clients. See the [recipes guide](docs/recipes.md).

### Try it without credentials

`rankReviewers(snapshot, options)` runs the same engine on previously collected or synthetic data — no network, no account, no token — and `now` pins the clock so a ranking reproduces exactly:

```ts
import { rankReviewers, type ReviewerSnapshot } from 'reviewer-suggestion';

declare const snapshot: ReviewerSnapshot; // collected earlier, or synthetic
console.log(rankReviewers(snapshot, { now: '2026-01-01T00:00:00Z' }).selected);
```

[The compiled example](examples/offline.ts) builds a complete synthetic snapshot you can run immediately.

## CLI

Set `GITHUB_TOKEN` or `GITLAB_TOKEN` through your shell or CI secret store.

```sh
pnpm exec reviewer-suggestion suggest \
  --provider github --repository your-org/your-repo --number 42

pnpm exec reviewer-suggestion suggest \
  --provider gitlab --repository group/project --number 17 --json

pnpm exec reviewer-suggestion assign \
  --provider github --repository your-org/your-repo --number 42 --dry-run

# Remove --dry-run to request reviews explicitly.
pnpm exec reviewer-suggestion --help
```

| Flag                     | Behavior                                                  |
| ------------------------ | --------------------------------------------------------- |
| `--provider`             | `github` or `gitlab`                                      |
| `--repository`           | GitHub `owner/repo`; GitLab project ID or namespace/path  |
| `--number`               | PR number or MR IID                                       |
| `--config`               | Path to a JSON ranking configuration                      |
| `--limit`, `--min-score` | Override ranking limits                                   |
| `--exclude`              | Comma-separated usernames                                 |
| `--fallback`             | Enable fallback when no ranked candidate passes           |
| `--api-url`              | Full custom HTTPS API root                                |
| `--json`                 | Structured result on stdout; operational errors on stderr |
| `--dry-run`              | Run assignment command without making writes              |

Explicit flags override JSON configuration, which overrides defaults. Credentials are accepted through environment variables, not arguments or configuration. Exit codes: **0** success (including no suggestions), **1** operational/assignment failure, **2** invalid arguments or configuration.

## GitHub Action

```yaml
name: Suggest reviewers
on:
  pull_request_target:
    types: [opened, reopened, ready_for_review]
permissions:
  contents: read
  pull-requests: read
jobs:
  suggest:
    if: github.event.pull_request.draft == false
    runs-on: ubuntu-latest
    steps:
      - uses: moh3n9595/reviewer-suggestion@v1
        id: reviewers
        with:
          token: ${{ secrets.REVIEWER_TOKEN }}
          assign: 'false'
```

Use a release commit SHA when you need an immutable Action reference. The Action reads APIs and base-revision configuration; it does not require a checkout. Keep `pull_request_target` jobs free of steps that check out or execute pull-request code.

To assign, set `assign: 'true'` and use a token with review-request write permission. Organization/team access usually calls for a GitHub App installation token — see [authentication and permissions](docs/permissions.md) for the per-operation permission matrix and an App-token workflow.

| Input                  | Default                                                     |
| ---------------------- | ----------------------------------------------------------- |
| `provider`             | `github`                                                    |
| `token`                | `${{ github.token }}`                                       |
| `repository`, `number` | Inferred from GitHub pull request events                    |
| `api-url`              | Provider cloud API                                          |
| `config-path`          | No configuration file; when supplied, read at base revision |
| `limit`                | Configuration value, otherwise `2`                          |
| `assign`               | `'false'`                                                   |

Outputs: `reviewers` (JSON username array), `result` (full suggestion JSON), and `assignment` (assigned/skipped/failed identities). The Action also writes a Markdown job summary. Supply `provider: gitlab`, explicit `repository` and `number`, and a GitLab token to target GitLab from GitHub Actions.

## How ranking works

```text
score = expertise × 0.45 + ownership × 0.25 + recency × 0.15
      + access    × 0.10 + availability × 0.05
```

Each signal is bounded to `[0, 1]` and backed by evidence: per-file commit history (renames and parent directories included), CODEOWNERS at the base revision, repository access level, and current open review load. Ties break on normalized username and ID — never randomness or API arrival order — and a captured clock makes every run reproducible. A normal selection requires actual contribution or ownership evidence; fallback is explicit and off by default.

Configuration is plain JSON with strict validation:

```json
{
  "limit": 2,
  "minScore": 0.05,
  "exclude": ["automation-bot"],
  "aliases": { "developer@example.com": "alice" }
}
```

The [ranking model guide](docs/ranking.md) documents every signal, option, default, fallback tier, and failure semantic.

## Guides

- [Ranking model](docs/ranking.md) — signals, configuration reference, determinism, fallback, partial results.
- [Authentication and permissions](docs/permissions.md) — per-operation scopes, GitHub App setup, fine-grained PATs, GitLab tokens, identity resolution.
- [CODEOWNERS compatibility](docs/codeowners.md) — supported semantics, and how suggestions relate to CODEOWNERS and required approvals.
- [Recipes](docs/recipes.md) — small teams, monorepos, GitLab CI, custom hosts, incomplete identity data.
- [Troubleshooting](docs/troubleshooting.md) — error codes, exit codes, warnings, and debugging a decision.
- [Enterprise adoption](docs/enterprise.md) — data flow, supply chain, proxies and private CAs, air-gapped installs.

## Enterprise adoption

Built to pass a security review, not just a demo:

- **Nothing leaves your infrastructure.** Outbound requests go only to the configured HTTPS API root; no telemetry, no AI service, zero runtime dependencies, tokens never logged.
- **Verifiable supply chain.** npm trusted publishing (OIDC, no registry token) with provenance on every release, an SPDX SBOM attached to each GitHub release, and immutable version tags; verify with `npm audit signatures`.
- **Deterministic and auditable.** Identical inputs produce identical output, and every decision ships with its full evidence — a retainable decision record.
- **Self-hosted ready.** GitHub Enterprise Server and self-managed GitLab via `apiUrl`, private CAs via `NODE_EXTRA_CA_CERTS`, proxy guidance, and air-gapped installation paths.

The [enterprise guide](docs/enterprise.md) states each claim in citable form, with the enforcement behind it.

## Failures and assignment guarantees

Essential failures throw `ReviewerError` with a stable `code`; optional signal failures return `warnings` and `partial: true` instead of guessing. No suggestion is a valid outcome, not a network error. Assignment revalidates identities and eligibility, preserves existing reviewers, and reconciles ambiguous writes by re-reading the request rather than blindly retrying. The [troubleshooting guide](docs/troubleshooting.md) documents every code and its fix.

## Quality and releases

- Strict TypeScript and type-aware ESLint, with Prettier formatting.
- Vitest unit, HTTP-fixture, entrypoint, and property-based tests; required **100% per-file** coverage for authored runtime source.
- Codecov and CodeFactor gates; installed-package checks for ESM, CommonJS, TypeScript, and the CLI on Linux, macOS, and Windows.
- Documentation examples — including the guides — are compiled in CI, so they cannot drift from the API.
- GitHub Actions builds with npm trusted publishing and provenance; inspect the package's **Built and signed on GitHub Actions** details on npm, and verify with `npm audit signatures`.

Releases follow Conventional Commits: `fix` publishes a patch, `feat` a minor, and breaking changes a major. Each release updates the committed [changelog](CHANGELOG.md), publishes matching npm and GitHub versions, attaches the runnable Action bundle and an SPDX SBOM, and advances the compatible major Action tag only after synchronization checks pass. `v1.2.3` is an immutable release; `v1` intentionally moves to the newest compatible v1 Action. See [release setup](RELEASING.md).

## Contributing

```sh
nvm install
nvm use
corepack enable
pnpm install
pnpm run verify
pnpm run build:action
```

Husky runs staged ESLint/Prettier checks and commitlint. CI repeats the checks independently. See [CONTRIBUTING.md](CONTRIBUTING.md), [security reporting](SECURITY.md), and the [code of conduct](CODE_OF_CONDUCT.md).

## License

[MIT](LICENSE) © Mohsen Madani.
