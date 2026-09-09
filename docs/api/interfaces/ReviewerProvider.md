# Interface: ReviewerProvider

Defined in: [src/types.ts:167](https://github.com/moh3n9595/reviewer-suggestion/blob/main/src/types.ts#L167)

Extension contract for repository providers; all writes are explicit.

## Properties

### host

```ts
readonly host: string;
```

Defined in: [src/types.ts:170](https://github.com/moh3n9595/reviewer-suggestion/blob/main/src/types.ts#L170)

---

### logger?

```ts
readonly optional logger?: Logger;
```

Defined in: [src/types.ts:168](https://github.com/moh3n9595/reviewer-suggestion/blob/main/src/types.ts#L168)

---

### platform

```ts
readonly platform: Platform;
```

Defined in: [src/types.ts:169](https://github.com/moh3n9595/reviewer-suggestion/blob/main/src/types.ts#L169)

## Methods

### assign()

```ts
assign(context, reviewers): Promise<void>;
```

Defined in: [src/types.ts:192](https://github.com/moh3n9595/reviewer-suggestion/blob/main/src/types.ts#L192)

Write additional reviewers; preserve current existing reviewers.

#### Parameters

| Parameter   | Type                                  |
| ----------- | ------------------------------------- |
| `context`   | [`RequestContext`](RequestContext.md) |
| `reviewers` | [`Identity`](Identity.md)[]           |

#### Returns

`Promise`\<`void`\>

---

### context()

```ts
context(request): Promise<RequestContext>;
```

Defined in: [src/types.ts:172](https://github.com/moh3n9595/reviewer-suggestion/blob/main/src/types.ts#L172)

Fetch complete changed-file and request metadata; failures are essential.

#### Parameters

| Parameter | Type                                      |
| --------- | ----------------------------------------- |
| `request` | [`RequestReference`](RequestReference.md) |

#### Returns

`Promise`\<[`RequestContext`](RequestContext.md)\>

---

### file()

```ts
file(context, path): Promise<string | null>;
```

Defined in: [src/types.ts:182](https://github.com/moh3n9595/reviewer-suggestion/blob/main/src/types.ts#L182)

Read a UTF-8 file at baseSha; return null only for a missing file.

#### Parameters

| Parameter | Type                                  |
| --------- | ------------------------------------- |
| `context` | [`RequestContext`](RequestContext.md) |
| `path`    | `string`                              |

#### Returns

`Promise`\<`string` \| `null`\>

---

### history()

```ts
history(
   context,
   path,
   limit
): Promise<Contribution[]>;
```

Defined in: [src/types.ts:176](https://github.com/moh3n9595/reviewer-suggestion/blob/main/src/types.ts#L176)

Fetch at most limit commits at the captured base revision.

#### Parameters

| Parameter | Type                                  |
| --------- | ------------------------------------- |
| `context` | [`RequestContext`](RequestContext.md) |
| `path`    | `string`                              |
| `limit`   | `number`                              |

#### Returns

`Promise`\<[`Contribution`](Contribution.md)[]\>

---

### loads()

```ts
loads(context): Promise<Record<string, number>>;
```

Defined in: [src/types.ts:190](https://github.com/moh3n9595/reviewer-suggestion/blob/main/src/types.ts#L190)

Count repository-local pending reviews, excluding the current request.

#### Parameters

| Parameter | Type                                  |
| --------- | ------------------------------------- |
| `context` | [`RequestContext`](RequestContext.md) |

#### Returns

`Promise`\<`Record`\<`string`, `number`\>\>

---

### members()

```ts
members(request): Promise<Member[]>;
```

Defined in: [src/types.ts:174](https://github.com/moh3n9595/reviewer-suggestion/blob/main/src/types.ts#L174)

Enumerate repository members including inherited access; failures are essential.

#### Parameters

| Parameter | Type                                      |
| --------- | ----------------------------------------- |
| `request` | [`RequestReference`](RequestReference.md) |

#### Returns

`Promise`\<[`Member`](Member.md)[]\>

---

### owners()

```ts
owners(
   context,
   owners,
   members
): Promise<string[]>;
```

Defined in: [src/types.ts:184](https://github.com/moh3n9595/reviewer-suggestion/blob/main/src/types.ts#L184)

Expand ownership references to eligible individual usernames.

#### Parameters

| Parameter | Type                                  |
| --------- | ------------------------------------- |
| `context` | [`RequestContext`](RequestContext.md) |
| `owners`  | `string`[]                            |
| `members` | [`Member`](Member.md)[]               |

#### Returns

`Promise`\<`string`[]\>
