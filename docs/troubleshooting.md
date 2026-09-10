---
title: Troubleshooting
---

# Troubleshooting

Failures are typed: essential failures throw `ReviewerError` with a stable `code`, and optional signal failures degrade to `warnings` with `partial: true`. Messages intentionally omit API response bodies and credentials.

## Exit codes (CLI)

| Code | Meaning                                                     |
| ---- | ----------------------------------------------------------- |
| `0`  | Success — including a valid empty suggestion                |
| `1`  | Operational failure, or an assignment that partially failed |
| `2`  | Invalid arguments or configuration                          |

## Error codes

| Code                     | Meaning and usual fix                                                                                                                                                       |
| ------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `INVALID_OPTIONS`        | Bad arguments, configuration, API URL, or missing token. The message names the offending option; unknown JSON configuration keys are rejected deliberately                  |
| `HTTP_401` / `HTTP_403`  | Provider rejected the credential. Check the token's scopes against the [permissions guide](permissions.md); on GitHub, `403` can also be a rate limit without retry headers |
| `HTTP_404`               | Repository or request number not found — or the token cannot see it. On GitLab, confirm you passed the MR **IID**, not the global database ID                               |
| `RATE_LIMIT`             | Provider rate limit whose retry window exceeds the bounded retry budget (30s). Re-run later or lower `concurrency`                                                          |
| `NETWORK_ERROR`          | Request failed or timed out (default 15s per attempt). Check connectivity, proxy setup, and custom CA trust — see the [enterprise guide](enterprise.md)                     |
| `CANCELLED`              | The caller's `AbortSignal` fired                                                                                                                                            |
| `TRUNCATED`              | The provider reported more data than it returned (incomplete changed-file list, or pagination exceeded `maxPages`). Raise `maxPages`, or reduce the change size             |
| `INVALID_RESPONSE`       | The API returned something structurally unexpected — typically a proxy or SSO interception page rather than the API                                                         |
| `UNSUPPORTED`            | The provider returned data this package refuses to guess about (non-base64 file content, unknown GitLab reviewer state)                                                     |
| `NOT_ASSIGNABLE`         | Assignment refused because the request is closed or draft                                                                                                                   |
| `INELIGIBLE`             | Assignment refused because a reviewer identity could not be revalidated as an active, non-bot member with write access who is not the author                                |
| `ASSIGNMENT_UNCONFIRMED` | A write failed **and** the reconciliation read also failed, so the outcome is unknown. Inspect the request manually before retrying                                         |
| `ASSIGNMENT_FAILED`      | Action-level failure when some reviewers could not be assigned; inspect the `assignment` output                                                                             |
| `UNEXPECTED_ERROR`       | A non-`ReviewerError` escaped; please report it with a sanitized reproduction                                                                                               |

## Warnings and partial results

`CODEOWNERS`, commit history, owner resolution, and review workload are optional signals: when one fails, its diagnostic lands in `warnings`, `partial` becomes `true`, and the affected signal contributes zero. Scores are not renormalized around missing data, and an unknown workload is not treated as an empty workload. A common example: a token without organization team visibility produces an `Owner resolution unavailable.` warning while everything else proceeds.

## "No suggestions" is not an error

An empty `selected` with exit code `0` means no candidate had contribution or ownership evidence above `minScore`. Check, in order:

1. `belowThreshold` — evidenced candidates that missed the threshold; consider lowering `minScore`.
2. `warnings` — a missing signal (often identity attribution; see the [incomplete identity recipe](recipes.md)) may have removed the evidence.
3. The pool — the author, existing reviewers, exclusions, bots, and members below write access are all removed before ranking.
4. `fallback: true` — opt in to owner/maintainer/member fallback for coverage picks without evidence.

## Reproducing and debugging a decision

Capture the run with `--json` (or the Action's `result` output): it contains every score, breakdown, warning, and piece of evidence. To iterate without touching the API, replay a `ReviewerSnapshot` through `rankReviewers` with a pinned `now` — identical inputs always produce identical output, so a decision can be reproduced exactly, long after the fact.

## Action-specific notes

- Fork `pull_request` workflows have read-only tokens and no secrets; suggestion may work while assignment cannot.
- Keep `pull_request_target` jobs free of steps that check out or execute pull-request code; this Action needs no checkout.
- `config-path` is read at the trusted base revision, so a PR cannot modify the configuration that evaluates it.
- Enterprise runners must support the Node 24 Action runtime.
