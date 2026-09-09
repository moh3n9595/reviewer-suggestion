# Interface: ScoredCandidate

Defined in: [src/types.ts:106](https://github.com/moh3n9595/reviewer-suggestion/blob/main/src/types.ts#L106)

A ranked reviewer and the evidence explaining their score.

## Extends

- [`Identity`](Identity.md)

## Properties

### breakdown

```ts
breakdown: Scores;
```

Defined in: [src/types.ts:110](https://github.com/moh3n9595/reviewer-suggestion/blob/main/src/types.ts#L110)

Unweighted signal values, each between zero and one.

---

### evidence

```ts
evidence: object;
```

Defined in: [src/types.ts:112](https://github.com/moh3n9595/reviewer-suggestion/blob/main/src/types.ts#L112)

Deduplicated paths that justify contribution and ownership signals.

#### contributedFiles

```ts
contributedFiles: string[];
```

#### historySources

```ts
historySources: Record<string, string>;
```

Changed path → history path; exposes parent-directory proxies.

#### ownedFiles

```ts
ownedFiles: string[];
```

---

### host

```ts
host: string;
```

Defined in: [src/types.ts:8](https://github.com/moh3n9595/reviewer-suggestion/blob/main/src/types.ts#L8)

API origin, such as `https://api.github.com`; excludes the API path.

#### Inherited from

[`Identity`](Identity.md).[`host`](Identity.md#host)

---

### id

```ts
id: string;
```

Defined in: [src/types.ts:10](https://github.com/moh3n9595/reviewer-suggestion/blob/main/src/types.ts#L10)

Provider-assigned account ID, represented as a string.

#### Inherited from

[`Identity`](Identity.md).[`id`](Identity.md#id)

---

### provider

```ts
provider: Platform;
```

Defined in: [src/types.ts:6](https://github.com/moh3n9595/reviewer-suggestion/blob/main/src/types.ts#L6)

Hosting platform; combine with host and ID when comparing identities.

#### Inherited from

[`Identity`](Identity.md).[`provider`](Identity.md#provider)

---

### reason

```ts
reason: 'ranked' | 'owner-fallback' | 'maintainer-fallback' | 'member-fallback';
```

Defined in: [src/types.ts:120](https://github.com/moh3n9595/reviewer-suggestion/blob/main/src/types.ts#L120)

---

### score

```ts
score: number;
```

Defined in: [src/types.ts:108](https://github.com/moh3n9595/reviewer-suggestion/blob/main/src/types.ts#L108)

Weighted sum of the normalized signals, between zero and one.

---

### username

```ts
username: string;
```

Defined in: [src/types.ts:12](https://github.com/moh3n9595/reviewer-suggestion/blob/main/src/types.ts#L12)

Provider-linked login; display names are never identity evidence.

#### Inherited from

[`Identity`](Identity.md).[`username`](Identity.md#username)
