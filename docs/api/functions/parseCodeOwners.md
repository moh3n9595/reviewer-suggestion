# Function: parseCodeOwners()

```ts
function parseCodeOwners(content, platform): OwnerRule[];
```

Defined in: [src/codeowners.ts:18](https://github.com/moh3n9595/reviewer-suggestion/blob/main/src/codeowners.ts#L18)

Parse CODEOWNERS using provider-specific sections and exclusions.

## Parameters

| Parameter  | Type                                      | Description              |
| ---------- | ----------------------------------------- | ------------------------ |
| `content`  | `string`                                  | UTF-8 CODEOWNERS text.   |
| `platform` | [`Platform`](../type-aliases/Platform.md) | GitHub or GitLab syntax. |

## Returns

[`OwnerRule`](../interfaces/OwnerRule.md)[]

Rules in source order; invalid GitHub negations/classes are skipped.
