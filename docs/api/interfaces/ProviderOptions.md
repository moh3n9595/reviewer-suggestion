# Interface: ProviderOptions

Defined in: [src/types.ts:146](https://github.com/moh3n9595/reviewer-suggestion/blob/main/src/types.ts#L146)

Transport configuration; tokens are supplied by the caller, never logged.

## Properties

### apiUrl?

```ts
optional apiUrl?: string;
```

Defined in: [src/types.ts:152](https://github.com/moh3n9595/reviewer-suggestion/blob/main/src/types.ts#L152)

Full API root, including /api/v3 or /api/v4 on custom hosts.

---

### concurrency?

```ts
optional concurrency?: number;
```

Defined in: [src/types.ts:162](https://github.com/moh3n9595/reviewer-suggestion/blob/main/src/types.ts#L162)

Maximum simultaneous HTTP attempts for this provider.

#### Default Value

```ts
5;
```

---

### fetch?

```ts
optional fetch?: {
  (input, init?): Promise<Response>;
  (input, init?): Promise<Response>;
};
```

Defined in: [src/types.ts:154](https://github.com/moh3n9595/reviewer-suggestion/blob/main/src/types.ts#L154)

Injectable Fetch implementation; defaults to the Node.js global fetch.

#### Call Signature

```ts
(input, init?): Promise<Response>;
```

[MDN Reference](https://developer.mozilla.org/docs/Web/API/Window/fetch)

##### Parameters

| Parameter | Type                   |
| --------- | ---------------------- |
| `input`   | `URL` \| `RequestInfo` |
| `init?`   | `RequestInit`          |

##### Returns

`Promise`\<`Response`\>

#### Call Signature

```ts
(input, init?): Promise<Response>;
```

[MDN Reference](https://developer.mozilla.org/docs/Web/API/Window/fetch)

##### Parameters

| Parameter | Type                           |
| --------- | ------------------------------ |
| `input`   | `string` \| `URL` \| `Request` |
| `init?`   | `RequestInit`                  |

##### Returns

`Promise`\<`Response`\>

---

### logger?

```ts
optional logger?: Logger;
```

Defined in: [src/types.ts:148](https://github.com/moh3n9595/reviewer-suggestion/blob/main/src/types.ts#L148)

Optional Consola-compatible observer; defaults to silent operation.

---

### maxPages?

```ts
optional maxPages?: number;
```

Defined in: [src/types.ts:164](https://github.com/moh3n9595/reviewer-suggestion/blob/main/src/types.ts#L164)

Pagination safety bound; hitting it reports truncation.

#### Default Value

```ts
100;
```

---

### retries?

```ts
optional retries?: number;
```

Defined in: [src/types.ts:160](https://github.com/moh3n9595/reviewer-suggestion/blob/main/src/types.ts#L160)

Extra attempts for rate-limited/server-failed reads.

#### Default Value

```ts
2;
```

---

### signal?

```ts
optional signal?: AbortSignal;
```

Defined in: [src/types.ts:156](https://github.com/moh3n9595/reviewer-suggestion/blob/main/src/types.ts#L156)

Cancels queued and active requests for this provider instance.

---

### timeoutMs?

```ts
optional timeoutMs?: number;
```

Defined in: [src/types.ts:158](https://github.com/moh3n9595/reviewer-suggestion/blob/main/src/types.ts#L158)

Positive timeout per HTTP attempt in milliseconds.

#### Default Value

```ts
15000;
```

---

### token

```ts
token: string;
```

Defined in: [src/types.ts:150](https://github.com/moh3n9595/reviewer-suggestion/blob/main/src/types.ts#L150)

API credential; kept in transport headers and omitted from diagnostics.
