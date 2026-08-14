/**
 * THE RETRIEVAL FUNNEL, READ HONESTLY.
 *
 * `/api/ask` returns the finder's own per-stage counters, and the boundary
 * where candidates died is the first stage that REACHED zero — but only among
 * stages that actually RAN. `semanticEvaluatedCount` is null when no subject
 * was required: the stage did not run, and the previous renderer read that
 * sentinel-zero as "candidates died at semantic evaluation" on runs that
 * returned real titles. Not-applicable is rendered as n/a and can never be a
 * death boundary.
 */

/** [label, value] pairs in pipeline order. Null/undefined = stage n/a. */
export function funnelStages(d) {
  return [
    ['requested', d.requestedCount],
    ['candidates discovered', d.candidateCount],
    ['deterministic eligible', d.deterministicEligibleCount],
    ['semantically evaluated', d.semanticEvaluatedCount],
    ['subject eligible', d.centralSubjectEligibleCount],
    ['quality eligible', d.qualityEligibleCount],
    ['returned', d.finalReturnedCount],
  ];
}

export function renderFunnel(stages) {
  return stages.map(([k, v]) => `${k}=${v ?? 'n/a'}`).join(' → ');
}

/** The first APPLICABLE stage that reached zero, or null when none did. */
export function diedAt(stages) {
  const firstZero = stages.find(([, v]) => v === 0);
  return firstZero ? firstZero[0] : null;
}
