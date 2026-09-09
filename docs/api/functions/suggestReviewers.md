# Function: suggestReviewers()

```ts
function suggestReviewers(
  provider,
  request,
  options?,
): Promise<SuggestionResult>;
```

Defined in: [src/service.ts:35](https://github.com/moh3n9595/reviewer-suggestion/blob/main/src/service.ts#L35)

Collect repository evidence and suggest reviewers without changing the request.

## Parameters

| Parameter  | Type                                                    | Description                                                    |
| ---------- | ------------------------------------------------------- | -------------------------------------------------------------- |
| `provider` | [`ReviewerProvider`](../interfaces/ReviewerProvider.md) | GitHub, GitLab, or an implementation of the provider contract. |
| `request`  | [`RequestReference`](../interfaces/RequestReference.md) | Repository and PR number/MR IID.                               |
| `options`  | [`RankingOptions`](../interfaces/RankingOptions.md)     | Ranking options; optional failures are returned as warnings.   |

## Returns

`Promise`\<[`SuggestionResult`](../interfaces/SuggestionResult.md)\>

Explained selections and captured request metadata.

## Throws

[ReviewerError](../classes/ReviewerError.md) If essential context, eligibility, or options fail.
