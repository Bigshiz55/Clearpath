/**
 * THE RETRIEVAL FAN-OUT BUDGET — GC11.
 *
 * `runStrands` issues one `runFinder` per GC5 strand. They run concurrently, so
 * wall-clock is roughly one strand, but the TMDB call budget is genuinely N×
 * and that is a real cost paid on every comparative request.
 *
 * The cap lives here rather than inside `strands.ts` because that module is
 * `server-only`: a budget nothing can read is a budget nothing can check, and
 * the point of declaring one is that a test can hold the fan-out to it.
 *
 * PURE — no imports, safe from any environment.
 */

/**
 * Maximum strands issued for a single comparative request.
 *
 * `better_than` emits four (recall-floor, anchor-keywords, anchor-genres,
 * acclaim), which is the widest non-blend case; `blend` fans per seed and is
 * held to the same ceiling. Raising this multiplies the per-request TMDB budget
 * directly, so it is a deliberate ceiling rather than a default.
 */
export const MAX_STRANDS = 5;
