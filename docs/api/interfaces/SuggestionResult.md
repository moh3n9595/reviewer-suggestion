# Interface: SuggestionResult

Defined in: [src/types.ts:124](https://github.com/moh3n9595/reviewer-suggestion/blob/main/src/types.ts#L124)

Suggested reviewers, diagnostics, and captured request context.

## Properties

### belowThreshold

```ts
belowThreshold: ScoredCandidate[];
```

Defined in: [src/types.ts:128](https://github.com/moh3n9595/reviewer-suggestion/blob/main/src/types.ts#L128)

Up to three eligible candidates with evidence below the score threshold.

---

### context

```ts
context: RequestContext;
```

Defined in: [src/types.ts:134](https://github.com/moh3n9595/reviewer-suggestion/blob/main/src/types.ts#L134)

Captured request context; assignment always refreshes it before writing.

---

### partial

```ts
partial: boolean;
```

Defined in: [src/types.ts:132](https://github.com/moh3n9595/reviewer-suggestion/blob/main/src/types.ts#L132)

True when optional collection produced warnings.

---

### selected

```ts
selected: ScoredCandidate[];
```

Defined in: [src/types.ts:126](https://github.com/moh3n9595/reviewer-suggestion/blob/main/src/types.ts#L126)

Ranked suggestions in stable score, normalized username, and ID order.

---

### warnings

```ts
warnings: Diagnostic[];
```

Defined in: [src/types.ts:130](https://github.com/moh3n9595/reviewer-suggestion/blob/main/src/types.ts#L130)

Safe diagnostics for optional collection failures and truncated signals.
