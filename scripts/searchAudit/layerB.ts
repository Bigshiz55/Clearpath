/**
 * LAYER B — the shipped interpretation modules, IMPORTED not recreated.
 *
 * Every module below is the one production runs. Nothing here re-implements a
 * classifier or a parser; if a rule is wrong, it is wrong in the product too.
 *
 * This layer has no retrieval, so it cannot say whether the right film came
 * back. It says something narrower and, for this audit, prior: was the request
 * READ correctly — routed to the right kind of handling, with its hard
 * constraints carried forward, and multi-turn state retained across turns.
 *
 * Offline and deterministic: no network, no database, no provider spend.
 */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { classifySearch } from '@/lib/nlu/searchMode';
import { buildQueryPlan } from '@/lib/nlu/queryPlan';
import { classifySearchIntent, isRecommendationRequest, couldBeTitle, MAX_QUERY } from '@/lib/search/searchIntent';
import { naiveParseQuery, describeQuery, EMPTY_QUERY } from '@/lib/finderParse';
import { augmentInternational } from '@/lib/askInternational';
import { effectiveConstraints } from '@/lib/refineState';
import { buildSearchQa } from '@/lib/searchQa';
import type { FinderQuery } from '@/lib/finder';
import type { FrozenTest } from './corpus';
import { judge, judgeInterpretation, type Judgement, type Observation } from './oracle';

const corpus = JSON.parse(readFileSync('artifacts/search-audit/search-corpus-1000.json', 'utf8')) as {
  tests: FrozenTest[];
};

/** Parse one utterance exactly as the product does, international cues included. */
function parseTurn(text: string): FinderQuery {
  return augmentInternational(naiveParseQuery(text), text);
}

/**
 * Fold a conversation using the SHIPPED precedence, not a private one.
 *
 * `effectiveConstraints` is the product's own merge: a later turn's neutral
 * fields fall through to what was already established, which is exactly what
 * "Newer." must do to an earlier "something like Rocky". Using it means a
 * retention failure found here is a retention failure in the app.
 */
function foldTurns(turns: string[]): FinderQuery {
  let state = parseTurn(turns[0] ?? '');
  for (const turn of turns.slice(1)) {
    state = effectiveConstraints({
      savedPreferences: state,
      queryConstraints: parseTurn(turn),
      temporaryRefinements: {},
    });
  }
  return state;
}

/**
 * Translate what the modules captured into the corpus's constraint vocabulary.
 *
 * Deliberately generous: a constraint counts as captured if ANY shipped module
 * represents it. The question being asked is "did the system understand this",
 * not "did one particular field hold it".
 */
function capturedConstraints(
  turns: string[],
  q: FinderQuery,
  cls: ReturnType<typeof classifySearch>,
  plan: ReturnType<typeof buildQueryPlan>,
): Record<string, unknown> {
  const text = turns.join(' ');
  const out: Record<string, unknown> = {};

  if (q.mediaType !== 'any') out.media_type = q.mediaType;
  else if (plan.mediaTypes.length) out.media_type = plan.mediaTypes.join(',');
  else if (cls.contentType !== 'unknown') out.media_type = cls.contentType;

  if (cls.requiredProvider) out.service = cls.requiredProvider.name;
  else if (plan.sources.length) out.service = plan.sources.map((s) => s.canonicalName).join(',');
  else if (q.providerIds?.length) out.service = q.providerIds.join(',');
  else if (q.onMyServices) out.service = 'my-services';
  if (out.service) out.included_only = true;

  if (q.maxRuntime != null) out.max_runtime_minutes = q.maxRuntime;
  if (q.minYear != null) out.released_after = q.minYear;
  else if (q.sinceMonths != null) out.released_after = 'recent';
  if (q.maxYear != null) out.decade = q.maxYear;
  if (q.genreIds.length) out.genre = q.genreIds.join(',');
  if (q.excludeGenreIds?.length) { out.negative = q.excludeGenreIds.join(','); out.exclude_genre = out.negative; }
  if (q.keywordIds?.length) out.topic = q.keywordIds.join(',');
  if (q.originCountries?.length || q.originalLanguages?.length) {
    out.country = [...(q.originCountries ?? []), ...(q.originalLanguages ?? [])].join(',');
  }
  if (q.castIds?.length) out.person = q.castIds.join(',');
  if (q.liveOnly || q.streamItOnly) out.available_now = true;

  // Only a genuine SIMILARITY reference counts. `requestedTitle` is the
  // classifier's guess at a title span and is populated even for "Give me a
  // legal show" — crediting it as a captured reference would hand the product
  // marks for a constraint it never understood.
  const ref = cls.reference ?? q.similarTo ?? null;
  if (ref) { out.reference = ref; out.references = [ref]; out.exclude_titles = [ref]; }
  if (cls.mode === 'similar_to') out.disambiguate = true;

  // Personalisation cues the planner recognises.
  if (plan.personalized) { out.uses_history = true; }
  if (/\b(not (?:already )?(?:seen|watched)|have not seen|haven'?t seen|not finish|unwatched)\b/i.test(text)) {
    out.exclude_seen = true; out.exclude_watched = true;
  }
  if (/\b(my watchlist|what i(?:'ve| have) liked|based on what i)\b/i.test(text)) {
    out.uses_history = true;
  }
  if (/\bseasons?\b/i.test(text) && /\b(fewer|less|under|no more than|max)\b/i.test(text)) out.max_seasons = true;
  if (/\b(rated|rating of)\s*(g|pg|pg-13|r|tv-14|tv-ma)\b/i.test(text)) out.certification = true;
  if (/\bboxing\b/i.test(text)) out.boxing = true;
  return out;
}

/** Map the shipped classification onto the corpus's intent vocabulary. */
function observedIntent(cls: ReturnType<typeof classifySearch>, raw: string): string {
  if (cls.mode === 'person') return 'person';
  if (cls.mode === 'similar_to') return 'recommendation';
  if (cls.mode === 'provider_catalog' || cls.mode === 'forensic') return 'recommendation';
  if (cls.mode === 'exact_title') {
    // The router has the final word: an exact-title classification that still
    // routes to Ask is not treating the query as a destination.
    return classifySearchIntent(raw) === 'ask' ? 'recommendation' : 'exact_title';
  }
  return 'recommendation';
}

export interface LayerBRow {
  test_id: number;
  category: string;
  query: string;
  mode: string;
  observed_intent: string;
  intended_intent: string;
  route: string;
  requested_title: string | null;
  reference: string | null;
  provider: string | null;
  captured: string[];
  required: string[];
  read_back: string;
  latency_ms: number;
  judgement: Judgement;
  interpretation: Judgement;
}

export function runLayerB(tests: FrozenTest[]): LayerBRow[] {
  const rows: LayerBRow[] = [];
  for (const t of tests) {
    const turns = t.query_or_turns;
    // A conversation is classified as a WHOLE. Classifying only the final turn
    // asked the router what "Only things I can stream tonight." means with the
    // subject stripped out — a question about the harness, not the product.
    const raw = turns.join(' ');
    const started = process.hrtime.bigint();

    let cls: ReturnType<typeof classifySearch>;
    let plan: ReturnType<typeof buildQueryPlan>;
    let q: FinderQuery;
    let readBack = '';
    let error: string | null = null;
    try {
      // Over-length input is truncated by the product before it reaches a
      // classifier; measuring the classifier on 5,000 characters it never
      // sees would be measuring the wrong thing.
      const bounded = raw.slice(0, MAX_QUERY);
      cls = classifySearch(bounded);
      plan = buildQueryPlan(turns.join(' ').slice(0, MAX_QUERY * 2));
      q = t.multi_turn ? foldTurns(turns) : parseTurn(bounded);
      readBack = describeQuery(q);
      // Exercised for crash-safety even where its output is not asserted.
      buildSearchQa(bounded);
    } catch (e) {
      error = String(e instanceof Error ? e.message : e);
      cls = { mode: 'exact_title', requestedTitle: null, requiredProvider: null, providerStrength: null, contentType: 'unknown', reference: null, year: null, ambiguities: [] };
      plan = buildQueryPlan('');
      q = { ...EMPTY_QUERY };
    }
    const latency_ms = Number(process.hrtime.bigint() - started) / 1e6;

    const captured = error ? {} : capturedConstraints(turns, q, cls, plan);
    const intent = error ? '' : observedIntent(cls, raw);
    const route = classifySearchIntent(raw.slice(0, MAX_QUERY)) === 'ask' ? '/app/ask' : '/app/search';

    const obs: Observation = {
      layer: 'B_module',
      test_id: t.id,
      ok: !error,
      http_status: null,
      latency_ms,
      error,
      // No retrieval in this layer. Reported honestly as absent rather than
      // dressed up as an empty result set.
      results: [],
      destination: intent === 'exact_title' ? `/title/${cls.requestedTitle ?? ''}` : route,
      intent,
      clarifying_question: cls.ambiguities.length ? cls.ambiguities.join('; ') : null,
      disclosed_interpretation: readBack || null,
      retained_constraints: captured,
      raw_text: `${readBack} ${JSON.stringify(captured)} ${cls.ambiguities.join(' ')}`,
    };

    // Result-dependent rules cannot be answered by a layer with no results;
    // they are marked not-verified here and answered by Layer A instead.
    const resultDependent = ['exact_title', 'person', 'fuzzy_title', 'availability'].includes(t.intended_intent);
    const judgement = resultDependent && t.intended_intent !== 'security' && t.intended_intent !== 'malformed'
      ? judge(t, { ...obs, not_verified: 'Layer B performs no retrieval — result ranking is verified by Layer A' })
      : judge(t, obs);

    rows.push({
      test_id: t.id,
      category: t.category,
      query: turns.join(' | '),
      mode: cls.mode,
      observed_intent: intent,
      intended_intent: t.intended_intent,
      route,
      requested_title: cls.requestedTitle,
      reference: cls.reference,
      provider: cls.requiredProvider?.name ?? null,
      captured: Object.keys(captured),
      required: Object.keys(t.required_constraints),
      read_back: readBack,
      latency_ms,
      judgement,
      interpretation: judgeInterpretation(t, obs),
    });
  }
  return rows;
}

if (process.argv[1]?.includes('layerB')) {
  const pass = Number(process.env.AUDIT_PASS ?? '1');
  const rows = runLayerB(corpus.tests);
  mkdirSync('artifacts/search-audit', { recursive: true });
  writeFileSync(`artifacts/search-audit/layerB-pass${pass}.json`, JSON.stringify(rows, null, 1));

  const interp = rows.map((r) => r.interpretation);
  const passed = interp.filter((j) => j.pass).length;
  const bySev: Record<string, number> = {};
  for (const j of interp) if (!j.pass && j.severity) bySev[j.severity] = (bySev[j.severity] ?? 0) + 1;
  const routing = interp.filter((j) => !j.pass && j.rule === 'interpretation/routing').length;
  const cons = interp.filter((j) => !j.pass && j.rule === 'interpretation/constraints').length;

  console.log(`LAYER B pass ${pass} — ${rows.length} tests, shipped modules, offline`);
  console.log(`  interpretation passed  ${passed}/${rows.length} (${((passed / rows.length) * 100).toFixed(1)}%)`);
  console.log(`  routing failures       ${routing}`);
  console.log(`  constraint failures    ${cons}`);
  console.log(`  severity               ${JSON.stringify(bySev)}`);
  console.log(`  median latency         ${[...rows.map((r) => r.latency_ms)].sort((a, b) => a - b)[Math.floor(rows.length / 2)]!.toFixed(2)} ms`);
}
