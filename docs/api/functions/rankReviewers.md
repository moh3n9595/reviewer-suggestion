# Function: rankReviewers()

```ts
function rankReviewers(snapshot, options?): SuggestionResult;
```

Defined in: [src/ranking.ts:119](https://github.com/moh3n9595/reviewer-suggestion/blob/main/src/ranking.ts#L119)

Rank normalized repository evidence deterministically without network requests.

## Parameters

| Parameter  | Type                                                    | Description                                                          |
| ---------- | ------------------------------------------------------- | -------------------------------------------------------------------- |
| `snapshot` | [`ReviewerSnapshot`](../interfaces/ReviewerSnapshot.md) | Captured request, candidates, file evidence, and known review loads. |
| `options`  | [`RankingOptions`](../interfaces/RankingOptions.md)     | Ranking policy; defaults to two suggestions and no fallback.         |

## Returns

[`SuggestionResult`](../interfaces/SuggestionResult.md)

Explained rankings; no candidates is a successful empty result.

## Throws

[ReviewerError](../classes/ReviewerError.md) For invalid ranking options.

## Example

```ts
const result = rankReviewers(snapshot, {
  limit: 2,
  now: '2026-01-01T00:00:00Z',
});
```
