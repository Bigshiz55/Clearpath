/**
 * Stage 5 — Recovery Mode. The core promise: WatchVerdict NEVER shows a bare
 * "No results" after a literal search. When no candidate clears the confidence
 * bar, we return honest INTERPRETATIONS (likely readings of the query) + useful
 * SUGGESTIONS (real refinements/navigation), and at most ONE clarifying question,
 * only when genuinely necessary. It NEVER fabricates titles — every concrete title
 * it offers must come from actual candidates passed in.
 */
import type {
  Intent, Expansion, ScoredCandidate, RecoveryResult, Interpretation, Suggestion, IntentKind,
} from './types';

const INTENT_LABEL: Record<IntentKind, string> = {
  title_lookup: 'Look up a specific title',
  similar_to: 'Find titles similar to one you named',
  actor: 'Find titles with a specific actor',
  franchise: 'Explore a franchise or collection',
  genre: 'Browse a genre',
  availability: 'Check where something is streaming',
  schedule: "See what's on now",
  upcoming: 'See upcoming releases',
  recommendation: 'Get a personal recommendation',
  incomplete: 'Finish an incomplete request',
  conversational: 'Get some ideas',
  unknown: 'Search',
};

export function recover(
  originalQuery: string,
  intent: Intent,
  expansions: Expansion[],
  candidates: ScoredCandidate[],
): RecoveryResult {
  const interpretations: Interpretation[] = [];
  const suggestions: Suggestion[] = [];

  // 1) Interpretations — the top intent + credible secondary readings, each with a
  //    concrete re-runnable query drawn from the real expansions/entities.
  const primaryQuery = intent.entities.title ?? intent.entities.franchise ?? expansions[0]?.query ?? originalQuery;
  interpretations.push({ label: INTENT_LABEL[intent.kind], intent: intent.kind, query: primaryQuery });
  for (const alt of intent.also.slice(0, 2)) {
    interpretations.push({ label: INTENT_LABEL[alt], intent: alt, query: primaryQuery });
  }

  // 2) "Did you mean" — surface the strongest spelling/alias rewrite if it differs.
  const rewrite = expansions.find((e) => (e.kind === 'spelling' || e.kind === 'alias') && e.query.toLowerCase() !== originalQuery.toLowerCase());
  if (rewrite) suggestions.push({ kind: 'did_you_mean', label: `Did you mean “${rewrite.query}”?`, action: rewrite.query });

  // 3) Near-miss candidates (medium/low confidence) offered as leads — NEVER as
  //    confident matches, and only real titles that a source actually returned.
  const nearMisses = candidates.filter((c) => c.confidenceBand !== 'high').slice(0, 5);
  for (const c of nearMisses) {
    suggestions.push({ kind: 'broaden', label: `Maybe: ${c.title}${c.year ? ` (${c.year})` : ''}`, action: c.id });
  }

  // 4) Actionable refinements tailored to the intent — navigation, not fabrication.
  if (intent.entities.genre) suggestions.push({ kind: 'browse', label: `Browse ${intent.entities.genre}`, action: `genre:${intent.entities.genre}` });
  if (intent.kind === 'availability' && intent.entities.title) suggestions.push({ kind: 'refine', label: `See all providers for “${intent.entities.title}”`, action: `title:${intent.entities.title}` });
  if (intent.kind === 'recommendation' || intent.conversational) suggestions.push({ kind: 'browse', label: 'Show trending picks for you', action: 'trending' });
  if (!suggestions.some((s) => s.kind === 'browse')) suggestions.push({ kind: 'browse', label: 'Browse trending titles', action: 'trending' });

  // 5) A single clarifying question ONLY when the intent is genuinely ambiguous or
  //    the request is incomplete — otherwise we lead with suggestions, not questions.
  let clarifyingQuestion: string | null = null;
  if (intent.incomplete) clarifyingQuestion = 'It looks like your request got cut off — who or what did you have in mind?';
  else if (intent.kind === 'unknown' && candidates.length === 0) clarifyingQuestion = 'Tell me a title, actor, or genre and I’ll take it from there.';
  else if (intent.confidence < 0.4 && interpretations.length > 1) clarifyingQuestion = `Did you mean to ${INTENT_LABEL[intent.kind].toLowerCase()}, or ${INTENT_LABEL[intent.also[0] ?? 'genre'].toLowerCase()}?`;

  const message = candidates.length
    ? 'No exact match cleared the bar, but here are the most likely reads and some leads.'
    : 'I didn’t find a confident match — here’s what I think you meant and where to go next.';

  return { interpretations, suggestions: dedupeSuggestions(suggestions), clarifyingQuestion, message };
}

function dedupeSuggestions(s: Suggestion[]): Suggestion[] {
  const seen = new Set<string>();
  return s.filter((x) => { const k = x.kind + '|' + x.label; if (seen.has(k)) return false; seen.add(k); return true; }).slice(0, 8);
}
