import { DecisionRun, DecisionEdge } from './types';

/**
 * GROUNDED "WHY" — Phase 10's seed. One sentence-fragment per piece of
 * EXECUTION EVIDENCE a run holds about a candidate, derived from the edges
 * and NOTHING else. If a route didn't compute it, the why cannot say it —
 * a why built from any other source is post-hoc storytelling, which is the
 * exact thing the graph exists to end (INV-7).
 *
 * Pure. Returns [] when the run holds no evidence about the candidate; the
 * renderer says "no recorded evidence" rather than inventing a reason.
 */
export function groundedWhy(run: DecisionRun, candidateRef: string): string[] {
  const lines: string[] = [];
  const mine = run.edges.filter((e) => e.subject === candidateRef);

  for (const e of mine) {
    if (e.predicate === 'satisfies') {
      lines.push(`satisfies “${e.object}”${provenanceNote(e)}`);
    } else if (e.predicate === 'scored') {
      lines.push(`scored ${e.object}`);
    } else if (e.predicate === 'available_on') {
      const asOf = e.provenance?.observedAt ? ` as of ${e.provenance.observedAt.slice(0, 10)}` : '';
      lines.push(`on ${e.object}${asOf}`);
    } else if (e.predicate === 'rejected') {
      lines.push(`rejected: ${e.object}${provenanceNote(e)}`);
    }
  }
  return lines;
}

function provenanceNote(e: DecisionEdge): string {
  if (!e.provenance) return '';
  const conf =
    typeof e.provenance.confidence === 'number' ? ` · ${Math.round(e.provenance.confidence * (e.provenance.confidence <= 1 ? 100 : 1))}%` : '';
  return ` (${e.provenance.source}${conf})`;
}
