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

[API documentation](https://moh3n9595.github.io/reviewer-suggestion/) · [CLI](#cli) · [GitHub Action](#github-action) · [Configuration](#configuration) · [Releases](https://github.com/moh3n9595/reviewer-suggestion/releases)

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

### Bring your own logger

The library is silent by default. Pass any logger implementing `debug`, `info`, and `warn`; **Consola** is compatible and remains your optional dependency:

```ts
import { consola } from 'consola';
import { createGitHubProvider } from 'reviewer-suggestion';

const provider = createGitHubProvider({
  token: process.env.GITHUB_TOKEN!,
  logger: consola,
});
```

Built-in events contain counts and diagnostic codes, not tokens, raw API bodies, or email mappings. A logger should not throw. Custom providers can wrap existing Octokit or Gitbeaker clients by implementing `ReviewerProvider`.

### Offline ranking

Use `rankReviewers(snapshot, options)` with a `ReviewerSnapshot` to rank previously collected or synthetic data without network access. Set `now` to reproduce the same ranking later. See [the compiled example](examples/offline.ts).

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

To assign, set `assign: 'true'` and use a token with review-request write permission. GitHub's default token is sufficient only where it can enumerate eligible collaborators and access all requested signals; organization/team access may require a GitHub App installation token or PAT. Fork `pull_request` workflows usually have read-only tokens and no repository secrets. See [GitHub's collaborator endpoint permissions](https://docs.github.com/en/rest/collaborators/collaborators).

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

Custom hosts must be reachable from the runner and present trusted TLS certificates. The Action uses Node.js 24; Enterprise runners must support that Action runtime.

## How ranking works

```text
score = expertise × 0.45 + ownership × 0.25 + recency × 0.15
      + access    × 0.10 + availability × 0.05
```

| Signal       | Calculation                                                                     |
| ------------ | ------------------------------------------------------------------------------- |
| Expertise    | Average `log(1 + author commits) / log(1 + historyLimit)` per changed file      |
| Ownership    | Fraction of changed files owned by the candidate                                |
| Recency      | Average `2^(-ageDays / halfLifeDays)` per changed file; zero beyond the horizon |
| Access       | Writer/Developer `0.6`, Maintainer `0.9`, Admin/Owner `1`                       |
| Availability | `max(0, 1 - openReviewLoad / maxReviewLoad)`                                    |

Each signal is bounded to `[0, 1]`. The default pool contains active, non-bot repository writers/GitLab Developers or higher. The author, existing reviewers, and exclusions are removed. A normal selection requires actual contribution or ownership evidence. Ties use normalized username and ID, never random choice or API arrival order.

Historical commits and CODEOWNERS are read at the captured target/base revision. Renames consult the previous path; files without history consult their parent directory. `evidence.historySources` maps changed paths to the actual historical paths, so directory proxies remain distinguishable from direct contributions. Files are equally weighted. Loads are repository-local and exclude the current request.

### Configuration

```json
{
  "limit": 2,
  "minScore": 0.05,
  "historyLimit": 30,
  "maxReviewLoad": 8,
  "halfLifeDays": 30,
  "horizonDays": 180,
  "exclude": ["automation-bot"],
  "aliases": { "developer@example.com": "alice" },
  "fallback": false
}
```

Additional library/JSON options:

- `now`: ISO timestamp; defaults to one captured current time per run.
- `weights`: overrides to the five weights; the resulting values must be nonnegative and sum to one.
- `limit: 0`: return no selected candidates.

Fallback is **off** by default. When enabled and normal selection is empty, eligible owners come first, then maintainers, then other eligible members. Results identify the fallback tier. Empty changes never trigger fallback.

Provider options include `fetch`, `logger`, `signal`, `timeoutMs` (15,000), `retries` (2), `concurrency` (5), and `maxPages` (100). History is capped at `historyLimit`; other pagination exceeding its budget is explicitly reported. Retry delays are bounded to 30 seconds.

## Authentication and data availability

| Provider | Suggestion access                                                                                                                           | Assignment access                                            |
| -------- | ------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------ |
| GitHub   | Repository metadata, contents and pull requests read; authorization to list collaborators; organization/team visibility for group ownership | Pull requests write; same read capabilities for revalidation |
| GitLab   | Token with `read_api`, visible project members, commits and files; group visibility for group owners                                        | Token with `api` and permission to update MR reviewers       |

GitHub App installation tokens, fine-grained PATs, or classic PATs can be supplied as GitHub tokens. GitLab personal/project/group access tokens work when their user and scopes expose the required endpoints. GitLab CI job tokens are not a general replacement for these API permissions.

Commit emails are often private. GitHub-linked authors are preferred; otherwise known member emails and explicit `aliases` are used. Display names are never identity evidence. Ambiguous email matches are ignored. On GitLab, explicit aliases are often necessary for historical expertise. Email CODEOWNERS entries likewise need a resolvable email identity.

## CODEOWNERS compatibility

GitHub lookup order: `.github/CODEOWNERS`, `CODEOWNERS`, `docs/CODEOWNERS`. GitLab lookup order: `CODEOWNERS`, `docs/CODEOWNERS`, `.gitlab/CODEOWNERS`.

Supported semantics include anchored paths, basename rules, directory rules, `*`, `**`, `?`, last-match precedence, and ownerless clearing. GitLab additionally supports character classes, sections, optional sections, section defaults, direct role owners, and section-local exclusions. GitLab treats owner mentions after an inline `#` as owners; GitHub ignores inline comments. GitHub-invalid negations and character-class patterns are skipped. Paths remain case-sensitive.

Team/group ownership resolves to eligible individual users. Inaccessible resolution is reported as an optional signal warning. Section approval counts are parsed as metadata boundaries; this package does **not** enforce branch protection or required approvals. API capabilities vary by host version and token visibility; it does not claim support for every historical Enterprise/Self-Managed release.

## Failures and assignment guarantees

Essential context/member failures throw `ReviewerError` with a stable `code`. Optional history, ownership, and workload failures return `warnings` and `partial: true`. Unavailable signals contribute zero; an unknown workload is not interpreted as an empty workload. Scores are not renormalized around missing data.

`belowThreshold` contains at most three evidenced candidates for diagnostics. No suggestion is a valid outcome, not a network error.

Assignment revalidates identities and eligibility, rejects closed/draft requests, deduplicates reviewers, and preserves existing assignments. After an ambiguous write, it re-reads the request to distinguish observed assignments from failures. It does not blindly retry writes. GitLab's replace-style reviewer API cannot provide atomic merging against simultaneous external edits. Inspect `failed`, including `ASSIGNMENT_UNCONFIRMED`, before taking further action.

## Quality and releases

- Strict TypeScript and type-aware ESLint, with Prettier formatting.
- Vitest unit, HTTP-fixture, entrypoint, and property-based tests.
- Required **100% per-file** statements, branches, functions, and lines for authored runtime source.
- Codecov reporting and CodeFactor analysis; badges display the actual external results.
- Installed-package checks for ESM, CommonJS, TypeScript, and the CLI on Linux, macOS, and Windows.
- GitHub Actions builds and npm provenance; inspect the package's **Built and signed on GitHub Actions** details on npm after publication.

Verify installed registry signatures and attestations with `npm audit signatures`. Provenance links a published artifact to its build; it is not a correctness guarantee. See [npm provenance](https://docs.npmjs.com/generating-provenance-statements/).

Releases follow Conventional Commits: `fix` publishes a patch, `feat` a minor, and breaking changes a major. Eligible `main` merges release automatically after checks pass. See [release setup](RELEASING.md).

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
