import type { CanonicalIntent } from '@/lib/interpret/types';

/**
 * THE STATEMENT BOUNDARY — an utterance that states a fact is not an order to
 * search.
 *
 * THE DEFECT THIS EXISTS TO FIX. `interpret()` already reads "My wife likes
 * comedies." correctly: `kind: 'statement'`, `requestClause: ''`, the genre
 * recorded against the COMPANION. Nothing downstream ever asked. `kind` was
 * consulted only to fence other readers off the sentence
 * (`canonicalOwnsLanguage`, `canonicalRecognises`), so the statement fell
 * through to the discovery arms, a legacy parser found the word "comedies", and
 * the deployment answered a remark about someone else's taste with a 24-title
 * comedy grid. The interpretation was right and had nowhere to go — the same
 * class of architecture defect `interpret/types.ts` names in its header.
 *
 * WHAT THE BOUNDARY IS. Exactly one question, asked once, from the canonical
 * reading alone: did this sentence contain a request? A statement did not, so
 * nothing executes — no discovery, no title trial, no conversational search.
 * The taste it carried is still recorded (conversation state keeps it, so the
 * next turn spends it), and the reply says what was heard and asks for the
 * request that was missing.
 *
 * WHAT IT IS NOT. It is not a rule about wives, companions, or comedies: it
 * reads `kind` and nothing else. "I like Yellowstone. What should I watch?"
 * carries a request clause and is a `recommendation`, so it searches. "I had a
 * burrito and want something fun tonight." is a `recommendation` with the
 * burrito set aside as background, so it searches. A bare catalog word
 * ("boxing") is a browse request decided by its own branch upstream and never
 * reaches here.
 *
 * PURE. No React, no I/O, no clock.
 */

/** The utterance carried no executable request — nothing may run. */
export function isBareStatement(intent: CanonicalIntent | null): intent is CanonicalIntent {
  return intent !== null && intent.kind === 'statement';
}

/** Join phrases the way a person would: "a, b and c". */
function listOf(parts: string[]): string {
  if (parts.length <= 1) return parts[0] ?? '';
  return `${parts.slice(0, -1).join(', ')} and ${parts[parts.length - 1]}`;
}

/**
 * What the statement actually told us, in the user's own words — built from the
 * canonical fields only, so it can never claim more than was said.
 */
export function statementRecord(intent: CanonicalIntent): string[] {
  const heldBy = (holder: 'user' | 'companion') =>
    holder === 'companion' ? ' for whoever’s watching with you' : '';
  const out: string[] = [];
  for (const g of intent.genres) {
    out.push(g.wanted ? `${g.span}${heldBy(g.holder)}` : `no ${g.span}${heldBy(g.holder)}`);
  }
  for (const t of intent.tones) {
    out.push(t.wanted ? `${t.term}${heldBy(t.holder)}` : `nothing ${t.term}${heldBy(t.holder)}`);
  }
  for (const s of intent.subjects) out.push(s.wanted ? s.span : `no ${s.span}`);
  for (const p of intent.people) out.push(p.relation === 'excluded' ? `no ${p.span}` : p.span);
  for (const t of intent.titles) {
    if (t.relation === 'liked') out.push(`you liked ${t.span}`);
    else if (t.relation === 'disliked') out.push(`you didn’t like ${t.span}`);
    else if (t.relation === 'seen') out.push(`you’ve seen ${t.span}`);
  }
  for (const p of intent.providers) out.push(p);
  return out.slice(0, 4);
}

/**
 * The reply to a statement: what was heard, then the question the sentence did
 * not answer. Never a result set, never an invented recommendation.
 */
export function acknowledgeStatement(intent: CanonicalIntent): string {
  const heard = statementRecord(intent);
  return heard.length > 0
    ? `Noted — ${listOf(heard)}. What are you in the mood for?`
    : `Noted. What are you in the mood for?`;
}
