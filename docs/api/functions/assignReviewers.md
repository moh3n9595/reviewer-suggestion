# Function: assignReviewers()

```ts
function assignReviewers(
  provider,
  request,
  reviewers,
): Promise<AssignmentResult>;
```

Defined in: [src/service.ts:180](https://github.com/moh3n9595/reviewer-suggestion/blob/main/src/service.ts#L180)

Explicitly request reviews, preserving existing assignments.
Revalidates eligibility and re-reads assignment state after ambiguous writes.

## Parameters

| Parameter   | Type                                                    | Description                                                      |
| ----------- | ------------------------------------------------------- | ---------------------------------------------------------------- |
| `provider`  | [`ReviewerProvider`](../interfaces/ReviewerProvider.md) | Provider with write-capable credentials.                         |
| `request`   | [`RequestReference`](../interfaces/RequestReference.md) | Repository and PR number/MR IID.                                 |
| `reviewers` | [`Identity`](../interfaces/Identity.md)[]               | Provider-qualified identities, normally from suggestion results. |

## Returns

`Promise`\<[`AssignmentResult`](../interfaces/AssignmentResult.md)\>

Assigned, already assigned, and failed identities; no automatic removals.

## Throws

[ReviewerError](../classes/ReviewerError.md) For closed/draft requests, invalid identities, or missing essential context.

## Remarks

Provider APIs cannot guarantee atomicity against concurrent external edits.
