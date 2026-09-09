# Interface: AssignmentResult

Defined in: [src/types.ts:137](https://github.com/moh3n9595/reviewer-suggestion/blob/main/src/types.ts#L137)

Result of explicit assignment. Failures never masquerade as success.

## Properties

### assigned

```ts
assigned: Identity[];
```

Defined in: [src/types.ts:139](https://github.com/moh3n9595/reviewer-suggestion/blob/main/src/types.ts#L139)

New assignments confirmed by a successful write or reconciliation read.

---

### failed

```ts
failed: object[];
```

Defined in: [src/types.ts:143](https://github.com/moh3n9595/reviewer-suggestion/blob/main/src/types.ts#L143)

Requested identities that could not be confirmed as assigned.

#### code

```ts
code: string;
```

#### reviewer

```ts
reviewer: Identity;
```

---

### skipped

```ts
skipped: Identity[];
```

Defined in: [src/types.ts:141](https://github.com/moh3n9595/reviewer-suggestion/blob/main/src/types.ts#L141)

Reviewers already present when assignment refreshed the request.
