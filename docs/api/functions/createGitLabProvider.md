# Function: createGitLabProvider()

```ts
function createGitLabProvider(options): ReviewerProvider;
```

Defined in: [src/providers/gitlab.ts:21](https://github.com/moh3n9595/reviewer-suggestion/blob/main/src/providers/gitlab.ts#L21)

Create a GitLab REST provider, including Self-Managed hosts.

## Parameters

| Parameter | Type                                                  | Description                                           |
| --------- | ----------------------------------------------------- | ----------------------------------------------------- |
| `options` | [`ProviderOptions`](../interfaces/ProviderOptions.md) | Token and optional full API root (ending in /api/v4). |

## Returns

[`ReviewerProvider`](../interfaces/ReviewerProvider.md)

A provider; creation performs no network requests.

## Throws

[ReviewerError](../classes/ReviewerError.md) For invalid authentication or transport configuration.

## Example

```ts
const provider = createGitLabProvider({ token: process.env.GITLAB_TOKEN! });
```
