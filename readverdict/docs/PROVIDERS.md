# Provider adapter guide

Book data comes through provider adapters (`src/lib/providers/`), never a
hard-coded vendor.

## Interface

Implement `BookProvider`:

```ts
{ key, displayName, isMock?, search(q), getByIsbn?(isbn), health() }
```

Return a `ProviderResult<T>` with an honest `DataState`
(`ok | no_data | not_requested | provider_failure | not_applicable |
genuine_zero | insufficient_sample`). **Never** return `0`/empty to mean
"unavailable" — use the state.

## Registry

`ProviderRegistry` composes providers with caching, retries + backoff,
cross-provider fallback, and health aggregation. Add a provider in
`providers/index.ts`:

```ts
new ProviderRegistry([openLibraryProvider, myProvider, mockProvider], { … })
```

Order = priority; the first usable result wins and its `source` is recorded for
attribution.

## Normalization

`providerBookToWork(pb, now)` maps a `ProviderBook` → domain `Work`+`Edition`,
attaching provenance and sample-size-based confidence to sourced fields.

## Current providers

| Provider | Status | Notes |
| --- | --- | --- |
| Open Library | **Real** | Keyless, server-only, primary |
| Mock | **Real (labelled)** | Fixtures for offline/dev; UI shows a "sample data" chip |

## Adding licensed sources (Google Books, ISBNdb, audiobook/library, retail)

Write an adapter implementing `BookProvider`, add its key to the source-priority
table in `provenance.ts`, register it, document the required env var, and add a
mock/dev mode. Availability/retail/library providers must attach real
provenance and must not assert current availability without verified data.
