# API Reference

Deterministic, explained reviewer suggestions for GitHub and GitLab.

## Classes

| Class                                     | Description                                                                      |
| ----------------------------------------- | -------------------------------------------------------------------------------- |
| [ReviewerError](classes/ReviewerError.md) | Typed operational or validation failure. Messages intentionally omit API bodies. |

## Interfaces

| Interface                                          | Description                                                                |
| -------------------------------------------------- | -------------------------------------------------------------------------- |
| [AssignmentResult](interfaces/AssignmentResult.md) | Result of explicit assignment. Failures never masquerade as success.       |
| [ChangedFile](interfaces/ChangedFile.md)           | A changed file; previousPath preserves history for renames.                |
| [Contribution](interfaces/Contribution.md)         | Historical commit author with optional provider-linked identity.           |
| [Diagnostic](interfaces/Diagnostic.md)             | Machine-readable diagnostic without response bodies or credentials.        |
| [FileSignal](interfaces/FileSignal.md)             | Normalized historical and ownership evidence for one changed file.         |
| [Identity](interfaces/Identity.md)                 | Provider-qualified identity; IDs are strings to avoid numeric assumptions. |
| [Logger](interfaces/Logger.md)                     | Optional structured logger compatible with Consola; omitted means silent.  |
| [Member](interfaces/Member.md)                     | A candidate whose repository permissions have been established.            |
| [OwnerRule](interfaces/OwnerRule.md)               | Parsed rule with section-specific exclusion and precedence semantics.      |
| [ProviderOptions](interfaces/ProviderOptions.md)   | Transport configuration; tokens are supplied by the caller, never logged.  |
| [RankingOptions](interfaces/RankingOptions.md)     | Ranking configuration. All fields are optional and validated at runtime.   |
| [RequestContext](interfaces/RequestContext.md)     | Captured request state; history/configuration are read at baseSha.         |
| [RequestReference](interfaces/RequestReference.md) | Repository identifier and pull/merge request number (GitLab IID).          |
| [ReviewerProvider](interfaces/ReviewerProvider.md) | Extension contract for repository providers; all writes are explicit.      |
| [ReviewerSnapshot](interfaces/ReviewerSnapshot.md) | Serializable input to the pure ranking function.                           |
| [ScoredCandidate](interfaces/ScoredCandidate.md)   | A ranked reviewer and the evidence explaining their score.                 |
| [Scores](interfaces/Scores.md)                     | Normalized values and configurable weights for the five ranking signals.   |
| [SuggestionResult](interfaces/SuggestionResult.md) | Suggested reviewers, diagnostics, and captured request context.            |

## Type Aliases

| Type Alias                           | Description                             |
| ------------------------------------ | --------------------------------------- |
| [Platform](type-aliases/Platform.md) | Supported repository hosting providers. |

## Variables

| Variable                                         | Description                                      |
| ------------------------------------------------ | ------------------------------------------------ |
| [DEFAULT\_WEIGHTS](variables/DEFAULT_WEIGHTS.md) | Default weights; custom weights must sum to one. |

## Functions

| Function                                                  | Description                                                                                                                                    |
| --------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| [assignReviewers](functions/assignReviewers.md)           | Explicitly request reviews, preserving existing assignments. Revalidates eligibility and re-reads assignment state after ambiguous writes.     |
| [createGitHubProvider](functions/createGitHubProvider.md) | Create a GitHub REST provider for GitHub.com or an Enterprise API root.                                                                        |
| [createGitLabProvider](functions/createGitLabProvider.md) | Create a GitLab REST provider, including Self-Managed hosts.                                                                                   |
| [parseCodeOwners](functions/parseCodeOwners.md)           | Parse CODEOWNERS using provider-specific sections and exclusions.                                                                              |
| [rankReviewers](functions/rankReviewers.md)               | Rank normalized repository evidence deterministically without network requests.                                                                |
| [resolveCodeOwners](functions/resolveCodeOwners.md)       | Resolve ownership, using the last matching rule within each section. GitLab exclusions permanently exclude matching paths within that section. |
| [suggestReviewers](functions/suggestReviewers.md)         | Collect repository evidence and suggest reviewers without changing the request.                                                                |
