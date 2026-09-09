# Interface: ReviewerSnapshot

Defined in: [src/types.ts:64](https://github.com/moh3n9595/reviewer-suggestion/blob/main/src/types.ts#L64)

Serializable input to the pure ranking function.

## Properties

### context

```ts
context: RequestContext;
```

Defined in: [src/types.ts:65](https://github.com/moh3n9595/reviewer-suggestion/blob/main/src/types.ts#L65)

---

### files

```ts
files: FileSignal[];
```

Defined in: [src/types.ts:67](https://github.com/moh3n9595/reviewer-suggestion/blob/main/src/types.ts#L67)

---

### loads

```ts
loads: Record<string, number>;
```

Defined in: [src/types.ts:69](https://github.com/moh3n9595/reviewer-suggestion/blob/main/src/types.ts#L69)

Missing key means unavailable; zero means successfully observed no load.

---

### members

```ts
members: Member[];
```

Defined in: [src/types.ts:66](https://github.com/moh3n9595/reviewer-suggestion/blob/main/src/types.ts#L66)

---

### warnings

```ts
warnings: Diagnostic[];
```

Defined in: [src/types.ts:70](https://github.com/moh3n9595/reviewer-suggestion/blob/main/src/types.ts#L70)
