# Reader DNA specification

`src/lib/domain/readerDna.ts`. A durable, evolving model of individual taste —
far beyond favorite genres.

## Dimensions

31 dimensions across groups (genre, structure, style, content, format,
behavior), each with an interpretable 0..1 axis and documented low/high poles —
e.g. `pacing` (slow burn ↔ fast), `slow_burn_tolerance`, `complexity`,
`prose_density`, `darkness` (tolerance), `spice`, `series_commitment`,
`audiobook_affinity`, `unreliable_narrator`, `ambiguous_ending`. Stored as a
keyed map, so new axes are added without migration.

## Each dimension carries its evidence

```ts
DimensionState = {
  value, confidence, evidenceCount,
  supporting, contradicting, lastUpdated,
  userConfirmed, stability   // 'stable' | 'emerging' | 'uncertain'
}
```

## Evolution (never permanent from one click)

`applyObservation()` folds an `Observation { key, observed, weight, at }` into a
dimension via an evidence-weighted running mean. Confidence rises with **net
agreeing** evidence and is honest about thin data; a user-confirmed value resists
being moved and holds high confidence. Sources of observations:

- **Reader Interview** (`onboarding/interview.ts`) — each answer maps to
  observations; DNF reasons map to strong signals.
- **Behavior** — finishing, abandoning (with reason), reading appeals.

## Explainability & correction

`explainDimension()` produces an evidence-grounded sentence, e.g. *“You appear to
lean toward a clear preference for ‘Fast-paced’ on preferred pacing — 5 of 6
relevant interactions agreed.”* Users can confirm/correct any dimension
(`confirmDimension`), which pins the value. `profileStrength()` summarizes overall
coverage × confidence; the UI never shows false confidence from a small sample.
