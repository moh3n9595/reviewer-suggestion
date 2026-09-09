# Interface: ChangedFile

Defined in: [src/types.ts:39](https://github.com/moh3n9595/reviewer-suggestion/blob/main/src/types.ts#L39)

A changed file; previousPath preserves history for renames.

## Properties

### path

```ts
path: string;
```

Defined in: [src/types.ts:40](https://github.com/moh3n9595/reviewer-suggestion/blob/main/src/types.ts#L40)

---

### previousPath?

```ts
optional previousPath?: string;
```

Defined in: [src/types.ts:41](https://github.com/moh3n9595/reviewer-suggestion/blob/main/src/types.ts#L41)

---

### status

```ts
status: 'added' | 'modified' | 'renamed' | 'deleted';
```

Defined in: [src/types.ts:42](https://github.com/moh3n9595/reviewer-suggestion/blob/main/src/types.ts#L42)
