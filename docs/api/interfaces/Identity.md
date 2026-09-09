# Interface: Identity

Defined in: [src/types.ts:4](https://github.com/moh3n9595/reviewer-suggestion/blob/main/src/types.ts#L4)

Provider-qualified identity; IDs are strings to avoid numeric assumptions.

## Extended by

- [`Member`](Member.md)
- [`ScoredCandidate`](ScoredCandidate.md)

## Properties

### host

```ts
host: string;
```

Defined in: [src/types.ts:8](https://github.com/moh3n9595/reviewer-suggestion/blob/main/src/types.ts#L8)

API origin, such as `https://api.github.com`; excludes the API path.

---

### id

```ts
id: string;
```

Defined in: [src/types.ts:10](https://github.com/moh3n9595/reviewer-suggestion/blob/main/src/types.ts#L10)

Provider-assigned account ID, represented as a string.

---

### provider

```ts
provider: Platform;
```

Defined in: [src/types.ts:6](https://github.com/moh3n9595/reviewer-suggestion/blob/main/src/types.ts#L6)

Hosting platform; combine with host and ID when comparing identities.

---

### username

```ts
username: string;
```

Defined in: [src/types.ts:12](https://github.com/moh3n9595/reviewer-suggestion/blob/main/src/types.ts#L12)

Provider-linked login; display names are never identity evidence.
