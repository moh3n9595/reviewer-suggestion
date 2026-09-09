# Interface: RequestContext

Defined in: [src/types.ts:30](https://github.com/moh3n9595/reviewer-suggestion/blob/main/src/types.ts#L30)

Captured request state; history/configuration are read at baseSha.

## Extends

- [`RequestReference`](RequestReference.md)

## Properties

### author

```ts
author: string;
```

Defined in: [src/types.ts:31](https://github.com/moh3n9595/reviewer-suggestion/blob/main/src/types.ts#L31)

---

### baseSha

```ts
baseSha: string;
```

Defined in: [src/types.ts:33](https://github.com/moh3n9595/reviewer-suggestion/blob/main/src/types.ts#L33)

---

### draft

```ts
draft: boolean;
```

Defined in: [src/types.ts:35](https://github.com/moh3n9595/reviewer-suggestion/blob/main/src/types.ts#L35)

---

### existingReviewers

```ts
existingReviewers: Identity[];
```

Defined in: [src/types.ts:32](https://github.com/moh3n9595/reviewer-suggestion/blob/main/src/types.ts#L32)

---

### files

```ts
files: ChangedFile[];
```

Defined in: [src/types.ts:36](https://github.com/moh3n9595/reviewer-suggestion/blob/main/src/types.ts#L36)

---

### number

```ts
number: number;
```

Defined in: [src/types.ts:27](https://github.com/moh3n9595/reviewer-suggestion/blob/main/src/types.ts#L27)

#### Inherited from

[`RequestReference`](RequestReference.md).[`number`](RequestReference.md#number)

---

### repository

```ts
repository: string;
```

Defined in: [src/types.ts:26](https://github.com/moh3n9595/reviewer-suggestion/blob/main/src/types.ts#L26)

GitHub owner/repo; GitLab numeric project ID or namespace/project.

#### Inherited from

[`RequestReference`](RequestReference.md).[`repository`](RequestReference.md#repository)

---

### state

```ts
state: 'open' | 'closed';
```

Defined in: [src/types.ts:34](https://github.com/moh3n9595/reviewer-suggestion/blob/main/src/types.ts#L34)
