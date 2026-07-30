# Catalog provider interface and real-ingestion plan

The funnel reads a `CatalogProvider`. Today two implementations matter: the
deterministic **synthetic** catalog (tests, benchmarks, the founder lab) and the
**Postgres** catalog defined by migration 0031. Real TMDB ingestion is
deliberately **not built** — this document is what it would take.

## Fields a real provider must supply

Required for the funnel to work at all:

| Field | Used by | If missing |
|---|---|---|
| `id`, `mediaType`, `title` | everything | title is unusable |
| `genres` | metadata channel, diversification | drops out of genre matching |
| `runtimeMinutes` | hard filter | **passes** the runtime filter (unknown ≠ violation) |
| `releaseYear` | hard filter, decade diversity | passes; counts as `decade:unknown` |
| `originalLanguage` | hard filter | passes the language filter |
| `availability[]` with `provider`, `monetization`, `region`, `verifiedAt` | hard filter, availability confidence | treated as *no confirmed availability*, never as available |
| `audienceScore` / `voteCount` | quality channel, fast rank | quality component dropped, weights renormalise |
| `vector` per view | semantic + DNA channels | those channels return nothing; the funnel still produces a court |

Strongly wanted, degrade gracefully:
`keywords`, `cast`, `director`, `leadPerformers`, `franchise`, `sequenceOrder`,
`remakeOf`/`sequelOf`, `synopsis`, `contentRating`, and the 16 experience
features (`gore`, `violence`, `humor`, `endingTone`, `mainstream`, …).

**Rule the interface enforces:** a missing value is `null`, never `false` and
never `0`. Coercing unknown gore to 0 would silently claim a film is not gory.

## Ingestion plan (not implemented)

### 1. Initial import
- TMDB `/discover` paged by release year × genre to stay under the 500-page cap
  per query; a single unfiltered discover cannot reach 50k.
- Per title, a `/movie/{id}?append_to_response=credits,keywords,watch/providers`
  call. **That is 1 request per title** — 50,000 titles ≈ 50,000 requests.
- At TMDB's ~50 req/s practical ceiling: **~17 minutes** of wall clock at full
  rate, realistically a few hours with backoff. Must be a resumable job, not a
  request handler.

### 2. Incremental updates
- TMDB publishes daily `changes` endpoints per media type. Poll `/movie/changes`
  daily, enqueue only changed ids. This is the difference between ~50k
  requests/day and ~2k.

### 3. Deletions and merges
- `changes` includes removals; TMDB also merges duplicate ids. Store
  `external_ids` as jsonb and reconcile on `imdb_id` when a TMDB id disappears,
  rather than deleting a title a user may have in a watchlist. Prefer
  `active = false` over `DELETE`.

### 4. Availability refresh
- Availability is the most perishable field. Refresh on a **separate, faster
  cadence** than metadata (daily for popular titles, weekly for the tail), and
  always write `verified_at`. The hard filter already rejects claims older than
  14 days, so a stalled refresher degrades to "unconfirmed", not to a lie.

### 5. Rate limiting, retries, attribution
- Token-bucket limiter shared across workers; exponential backoff on 429 with
  jitter; circuit breaker that pauses the job rather than hammering.
- TMDB's terms require attribution — the UI must carry it wherever TMDB data is
  shown.

### 6. Images
- Do not proxy or re-host. Store `poster_path` and build URLs through the
  existing client-safe `src/lib/tmdb/image.ts` helper.

### 7. Storage
Measured at 5,000 synthetic titles: ~14 MB with 3 × 32-dim fixture vectors.
Real 1536-dim embeddings are ~6 KB each: **50k titles × 1 view ≈ 300 MB of
vectors alone**, plus ~150 MB of metadata and indexes.

## Cost inputs — deliberately not an estimate

I will not put a dollar figure on this. It needs three numbers I do not have:

1. **Final catalog size** — the funnel needs ≥50k for the 2,500 floor to bind,
   but "how much of TMDB is worth carrying" is a product decision.
2. **Embedding provider and dimensionality** — cost scales with tokens embedded
   and re-embedding cadence, and no provider is chosen.
3. **Your Supabase tier's storage and egress pricing** at that volume.

Give me those and the arithmetic is straightforward.
