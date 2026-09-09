# Function: resolveCodeOwners()

```ts
function resolveCodeOwners(path, rules): string[];
```

Defined in: [src/codeowners.ts:93](https://github.com/moh3n9595/reviewer-suggestion/blob/main/src/codeowners.ts#L93)

Resolve ownership, using the last matching rule within each section.
GitLab exclusions permanently exclude matching paths within that section.

## Parameters

| Parameter | Type                                        | Description                                    |
| --------- | ------------------------------------------- | ---------------------------------------------- |
| `path`    | `string`                                    | Repository-relative, case-sensitive file path. |
| `rules`   | [`OwnerRule`](../interfaces/OwnerRule.md)[] | Parsed CODEOWNERS rules.                       |

## Returns

`string`[]

Deduplicated owner references; groups are resolved by the provider.
