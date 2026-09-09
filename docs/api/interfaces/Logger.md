# Interface: Logger

Defined in: [src/types.ts:196](https://github.com/moh3n9595/reviewer-suggestion/blob/main/src/types.ts#L196)

Optional structured logger compatible with Consola; omitted means silent.

## Methods

### debug()

```ts
debug(message, context?): void;
```

Defined in: [src/types.ts:198](https://github.com/moh3n9595/reviewer-suggestion/blob/main/src/types.ts#L198)

Report collection progress without sensitive values.

#### Parameters

| Parameter  | Type                            |
| ---------- | ------------------------------- |
| `message`  | `string`                        |
| `context?` | `Record`\<`string`, `unknown`\> |

#### Returns

`void`

---

### info()

```ts
info(message, context?): void;
```

Defined in: [src/types.ts:200](https://github.com/moh3n9595/reviewer-suggestion/blob/main/src/types.ts#L200)

Report completed suggestion/assignment counts.

#### Parameters

| Parameter  | Type                            |
| ---------- | ------------------------------- |
| `message`  | `string`                        |
| `context?` | `Record`\<`string`, `unknown`\> |

#### Returns

`void`

---

### warn()

```ts
warn(message, context?): void;
```

Defined in: [src/types.ts:202](https://github.com/moh3n9595/reviewer-suggestion/blob/main/src/types.ts#L202)

Report safe diagnostic codes for partial or failed operations.

#### Parameters

| Parameter  | Type                            |
| ---------- | ------------------------------- |
| `message`  | `string`                        |
| `context?` | `Record`\<`string`, `unknown`\> |

#### Returns

`void`
