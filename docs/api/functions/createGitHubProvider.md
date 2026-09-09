# Function: createGitHubProvider()

```ts
function createGitHubProvider(options): ReviewerProvider;
```

Defined in: [src/providers/github.ts:21](https://github.com/moh3n9595/reviewer-suggestion/blob/main/src/providers/github.ts#L21)

Create a GitHub REST provider for GitHub.com or an Enterprise API root.

## Parameters

| Parameter | Type                                                  | Description                                                           |
| --------- | ----------------------------------------------------- | --------------------------------------------------------------------- |
| `options` | [`ProviderOptions`](../interfaces/ProviderOptions.md) | Token, optional API URL, injectable fetch/logger, and request limits. |

## Returns

[`ReviewerProvider`](../interfaces/ReviewerProvider.md)

A provider; creation performs no network requests.

## Throws

[ReviewerError](../classes/ReviewerError.md) For invalid authentication or transport configuration.

## Example

```ts
const provider = createGitHubProvider({ token: process.env.GITHUB_TOKEN! });
```
