/**
 * WHICH BRANCH A /api/ask RESPONSE BELONGS TO.
 *
 * Extracted from `AskTheJudge` because the decision is where the bug was, not
 * the markup — and an emptiness check masquerading as a state check is exactly
 * the kind of mistake that hides inside JSX.
 *
 * PURE. No React, no I/O.
 */

export type AskBranch = 'clarify-options' | 'clarify-question' | 'title' | 'results';

export function classifyAskResponse(data: unknown): AskBranch {
  const d = (data ?? {}) as Record<string, unknown>;
  if (d.kind === 'title' && d.verdict) return 'title';

  /* CLARIFICATION IS A STATE, AND THE STATE IS `kind`.
     The count only chooses WHICH clarification to draw. Gating entry on
     `options.length > 0` sent a NOT_FOUND anchor — which correctly carries an
     EMPTY list, because inventing candidates for a title we cannot find is the
     guess this whole workstream exists to prevent — into the generic results
     branch, where it rendered "No title clears all of that" immediately
     followed by the clarification question. */
  if (d.kind === 'clarify') {
    const options = Array.isArray(d.comparisonOptions) ? d.comparisonOptions : [];
    return options.length > 0 ? 'clarify-options' : 'clarify-question';
  }

  return 'results';
}
