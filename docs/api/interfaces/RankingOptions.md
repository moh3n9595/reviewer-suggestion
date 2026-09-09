# Interface: RankingOptions

Defined in: [src/types.ts:81](https://github.com/moh3n9595/reviewer-suggestion/blob/main/src/types.ts#L81)

Ranking configuration. All fields are optional and validated at runtime.

## Properties

### aliases?

```ts
optional aliases?: Record<string, string>;
```

Defined in: [src/types.ts:99](https://github.com/moh3n9595/reviewer-suggestion/blob/main/src/types.ts#L99)

Explicit email → username aliases; never guesses using display names.

---

### exclude?

```ts
optional exclude?: string[];
```

Defined in: [src/types.ts:97](https://github.com/moh3n9595/reviewer-suggestion/blob/main/src/types.ts#L97)

Case-insensitive usernames to exclude.

#### Default Value

```ts
[];
```

---

### fallback?

```ts
optional fallback?: boolean;
```

Defined in: [src/types.ts:103](https://github.com/moh3n9595/reviewer-suggestion/blob/main/src/types.ts#L103)

Defaults to false; activates only when normal selection is empty.

---

### halfLifeDays?

```ts
optional halfLifeDays?: number;
```

Defined in: [src/types.ts:91](https://github.com/moh3n9595/reviewer-suggestion/blob/main/src/types.ts#L91)

Positive number of days before recency evidence halves.

#### Default Value

```ts
30;
```

---

### historyLimit?

```ts
optional historyLimit?: number;
```

Defined in: [src/types.ts:87](https://github.com/moh3n9595/reviewer-suggestion/blob/main/src/types.ts#L87)

Maximum history commits collected per distinct path.

#### Default Value

```ts
30;
```

---

### horizonDays?

```ts
optional horizonDays?: number;
```

Defined in: [src/types.ts:93](https://github.com/moh3n9595/reviewer-suggestion/blob/main/src/types.ts#L93)

Positive age cutoff in days for recency evidence.

#### Default Value

```ts
180;
```

---

### limit?

```ts
optional limit?: number;
```

Defined in: [src/types.ts:83](https://github.com/moh3n9595/reviewer-suggestion/blob/main/src/types.ts#L83)

Maximum selections, including fallback selections.

#### Default Value

```ts
2;
```

---

### maxReviewLoad?

```ts
optional maxReviewLoad?: number;
```

Defined in: [src/types.ts:89](https://github.com/moh3n9595/reviewer-suggestion/blob/main/src/types.ts#L89)

Pending reviews at which availability reaches zero.

#### Default Value

```ts
8;
```

---

### minScore?

```ts
optional minScore?: number;
```

Defined in: [src/types.ts:85](https://github.com/moh3n9595/reviewer-suggestion/blob/main/src/types.ts#L85)

Inclusive score threshold in the range zero to one.

#### Default Value

```ts
0.05;
```

---

### now?

```ts
optional now?: string;
```

Defined in: [src/types.ts:95](https://github.com/moh3n9595/reviewer-suggestion/blob/main/src/types.ts#L95)

Defaults to captured current time; use an ISO string for reproducible runs.

---

### weights?

```ts
optional weights?: Partial<Scores>;
```

Defined in: [src/types.ts:101](https://github.com/moh3n9595/reviewer-suggestion/blob/main/src/types.ts#L101)

Overrides merged with DEFAULT_WEIGHTS; resulting weights must sum to one.
