/**
 * Interpretation generator — produces a ranked, CANONICAL set of interpretations
 * with a confidence distribution that sums to ~1. PURE + language-independent: it
 * consumes canonical cue scores + resolved entities, never display text.
 *
 * The confidence distribution is what the clarification policy reads: a clean
 * unique title with no action cue lands HIGH (answer); an ambiguous airing verb
 * ("Rocky coming/viene/やる") splits across live-TV/upcoming and lands LOW (clarify).
 */
import { scoreIntentCues } from './cues';
import { resolveEntities, type ResolvedEntities } from './entities';
import { INTENT_MEANING, type CanonicalIntent, type CanonicalInterpretation } from './canonical';

export interface InterpretationSet {
  original: string;
  normalized: string;
  entities: ResolvedEntities;
  interpretations: CanonicalInterpretation[];
  /** Margin between the top two interpretations (0..1) — feeds ambiguity scoring. */
  margin: number;
}

/** Description markers ⇒ the user is describing, not naming, a title ("that train
 *  movie", "the one with", "British detective") → don't guess a bare title. */
const DESCRIPTION_MARKERS = [
  'that ', 'the one', 'with the', 'movie with', 'film with', 'film about', 'show about',
  'thing with', 'guy from', 'lady from', 'woman from', 'detective', 'about a', 'about the',
];

/** After stripping generic words, is this a plausible bare TITLE (vs a description)? */
function looksLikeBareTitle(query: string): boolean {
  const low = ' ' + query.toLowerCase().trim() + ' ';
  if (DESCRIPTION_MARKERS.some((m) => low.includes(m))) return false;
  const residual = query.toLowerCase().replace(/\b(the|a|an|movie|film|show|series|watch)\b/gi, '').trim();
  const tokens = residual.split(/\s+/).filter(Boolean);
  return tokens.length >= 1 && tokens.length <= 4;
}

export function generateInterpretations(query: string): InterpretationSet {
  const entities = resolveEntities(query);
  // Score cues on the query WITHOUT the resolved title span, so words inside a
  // title ("dark" in "The Dark Knight") don't fire mood/genre/action cues.
  const cueText = entities.matchedAlias
    ? query.toLowerCase().split(entities.matchedAlias.toLowerCase()).join(' ')
    : query;
  const cueScores = scoreIntentCues(cueText);
  const hasCues = Object.keys(cueScores).length > 0;
  const scores: Record<string, number> = { ...cueScores };
  const add = (i: CanonicalIntent, w: number) => { scores[i] = (scores[i] ?? 0) + w; };

  if (entities.title) {
    if (hasCues) {
      // The user expressed an action; the title is the object. Small priors keep
      // secondary readings available for the clarification chips.
      add('find_title', 0.1); add('streaming_lookup', 0.1);
      add('franchise_lookup', entities.title.isFranchiseName ? 0.1 : 0.04);
    } else if (entities.title.isFranchiseName) {
      // A bare franchise name is genuinely ambiguous (the title vs the franchise).
      add('find_title', 0.3); add('franchise_lookup', 0.3); add('streaming_lookup', 0.12);
    } else {
      // A clean, unique title with no action → just find it (lands HIGH).
      add('find_title', 0.8); add('streaming_lookup', 0.12); add('franchise_lookup', 0.03);
    }
  } else if (entities.entityType === 'genre') { add('genre_browse', 0.9);
  } else if (entities.entityType === 'mood') { add('mood_search', 0.9);
  } else if (entities.entityType === 'service') { add('availability_by_service', 0.9);
  } else if (!hasCues && looksLikeBareTitle(query)) {
    // A plausible bare title not in the offline catalog: provisional find_title
    // (production resolves it via TMDB). Medium confidence → answer + alternatives.
    add('find_title', 0.6); add('streaming_lookup', 0.14);
  } else if (!hasCues) { add('unknown', 0.5); add('recommendation', 0.2); }

  // A provisional bare title carries the query itself as its display name.
  const provisionalName = !entities.entityName && looksLikeBareTitle(query) && !hasCues
    ? query.trim().replace(/^(the|a|an)\s+/i, '')
    : null;

  const total = Object.values(scores).reduce((a, b) => a + b, 0) || 1;
  const interpretations: CanonicalInterpretation[] = (Object.entries(scores) as [CanonicalIntent, number][])
    .map(([intent, s]) => ({
      intent,
      meaningKey: INTENT_MEANING[intent],
      entityType: entities.entityType,
      entityRef: entities.title?.id ?? (entities.franchiseId ?? null),
      entityName: entities.entityName ?? provisionalName,
      confidence: Math.round((s / total) * 1000) / 1000,
    }))
    .sort((a, b) => b.confidence - a.confidence)
    .slice(0, 5);

  const margin = interpretations.length >= 2 ? Math.round((interpretations[0]!.confidence - interpretations[1]!.confidence) * 1000) / 1000 : (interpretations[0]?.confidence ?? 0);
  return { original: query, normalized: query.trim(), entities, interpretations, margin };
}
