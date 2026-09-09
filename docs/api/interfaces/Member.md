# Interface: Member

Defined in: [src/types.ts:15](https://github.com/moh3n9595/reviewer-suggestion/blob/main/src/types.ts#L15)

A candidate whose repository permissions have been established.

## Extends

- [`Identity`](Identity.md)

## Properties

### access

```ts
access: number;
```

Defined in: [src/types.ts:19](https://github.com/moh3n9595/reviewer-suggestion/blob/main/src/types.ts#L19)

Normalized permission score: writer .6, maintainer .9, administrator 1.

---

### active

```ts
active: boolean;
```

Defined in: [src/types.ts:16](https://github.com/moh3n9595/reviewer-suggestion/blob/main/src/types.ts#L16)

---

### bot

```ts
bot: boolean;
```

Defined in: [src/types.ts:17](https://github.com/moh3n9595/reviewer-suggestion/blob/main/src/types.ts#L17)

---

### emails

```ts
emails: string[];
```

Defined in: [src/types.ts:21](https://github.com/moh3n9595/reviewer-suggestion/blob/main/src/types.ts#L21)

Only known, unambiguous emails should be supplied.

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

### username

```ts
username: string;
```

Defined in: [src/types.ts:12](https://github.com/moh3n9595/reviewer-suggestion/blob/main/src/types.ts#L12)

Provider-linked login; display names are never identity evidence.

#### Inherited from

[`Identity`](Identity.md).[`username`](Identity.md#username)
