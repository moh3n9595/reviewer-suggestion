---
title: Ranking model
---

# Ranking model

This guide is the full reference for how reviewers are scored, selected, and explained. It applies identically to the library, the CLI, and the GitHub Action, and to the offline `rankReviewers` entry point: identical inputs produce identical output on every run.

## Score

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

Each signal is bounded to `[0, 1]`. Files are equally weighted. Every selection carries its `breakdown`, contributed files, owned files, and `evidence.historySources`, so a score is always explainable from its output alone.

## Candidate pool and eligibility

The default pool contains active, non-bot repository members with write access or higher (GitHub writers, GitLab Developers and above). The author, existing reviewers, and configured exclusions are removed. A normal selection requires actual contribution or ownership evidence; `belowThreshold` reports up to three evidenced candidates that missed the score threshold.

## Determinism

Ties are broken by normalized username and then provider ID — never random choice or API arrival order. A single clock value is captured per run; pass `now` to reproduce the same ranking later. Duplicate members and duplicate changed paths are deduplicated by ID and path before scoring.

## Evidence collection

Historical commits and CODEOWNERS are read at the captured target/base revision. Renamed files consult their previous path; files without history consult their parent directory. `evidence.historySources` maps each changed path to the historical path actually used, so directory proxies remain distinguishable from direct contributions. Review loads are repository-local open review requests, excluding the current request.

## Configuration

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

| Option          | Default  | Meaning                                                                |
| --------------- | -------- | ---------------------------------------------------------------------- |
| `limit`         | `2`      | Maximum selections, including fallback selections; `0` selects nobody  |
| `minScore`      | `0.05`   | Inclusive score threshold in `[0, 1]`                                  |
| `historyLimit`  | `30`     | Maximum commits collected per distinct path                            |
| `maxReviewLoad` | `8`      | Pending reviews at which availability reaches zero                     |
| `halfLifeDays`  | `30`     | Days before recency evidence halves                                    |
| `horizonDays`   | `180`    | Age cutoff for recency evidence                                        |
| `now`           | run time | ISO timestamp; set it for reproducible runs                            |
| `exclude`       | `[]`     | Case-insensitive usernames to remove from the pool                     |
| `aliases`       | `{}`     | Explicit email → username mappings; display names are never used       |
| `weights`       | defaults | Overrides merged with the defaults; must be nonnegative and sum to one |
| `fallback`      | `false`  | Owner → maintainer → member fallback when normal selection is empty    |

Configuration is plain JSON and is validated strictly: unknown keys are rejected, so a typo fails loudly instead of being silently ignored. Explicit CLI flags override JSON configuration, which overrides defaults.

## Fallback

Fallback is **off** by default. When enabled and normal selection is empty, eligible owners come first, then maintainers, then other eligible members, and each result identifies its fallback tier in `reason`. Empty changes never trigger fallback.

## Failures and partial results

Essential failures — request context, member enumeration, invalid options — throw `ReviewerError` with a stable `code`. Optional signal failures (history, CODEOWNERS, owner resolution, workload) are returned as `warnings` with `partial: true` instead of failing the run. Unavailable signals contribute zero; an unknown workload is not interpreted as an empty workload, and scores are not renormalized around missing data. No suggestion is a valid outcome, not an error. See the [troubleshooting guide](troubleshooting.md) for the full code list.

## Transport options

Provider construction accepts `fetch` (injectable transport), `logger`, `signal`, `timeoutMs` (15,000 per attempt), `retries` (2, read requests only), `concurrency` (5), and `maxPages` (100). History collection is capped at `historyLimit`; any other pagination exceeding its page budget is explicitly reported as truncation rather than silently shortened. Retry delays honor provider rate-limit headers and are bounded to 30 seconds.

## Offline ranking

`rankReviewers(snapshot, options)` ranks a previously collected or synthetic `ReviewerSnapshot` without any network access or credentials — the same engine the online path uses. See [the compiled example](https://github.com/moh3n9595/reviewer-suggestion/blob/main/examples/offline.ts). This is also the supported way to debug a surprising suggestion: capture the inputs once, then replay them with different options.
