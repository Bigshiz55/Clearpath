import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { MediaType } from '@/lib/types';
import type { PreferenceTrait } from '@/lib/types';
import { discoverTitles } from '@/lib/tmdb/client';
import { getScoringData } from '@/lib/titleData';
import { buildVerdict, avoidRule, loveRule } from '@/lib/scoring';
import { getProfile, getPersonalContext, regionFor, getMyServices } from '@/lib/profile';
import { includedServiceNames, streamingNames } from '@/lib/services';
import { deciderSearchUrl } from '@/lib/tmdb/meta-helpers';
import { getNextAiring, type NextAiring } from '@/lib/onTv';
import { tileRatingsFromScore, type TileRatings } from '@/lib/ratings';
import type { PersonalContext } from '@/lib/scoring/personal';
import type { TitleMetadata } from '@/lib/types';
import { buildItemExplanation, assembleHousehold, type VerdictExplanation, type HouseholdVerdict } from '@/lib/finderExplain';
import {
  candidateTarget,
  discoverPages,
  enoughSurvivors,
  isKeywordStarved,
  mapPool,
  waves,
  HYDRATE_CONCURRENCY,
  WAVE_SIZE,
} from '@/lib/finderPool';
import { DEFAULT_RESULT_COUNT, MAX_REQUESTED_COUNT } from '@/lib/nlu/count';
import {
  evaluateSubjectCentrality,
  type SubjectRequirement,
  type SemanticStatus,
  type SubjectCentrality,
  type CandidateEvidence,
} from '@/lib/nlu/semanticEligibility';
import { adjudicateSubjectCentrality, type SubjectAdjudicator } from '@/lib/nlu/subjectAdjudicator';
import { readSubjectFacts, writeSubjectFact, readTitleKnowledge, type StoredSubjectFact } from '@/lib/knowledge/store';
import { resolveAmbiguousSubject } from '@/lib/knowledge/resolve';
import { applyHeaderRanking } from '@/lib/knowledge/toneRank';

const FAST_GENRES = ['action', 'thriller', 'adventure', 'crime', 'war', 'horror', 'science fiction'];
const SLOW_GENRES = ['drama', 'romance', 'history', 'documentary', 'mystery', 'music'];

/** Rough pace estimate (0 slow-burn .. 100 adrenaline) from genre + runtime. Heuristic, labeled as such in the UI. */
export function paceScore(meta: TitleMetadata): number {
  const g = meta.genres.map((x) => x.toLowerCase());
  let s = 50;
  for (const x of g) {
    if (FAST_GENRES.includes(x)) s += 14;
    if (SLOW_GENRES.includes(x)) s -= 12;
  }
  if (meta.mediaType === 'movie' && meta.runtimeMinutes) {
    if (meta.runtimeMinutes >= 150) s -= 10;
    else if (meta.runtimeMinutes <= 95) s += 8;
  }
  return Math.max(0, Math.min(100, Math.round(s)));
}

/** TV: is every episode of the current season out (no imminent next episode)? Movies are always "bingeable". */
function isBingeable(meta: TitleMetadata): boolean {
  if (meta.mediaType !== 'tv') return true;
  const status = (meta.status ?? '').toLowerCase();
  if (status.includes('ended') || status.includes('cancel')) return true;
  return !meta.nextEpisodeDate;
}

/** A specific person to score for (a crew member / guest), instead of "you". */
export interface Watcher {
  name: string;
  love: string[];
  avoid: string[];
}

export interface FinderQuery {
  mediaType: 'any' | 'movie' | 'tv';
  genreIds: number[];
  maxRuntime: number | null;
  sinceMonths: number | null;
  minAudience: number | null; // 0..100 — TMDB crowd score
  minImdb: number | null; // 0..10 — minimum IMDb rating
  englishAudioOnly: boolean;
  /** "English DUBBED" — a NON-English original that offers an English dub.
   *  Stricter than englishAudioOnly: native-English titles are excluded, so a
   *  candidate qualifies only when englishAvailability === 'available'. */
  englishDubOnly?: boolean;
  /** "FOREIGN" — a NON-English original, regardless of dub. A title whose
   *  original language is English is never a valid answer. Weaker than
   *  englishDubOnly (which additionally requires a verified English track). */
  nonEnglishOriginalOnly?: boolean;
  onMyServices: boolean;
  /** Explicit streaming provider ids to require (the on-home service checkboxes). */
  providerIds?: number[];
  minMatch: number | null; // 0..100
  /** Only titles our verdict rules WATCH IT ("Stream It"). */
  streamItOnly: boolean;
  /** TV only: every episode of the latest season is out (bingeable now). */
  bingeableOnly: boolean;
  /** Only titles that haven't come out yet (upcoming movies & new shows). */
  upcoming: boolean;
  /** "Live TV": TV shows that actually have a real upcoming broadcast airing. */
  liveOnly: boolean;
  /** Desired pace 0 (slow burn) .. 100 (adrenaline); null = any. */
  pace: number | null;
  /** Bias candidates toward titles featuring these TMDB people (with_cast). */
  castIds?: number[];
  /** Only titles released no later than this year (for "classics"). */
  maxYear?: number | null;
  /** Only titles released in or after this year (era ranges). */
  minYear?: number | null;
  /** Genre ids to exclude (content comfort — e.g. horror). */
  excludeGenreIds?: number[];
  /** Requested production origin (ISO-3166, e.g. ['ES']) — restricts candidates
   *  to that origin so "a Spanish film" never returns a US-only blockbuster. */
  originCountries?: string[];
  /** Requested original language (ISO-639-1, e.g. ['es']). */
  originalLanguages?: string[];
  /** TMDB keyword ids for trope/vibe filtering (heist, dystopia, feel-good…). */
  keywordIds?: number[];
  /**
   * REQUIRED-SUBJECT keyword ids — a HARD constraint the user named ("a boxing
   * movie"). Unlike `keywordIds` (soft vibe), these may NEVER be relaxed and the
   * shortfall may NEVER be padded with generic titles: a title without one of
   * these tags is not a valid answer. Applied as `with_keywords` at discovery,
   * so every returned candidate carries the subject tag as its own evidence.
   */
  subjectKeywordIds?: number[];
  /** Human label for the required subject ("Boxing") — drives the chip + read-back. */
  subjectLabel?: string;
  /** Canonical subject key ("boxing") — for the per-title evidence receipt. */
  subjectCanonical?: string;
  /** The subject's vocabulary for the semantic-eligibility evaluator. When
   *  present, a keyword match is only a CANDIDATE signal — every returned title
   *  must be judged CENTRAL (or MATERIAL when non-strict) before it is eligible. */
  subjectLexemes?: string[];
  /** Strict subject request ("a boxing movie") → only CENTRAL is eligible. */
  subjectStrict?: boolean;
  /** Final user-facing result count the phrasing asked for (1 for "a boxing
   *  movie"). A FINAL-selection cap only — never the discovery pool size. */
  finalCount?: number | null;
  /** Desired tones / settings (softPreferences.tones / .themes on the AI-primary
   *  path). A compiled title-knowledge tone/setting match applies a small,
   *  bounded, eligibility-subordinate ranking nudge — never a filter. Absent ⇒
   *  the nudge is a no-op. */
  requestedTones?: string[];
  requestedSettings?: string[];
  /** Keyword ids to EXCLUDE (`without_keywords`) — "a boxing movie, not wrestling". */
  excludeKeywordIds?: number[];
  /** Exact earliest release date (ISO yyyy-mm-dd) — "made within the last 20
   *  years" becomes an exact calendar boundary, not currentYear-20. */
  minReleaseDate?: string;
  /** A reference title the ask compared to ("shows like Mindhunter") — for the
   *  read-back only; the "more like this" seeding happens in askSimilarTo. */
  similarTo?: string;
  /** Monetization filter for discovery — 'flatrate', 'flatrate|free|ads', … .
   *  "Included with a subscription" is a HARD ask; rentals must not satisfy it. */
  monetization?: string;
}

export interface FinderItem {
  id: number;
  mediaType: MediaType;
  title: string;
  year: number | null;
  posterPath: string | null;
  matchScore: number;
  generalScore: number;
  primaryCall: string;
  reason: string;
  where: string | null;
  receipts: string[];
  deciderUrl: string;
  ratings: TileRatings;
  imdbId?: string | null;
  /** TV only: the next real broadcast/stream airing (channel + time), if any. */
  airing?: NextAiring | null;
  /** "Why this Verd1ct?" — real reasons/requirements/confidence for the card. */
  explain?: VerdictExplanation;
  /** Floor-weighted joint verdict when several people are watching. */
  household?: HouseholdVerdict | null;
  /** The semantic-eligibility verdict for a required subject ("boxing") —
   *  present ONLY when the request named one. `satisfied` is TRUE only when the
   *  subject is genuinely eligible (CENTRAL for a strict request), NOT merely
   *  because a keyword matched. Carries the centrality class, confidence, the
   *  real evidence summary, and the rejection reason when it did not qualify. */
  subjectEvidence?: {
    constraint: string;
    satisfied: boolean;
    status: SemanticStatus;
    centrality: SubjectCentrality;
    confidence: number;
    evidenceType: 'centrality';
    evidence: string;
    rejectionReason: string | null;
    /** The deterministic verdict was borderline (a single tag + light mention):
     *  the semantic adjudicator arbitrates these before ranking. */
    ambiguous: boolean;
    /** How the FINAL eligibility was decided — deterministic rules, a reused
     *  COMPILED fact from the Knowledge Layer (no model call), or a live model
     *  adjudication of the ambiguous band. */
    decidedBy: 'deterministic' | 'knowledge' | 'adjudicator';
  };
}

/** The distinct pipeline stages, counted honestly — so "24 candidates" can
 *  never again be reported as "24 recommendations". */
export interface FinderDiagnostics {
  /** What the phrasing asked for (1 for "a boxing movie"); null = browse. */
  requestedCount: number | null;
  /** Titles discovered (keyword/genre pool, after de-dupe & seen-removal). */
  candidateCount: number;
  /** Candidates that cleared every DETERMINISTIC hard filter (type, date, …). */
  deterministicEligibleCount: number;
  /** Deterministic survivors run through the SEMANTIC evaluator (0 if no subject). */
  semanticEvaluatedCount: number;
  /** Survivors the evaluator judged eligible on subject centrality
   *  (CENTRAL for a strict request). Equals deterministic count when no subject. */
  centralSubjectEligibleCount: number;
  /** Eligible survivors that also met the quality/match bar. */
  qualityEligibleCount: number;
  /** What the user is actually shown after the requested-count selection. */
  finalReturnedCount: number;
  /** Per-candidate eligibility verdicts (subject requests only) — eligible AND
   *  rejected, so the proof can show why each keyword candidate did or did not
   *  qualify. Bounded; ordered by match score. Empty when no subject. */
  evaluations?: Array<{
    id: number;
    mediaType: MediaType;
    title: string;
    year: number | null;
    status: SemanticStatus;
    centrality: SubjectCentrality;
    confidence: number;
    evidence: string;
    rejectionReason: string | null;
    eligible: boolean;
    matchScore: number;
    rankedByTasteDna: boolean;
  }>;
}

export interface FinderResult {
  items: FinderItem[];
  scoredFor: string;
  /** Set when we had to relax a constraint to return anything. */
  relaxed: string | null;
  total: number;
  /** Per-stage counts for honest diagnostics (the Production Search Proof). */
  diagnostics: FinderDiagnostics;
}

/**
 * There is no fixed candidate cap any more. There was — 16, unrelated to the
 * requested limit — which made it the real ceiling on every search in the app:
 * a browse could not return more than sixteen titles, and after the hard
 * filters it returned about eight. Pool size now follows the ask; see
 * `finderPool.ts` for the sizing and the bounds that keep the fan-out sane.
 */

function fmtRuntime(min: number | null): string | null {
  if (!min) return null;
  const h = Math.floor(min / 60);
  const m = min % 60;
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
}

/**
 * The Finder: turn a set of hard constraints into a ranked list of real titles,
 * each scored for the user and annotated with exactly which constraints it
 * satisfies. Unlike a chat that returns one vibe-matched guess, this honors the
 * filters and returns a set — and never invents anything.
 */

/**
 * How many results a browse-style query returns.
 *
 * Eight is an answer-shaped number: it reads as "here is my pick and a few
 * alternates", not as a catalogue you can browse. "Movies under two hours" is a
 * browsing request against thousands of titles, and it was being answered with
 * eight of them.
 *
 * These constants USED TO SAY 24 while the live path still said 8 in two other
 * files, so raising them here changed nothing anybody could see. They now come
 * from the one place the count parsers read too, and the pool below is sized
 * from the limit rather than from a fixed 16 — the three ceilings that each,
 * independently, capped the product at about eight results.
 */
export const DEFAULT_RESULT_LIMIT = DEFAULT_RESULT_COUNT;
export const MAX_RESULT_LIMIT = MAX_REQUESTED_COUNT;
/** How many borderline candidates we will pay the model to adjudicate per
 *  request. Bounded so an ambiguous pool can never fan out into a large,
 *  expensive batch; the highest match-scored ambiguous candidates go first. */
const ADJUDICATE_CAP = 24;

export async function runFinder(
  supabase: SupabaseClient,
  userId: string,
  q: FinderQuery,
  watcher?: Watcher | Watcher[] | null,
  limit = DEFAULT_RESULT_LIMIT,
  /** Injectable for tests; defaults to the bounded, cached, safe-absent model
   *  adjudicator. Used ONLY for the deterministic ambiguous band. */
  adjudicator: SubjectAdjudicator = adjudicateSubjectCentrality,
): Promise<FinderResult> {
  const profile = await getProfile(supabase, userId);
  const region = regionFor(profile);
  const services = q.onMyServices ? await getMyServices(supabase, userId) : [];

  // HOUSEHOLD MODE: an ARRAY of watchers means several people are deciding
  // together — the user plus everyone named. Each candidate is scored for
  // every member and ranked by the floor-weighted household verdict (never a
  // blind average). A single watcher object keeps the legacy "score for that
  // person" behaviour.
  const householdWatchers = Array.isArray(watcher) ? watcher : [];
  const singleWatcher = !Array.isArray(watcher) ? (watcher ?? null) : null;
  const watcherContext = (w: Watcher): PersonalContext => ({
    label: `${w.name} match`,
    rules: [
      ...w.avoid.map((t) => avoidRule(t as PreferenceTrait)),
      ...w.love.map((t) => loveRule(t as PreferenceTrait)),
    ],
    likedFranchiseIds: [],
    collectionId: null,
    // Explicit signal — these are loves/avoids the account holder typed in
    // for this named person, not a silently-injected default.
    hasSignal: true,
  });

  let basePersonal: PersonalContext;
  let scoredFor: string;
  if (singleWatcher) {
    basePersonal = watcherContext(singleWatcher);
    scoredFor = `${singleWatcher.name} match`;
  } else {
    basePersonal = await getPersonalContext(supabase, userId, null);
    // basePersonal.label is already the single source of truth — 'General
    // Verdict' for a zero-signal viewer, their real personal label otherwise.
    scoredFor = householdWatchers.length > 0 ? 'Household match' : basePersonal.label;
  }

  // "Live TV" means TV shows with a real upcoming airing — always TV-only.
  const types: MediaType[] = q.liveOnly ? ['tv'] : q.mediaType === 'any' ? ['movie', 'tv'] : [q.mediaType];
  const sinceDays = q.sinceMonths ? q.sinceMonths * 30 : undefined;
  const minRating = q.minAudience != null ? q.minAudience / 10 : undefined; // % → 0..10

  // Exclude what the user has already dealt with.
  const { data: wl } = await supabase
    .from('watchlist_items')
    .select('tmdb_id, media_type, status')
    .eq('user_id', userId);
  const seen = new Set(
    (wl ?? [])
      .filter((r) => r.status === 'watched' || r.status === 'dropped')
      .map((r) => `${r.media_type}-${r.tmdb_id}`),
  );

  // Pull candidates per type. Depth follows the ask: a request for 24 results
  // needs a pool several times that size, because hard filters below kill
  // candidates AFTER hydration. Two fixed pages could never fill a grid.
  const pages = discoverPages(limit, types.length);
  // When an English DUB is required with no explicit source language, bias
  // discovery toward the languages most often dubbed into English. A bare
  // popularity.desc pool is English-dominated, so post-filtering to a dub alone
  // would starve the set; fanning the source language fills it. Guarded — only
  // this intent fans languages; every other query keeps its single pass.
  const DUB_SOURCE_LANGUAGES = ['ja', 'ko', 'es', 'fr', 'de', 'it', 'hi', 'zh', 'pt', 'ru'];
  const dubLanguages =
    (q.englishDubOnly || q.nonEnglishOriginalOnly) && !(q.originalLanguages && q.originalLanguages.length)
      ? DUB_SOURCE_LANGUAGES
      : null;
  const languagePasses: (string | undefined)[] = dubLanguages ?? [q.originalLanguages?.[0]];
  // Bound the request: one page per language when fanning the whole set.
  const languagePages = dubLanguages ? pages.slice(0, 1) : pages;
  const langPagePairs = languagePasses.flatMap((lang) =>
    languagePages.map((page) => ({ lang, page })),
  );
  const pools = await Promise.all(
    types.flatMap((mt) =>
      langPagePairs.map(({ lang, page }) =>
        discoverTitles(mt, {
          genreIds: q.genreIds,
          providerIds:
            q.providerIds && q.providerIds.length > 0
              ? q.providerIds
              : q.onMyServices && services.length > 0
                ? services
                : undefined,
          region,
          minRating: q.upcoming ? undefined : minRating,
          // Upcoming titles have no votes/ratings yet, so don't require any.
          minVotes: q.upcoming ? 0 : q.castIds && q.castIds.length > 0 ? 20 : 80,
          sinceDays: q.upcoming ? undefined : sinceDays,
          upcomingDays: q.upcoming ? 365 : undefined,
          maxRuntime: q.maxRuntime ?? undefined,
          castIds: q.castIds,
          maxYear: q.maxYear ?? undefined,
          minYear: q.minYear ?? undefined,
          excludeGenreIds: q.excludeGenreIds,
          // A REQUIRED SUBJECT gates discovery ALONE. `with_keywords` is OR, so
          // unioning soft vibe keywords here would let a vibe-only title through
          // and break the guarantee that every candidate carries a subject tag.
          // With a subject present we filter on the subject keywords only; that
          // tag is each candidate's own boxing evidence. Vibe keywords fall back
          // to the soft path (ranking), never weakening the subject.
          keywordIds:
            q.subjectKeywordIds && q.subjectKeywordIds.length > 0 ? q.subjectKeywordIds : q.keywordIds,
          excludeKeywordIds: q.excludeKeywordIds,
          minReleaseDate: q.minReleaseDate,
          // Foreign-origin: restrict the candidate pool to the requested
          // production origin / original language so "a Spanish film" never
          // surfaces a US-only blockbuster (TMDB with_original_language /
          // with_origin_country). First entry wins when several are named.
          originalLanguage: lang,
          originCountry: q.originCountries?.[0],
          monetization: q.monetization,
          sortBy: 'popularity.desc',
          page,
        }),
      ),
    ),
  );
  const candMap = new Map<string, { id: number; mediaType: MediaType }>();
  if (dubLanguages) {
    // The dubbed-"any" path fans MANY movie language pools before the first TV
    // pool, so a pool-by-pool drain would fill the candidate cap with movies and
    // drop every TV result. Round-robin across pools (one per pool per round) so
    // each media type AND source language is represented before the cap. Applied
    // only on the fan-out path — every other query keeps the original drain.
    const maxLen = pools.reduce((m, p) => Math.max(m, p.length), 0);
    for (let i = 0; i < maxLen; i++) {
      for (const pool of pools) {
        const c = pool[i];
        if (!c) continue;
        const key = `${c.mediaType}-${c.id}`;
        if (seen.has(key) || candMap.has(key)) continue;
        candMap.set(key, { id: c.id, mediaType: c.mediaType });
      }
    }
  } else {
    for (const pool of pools) {
      for (const c of pool) {
        const key = `${c.mediaType}-${c.id}`;
        if (seen.has(key) || candMap.has(key)) continue;
        candMap.set(key, { id: c.id, mediaType: c.mediaType });
      }
    }
  }
  const candidates = Array.from(candMap.values()).slice(0, candidateTarget(limit));

  // Raw subject evidence for borderline candidates, stashed during scoring so the
  // ambiguity-band adjudicator can run after the wave without re-fetching TMDB.
  const evidenceById = new Map<string, CandidateEvidence>();

  // Hydrate + score + hard-filter one candidate. Returns null when it fails any
  // hard constraint — which is most of why the pool has to be bigger than the
  // answer.
  const scoreCandidate = async ({ id, mediaType }: { id: number; mediaType: MediaType }): Promise<FinderItem | null> => {
    try {
      const { meta, providers } = await getScoringData(mediaType, id, region);
      const report = buildVerdict({
        meta,
        providers,
        personal: { ...basePersonal, collectionId: null },
      });

      const receipts: string[] = [];
      // Runtime — movies by feature length, TV by per-episode length. For TV we
      // only filter when the episode runtime is actually known (never guess).
      if (q.maxRuntime != null && meta.mediaType === 'movie') {
        if ((meta.runtimeMinutes ?? 9999) > q.maxRuntime) return null;
        const rt = fmtRuntime(meta.runtimeMinutes);
        if (rt) receipts.push(rt);
      } else if (q.maxRuntime != null && meta.mediaType === 'tv') {
        const ep = meta.episodeRuntimeMinutes ?? 0;
        if (ep > 0 && ep > q.maxRuntime) return null;
        if (ep > 0) receipts.push(`${ep}m episodes`);
      }
      // Recency.
      if (q.sinceMonths != null && meta.year != null) {
        const cutoff = new Date().getUTCFullYear() - Math.ceil(q.sinceMonths / 12);
        if (meta.year < cutoff) return null;
      }
      // Era window.
      if (q.maxYear != null && meta.year != null && meta.year > q.maxYear) return null;
      if (q.minYear != null && meta.year != null && meta.year < q.minYear) return null;
      if (meta.year != null) receipts.push(String(meta.year));
      // Upcoming: hasn't been released yet. Skip the rating gates below since
      // unreleased titles have no crowd/critic scores to judge on.
      if (q.upcoming) receipts.push('upcoming');
      // Audience (TMDB crowd score).
      if (q.minAudience != null && !q.upcoming) {
        const aud = meta.voteAverage != null ? Math.round(meta.voteAverage * 10) : null;
        if (aud == null || aud < q.minAudience) return null;
        receipts.push(`${aud}% audience`);
      }
      // IMDb rating (from OMDb, when we have it).
      if (q.minImdb != null && !q.upcoming) {
        if (meta.imdbRating == null || meta.imdbRating < q.minImdb) return null;
        receipts.push(`IMDb ${meta.imdbRating.toFixed(1)}`);
      }
      // English audio.
      if (q.englishAudioOnly && !(meta.englishAvailability === 'native' || meta.englishAvailability === 'available')) {
        return null;
      }
      if (q.englishAudioOnly) receipts.push('English audio');
      // English DUB required — a NON-English original with an English dub.
      // 'native' (English original) is excluded on purpose; only 'available'
      // (an English track exists on a non-English original) qualifies.
      if (q.englishDubOnly && meta.englishAvailability !== 'available') return null;
      if (q.englishDubOnly) receipts.push('English dub');
      // FOREIGN — a NON-English original. `englishAvailability === 'native'`
      // means the original language IS English (see meta-helpers), so it is
      // exactly what a "foreign" ask must exclude. Weaker than the dub filter:
      // it does not require an English track, so "foreign, subtitles are fine"
      // stays valid. Never satisfied by a native-English title, ever.
      if (q.nonEnglishOriginalOnly && meta.englishAvailability === 'native') return null;
      if (q.nonEnglishOriginalOnly && !q.englishDubOnly) receipts.push('non-English original');
      // On my services.
      const included = providers ? includedServiceNames(providers.options, services) : [];
      if (q.onMyServices) {
        if (included.length === 0) return null;
        receipts.push(`on ${included[0]}`);
      }
      // Stream It only (our WATCH IT verdict).
      if (q.streamItOnly && report.primaryCall !== 'WATCH IT') return null;
      if (q.streamItOnly) receipts.push('Stream It');
      // Bingeable now (TV, all episodes of the current season out).
      if (q.bingeableOnly && meta.mediaType === 'tv') {
        if (!isBingeable(meta)) return null;
        receipts.push('all episodes out');
      }
      // Pace band.
      if (q.pace != null) {
        const p = paceScore(meta);
        if (Math.abs(p - q.pace) > 35) return null;
        receipts.push(p >= 66 ? 'fast-paced' : p <= 33 ? 'slow burn' : 'balanced pace');
      }
      // HOUSEHOLD: score this candidate for EVERY member (the user + each
      // named watcher) and rank by the floor-weighted joint verdict — a
      // 96/38 split must never look like an excellent joint pick.
      let household: HouseholdVerdict | null = null;
      if (householdWatchers.length > 0) {
        const members = [
          { name: 'You', match: report.personal.score },
          ...householdWatchers.map((w) => {
            const r = buildVerdict({ meta, providers, personal: { ...watcherContext(w), collectionId: null } });
            return { name: w.name, match: r.personal.score };
          }),
        ];
        household = assembleHousehold(members);
      }
      const effectiveMatch = household ? household.score : report.personal.score;

      // REQUIRED-SUBJECT SEMANTIC ELIGIBILITY. Clearing TMDB `with_keywords`
      // made this a CANDIDATE — it does NOT make it eligible. Judge whether the
      // subject is genuinely CENTRAL to THIS title from its own evidence
      // (title, overview, genres, keyword tags), deterministically. A keyword
      // tag is one signal among several, never sufficient on its own.
      let subjectEvidence: FinderItem['subjectEvidence'];
      if (q.subjectLexemes && q.subjectLexemes.length > 0) {
        const requirement: SubjectRequirement = {
          canonical: q.subjectCanonical ?? q.subjectLabel ?? 'subject',
          label: q.subjectLabel ?? q.subjectCanonical ?? 'subject',
          lexemes: q.subjectLexemes,
          strict: q.subjectStrict !== false,
        };
        const candidateEvidence: CandidateEvidence = {
          title: meta.title,
          altTitle: meta.originalTitle ?? null,
          overview: meta.overview,
          genres: meta.genres,
          keywords: meta.keywords,
        };
        const verdict = evaluateSubjectCentrality(requirement, candidateEvidence);
        subjectEvidence = {
          constraint: requirement.canonical,
          satisfied: verdict.status === 'PASS',
          status: verdict.status,
          centrality: verdict.centrality,
          confidence: verdict.confidence,
          evidenceType: 'centrality',
          evidence: verdict.evidenceSummary,
          rejectionReason: verdict.rejectionReason,
          ambiguous: verdict.ambiguous,
          decidedBy: 'deterministic',
        };
        // Stash the raw evidence so a borderline candidate can be adjudicated
        // after the wave without re-fetching TMDB.
        if (verdict.ambiguous) evidenceById.set(`${mediaType}-${id}`, candidateEvidence);
        if (verdict.status === 'PASS') {
          receipts.unshift(`${q.subjectLabel ?? 'subject'} ✓ ${verdict.centrality.toLowerCase()}`);
        }
      }

      // Match threshold (against the score the user is actually shown).
      if (q.minMatch != null && effectiveMatch < q.minMatch) return null;
      receipts.unshift(`${scoredFor.split(' ')[0]} ${effectiveMatch}`);

      const where =
        included[0] ?? (providers ? streamingNames(providers.options)[0] ?? null : null);

      const ratings = tileRatingsFromScore(report.general);
      // "Why this Verd1ct?" — assembled from the SAME facts that filtered and
      // scored this candidate; nothing invented.
      const explain = buildItemExplanation(q, {
        matchScore: effectiveMatch,
        generalScore: report.general.score,
        reasonsFor: report.reasonsFor,
        reasonsAgainst: report.reasonsAgainst,
        ratings,
        where,
        onUsersService: included.length > 0,
        meta: {
          mediaType,
          runtimeMinutes: meta.runtimeMinutes ?? null,
          year: meta.year,
          englishAudio: meta.englishAvailability === 'native' || meta.englishAvailability === 'available',
        },
      });

      return {
        id,
        mediaType,
        title: meta.title,
        year: meta.year,
        posterPath: meta.posterPath,
        matchScore: effectiveMatch,
        generalScore: report.general.score,
        primaryCall: report.primaryCall,
        reason: report.oneLiner,
        where,
        receipts,
        deciderUrl: deciderSearchUrl(meta.title, meta.year),
        ratings,
        imdbId: meta.imdbId ?? null,
        explain,
        household,
        subjectEvidence,
      } as FinderItem;
    } catch {
      return null;
    }
  };

  // HYDRATE IN WAVES, WITH BOUNDED CONCURRENCY.
  //
  // One `Promise.all` over the whole pool opens a request per candidate at
  // once — with ~6 upstream calls per hydration that is hundreds of concurrent
  // requests, which TMDB and the ratings aggregators answer with rate limits
  // rather than data. Waves also mean a request that fills up early stops
  // early: the common case costs one or two waves, not the whole pool.
  //
  // Live TV is the exception — its real filter (does this show actually have an
  // upcoming airing?) runs after scoring, so it needs everything we pulled.
  // A required subject means the SEMANTIC eligibility stage runs: only titles
  // the evaluator judged eligible (CENTRAL for a strict request) count toward
  // "enough", so we keep hydrating past keyword matches that turn out to be
  // incidental instead of stopping early on a pool of look-alikes.
  const subjectRequired = !!(q.subjectLexemes && q.subjectLexemes.length > 0);
  const isEligible = (i: FinderItem): boolean =>
    !subjectRequired || i.subjectEvidence?.satisfied === true;

  const survivors: FinderItem[] = [];
  const enough = q.liveOnly ? Number.POSITIVE_INFINITY : enoughSurvivors(limit);
  for (const wave of waves(candidates, WAVE_SIZE)) {
    const got = await mapPool(wave, HYDRATE_CONCURRENCY, scoreCandidate);
    for (const item of got) if (item) survivors.push(item);
    if (survivors.filter(isEligible).length >= enough) break;
  }

  // ── AMBIGUITY-BAND ADJUDICATION ────────────────────────────────────────────
  // The deterministic evaluator settles the confident cases (a title hit or a
  // strong overview is central; a setting-only mention is incidental). What it
  // cannot settle from metadata counts is the borderline band — a single
  // authoritative keyword tag plus a light mention, where a genuine subject film
  // (Moneyball → baseball) and an incidental one (Pulp Fiction's ensemble boxer)
  // look identical. Those, and ONLY those, are escalated to the bounded semantic
  // adjudicator, highest match-score first, before anything is ranked. The
  // adjudicator is subject-agnostic, cached, and safe when unavailable: with no
  // model the band stays rejected (precision preserved), so this never
  // introduces an offline regression; in production the model resolves it.
  if (subjectRequired) {
    const requirement: SubjectRequirement = {
      canonical: q.subjectCanonical ?? q.subjectLabel ?? 'subject',
      label: q.subjectLabel ?? q.subjectCanonical ?? 'subject',
      lexemes: q.subjectLexemes ?? [],
      strict: q.subjectStrict !== false,
    };
    const acceptSubstantial = requirement.strict === false;
    const borderline = survivors
      .filter((i) => i.subjectEvidence && i.subjectEvidence.satisfied === false && i.subjectEvidence.ambiguous)
      .sort((a, b) => b.matchScore - a.matchScore)
      .slice(0, ADJUDICATE_CAP);

    // KNOWLEDGE LAYER — one batched read of the durable compiled facts for the
    // whole ambiguous band. A fact we already compiled (e.g. "baseball is CENTRAL
    // to Moneyball") resolves the candidate with NO model call and works with no
    // API key at all, so a title we already understand is never re-adjudicated.
    // Safe-absent: an unreachable store yields an empty map and the model path
    // below runs exactly as it did before this layer existed.
    const knownFacts = await readSubjectFacts(
      requirement.canonical,
      borderline.map((i) => ({ tmdbId: i.id, mediaType: i.mediaType })),
    ).catch(() => new Map<string, StoredSubjectFact>());

    await Promise.all(
      borderline.map(async (item) => {
        const evidence = evidenceById.get(`${item.mediaType}-${item.id}`);
        if (!evidence || !item.subjectEvidence) return;

        const known = knownFacts.get(`${item.mediaType}-${item.id}`);
        // Reuse a durable compiled fact (no model call, offline) or adjudicate
        // once and compile-on-demand. All the decision logic lives in the
        // unit-tested resolver.
        const { verdict, decidedVia, persist } = await resolveAmbiguousSubject(
          requirement,
          evidence,
          known ?? null,
          adjudicator,
        );
        // COMPILE-ON-DEMAND: persist a freshly-adjudicated fact (best-effort) so
        // the next search for this subject reuses it instead of paying the model.
        if (persist) void writeSubjectFact(item.id, item.mediaType, persist);

        if (!verdict) return; // reject-on-uncertainty: leave it ineligible
        const promote =
          verdict.centrality === 'CENTRAL' || (acceptSubstantial && verdict.centrality === 'MATERIAL');
        // Map the classes onto the stored centrality (UNKNOWN, which the
        // deterministic scale has no slot for, is recorded as UNSUPPORTED — it
        // did not establish the subject).
        const storedCentrality: SubjectCentrality =
          verdict.centrality === 'UNKNOWN' ? 'UNSUPPORTED' : verdict.centrality;
        item.subjectEvidence.decidedBy = decidedVia;
        if (promote) {
          item.subjectEvidence.satisfied = true;
          item.subjectEvidence.status = 'PASS';
          item.subjectEvidence.centrality = storedCentrality;
          item.subjectEvidence.confidence = Math.round(verdict.confidence * 100);
          item.subjectEvidence.evidence = verdict.reason || item.subjectEvidence.evidence;
          item.subjectEvidence.rejectionReason = null;
          item.receipts.unshift(`${requirement.label} ✓ ${storedCentrality.toLowerCase()}`);
        } else {
          item.subjectEvidence.centrality = storedCentrality;
          item.subjectEvidence.rejectionReason =
            verdict.reason || `requested subject judged ${verdict.centrality.toLowerCase()}, not central`;
        }
      }),
    );
  }

  // Stage the counts honestly and DROP semantically-ineligible candidates
  // BEFORE ranking — Taste DNA never ranks a title the subject gate rejected.
  const candidateCount = candidates.length;
  const deterministicEligibleCount = survivors.length;
  const semanticEvaluatedCount = subjectRequired ? survivors.length : 0;
  const eligibleSurvivors = subjectRequired ? survivors.filter(isEligible) : survivors;
  const centralSubjectEligibleCount = subjectRequired ? eligibleSurvivors.length : deterministicEligibleCount;

  // COMPILED TONE + SETTING NUDGE (Knowledge Layer, bounded + subordinate). When
  // the request expresses desired tones or settings, a title whose COMPILED
  // header agrees gets a small rank bonus (≤ HEADER_NUDGE_MAX, far below the
  // Taste DNA scale). Applied ONLY to already-ELIGIBLE survivors — after every
  // hard constraint and the subject gate — so it can reorder but never admit or
  // resurrect an ineligible title. Reward-only, reads only compiled/evidenced
  // values, and a safe-absent no-op when nothing is requested or compiled, so it
  // adds nothing to the legacy path.
  const wantTones = q.requestedTones ?? [];
  const wantSettings = q.requestedSettings ?? [];
  if ((wantTones.length > 0 || wantSettings.length > 0) && eligibleSurvivors.length > 0) {
    const headers = await readTitleKnowledge(
      eligibleSurvivors.map((i) => ({ tmdbId: i.id, mediaType: i.mediaType })),
    ).catch(() => new Map<string, { tone: string[]; setting: string[] }>());
    applyHeaderRanking(eligibleSurvivors, headers, wantTones, wantSettings);
  }

  let items = eligibleSurvivors.sort((a, b) => b.matchScore - a.matchScore);
  let relaxed: string | null = null;

  // Honest fallback #1: a fuzzy vibe/trope word ("feel-good", "cozy") resolves
  // to a SINGLE TMDB keyword id via a plain text search with no popularity or
  // usage gating (see askParse.ts's searchKeywords) — and TMDB's keyword
  // tagging is crowd-sourced and sparse, so that one id can be tagged on only
  // a handful of titles in the entire catalogue. Used as a hard `with_keywords`
  // filter, that starves an otherwise-broad request down to almost nothing —
  // not zero (so the existing zero-result fallback below never sees it), just
  // far short of what was asked for. This is the root cause of "Something
  // feel-good and uplifting" returning two titles: the vibe word survived as a
  // rigid catalogue filter well past the point it stopped being useful as one.
  // Detected on YIELD, not on the word itself — a request whose keyword really
  // is well-tagged keeps its precision untouched.
  // A REQUIRED SUBJECT is a hard constraint: it is never relaxed and the
  // shortfall is never padded with generic titles. When only seven verified
  // boxing movies exist, seven is the honest answer — a generic action list is
  // a wrong one. We say so plainly and stop; the vibe-keyword relaxation below
  // is skipped entirely.
  const hasRequiredSubject = subjectRequired;
  if (hasRequiredSubject) {
    const n = items.length;
    if (n === 0) {
      relaxed = `No ${q.subjectLabel ?? 'matching'} ${q.mediaType === 'movie' ? 'movies' : 'titles'} where the subject is genuinely central cleared every filter — nothing was padded in. Relax one constraint to widen the search.`;
    } else {
      relaxed = `Found ${n} ${q.subjectLabel ?? ''} ${q.mediaType === 'movie' ? 'movie' : 'title'}${n === 1 ? '' : 's'} where ${q.subjectLabel ? `${q.subjectLabel.toLowerCase()} is` : 'the subject is'} genuinely central${q.sinceMonths ? ` from the last ${Math.round(q.sinceMonths / 12)} years` : ''}, ranked for you.`.replace(/\s+/g, ' ').trim();
    }
  } else if (isKeywordStarved(items.length, limit, !!(q.keywordIds && q.keywordIds.length > 0))) {
    const relaxedQ: FinderQuery = { ...q, keywordIds: undefined };
    const r = await runFinder(supabase, userId, relaxedQ, watcher, limit);
    if (r.items.length > items.length) {
      // The titles that DID match the stated subject are the answer — a
      // shortfall is filled AFTER them, never instead of them. Replacing them
      // wholesale turned "boxing movies after 2020" (four honest matches)
      // into a generic action list with the real answers deleted.
      const have = new Set(items.map((i) => `${i.mediaType}-${i.id}`));
      const strictCount = items.length;
      items = [...items, ...r.items.filter((i) => !have.has(`${i.mediaType}-${i.id}`))].slice(0, Math.max(limit, strictCount));
      relaxed =
        strictCount > 0
          ? `Only ${strictCount} title${strictCount === 1 ? ' is' : 's are'} tagged with that exact subject — the rest are the closest matches by genre and tone, after them.`
          : 'That exact vibe keyword wasn’t well-tagged in the catalog — here are the closest matches by genre and tone instead.';
    }
  }

  // Honest fallback #2: if nothing hit every constraint, relax match, then services.
  if (items.length === 0 && (q.minMatch != null || q.onMyServices)) {
    const relaxedQ: FinderQuery = { ...q, minMatch: null, onMyServices: false };
    relaxed = q.onMyServices
      ? 'Nothing matched all of that on your services — here are the closest picks anywhere.'
      : 'Nothing cleared your match bar — here are the closest, honestly labeled.';
    const r = await runFinder(supabase, userId, relaxedQ, watcher, limit);
    items = r.items;
  }

  // Live TV: enrich a wider pool with real airings and keep only shows that are
  // actually on the air, best match first.
  if (q.liveOnly) {
    // Widened with the result limit: enriching only 16 candidates and then
    // filtering to those actually on air was itself a collapse — most of a
    // 24-result set could be discarded before the airing lookup ever ran.
    const pool = items.slice(0, Math.max(32, limit * 2));
    await Promise.all(
      pool.map(async (i) => {
        if (i.airing === undefined) i.airing = await getNextAiring(i.imdbId ?? null);
      }),
    );
    items = pool.filter((i) => i.airing);
    if (items.length === 0 && !relaxed) {
      relaxed = 'Nothing you’d love is on live TV in the next while — try Shows, or loosen your filters.';
    }
  }

  // Eligible + ranked + quality-passed titles (the match/quality bar is applied
  // during hydration in scoreCandidate, so everything here already meets it).
  const qualityEligibleCount = items.length;

  // HARD CODE-GUARD: for a required subject, the ranked-and-selected set may
  // NEVER contain a title the semantic gate did not pass. The fallback paths
  // above pad a shortfall with genre look-alikes ONLY when no subject was
  // required (that branch is skipped for subjects), so if an ineligible title
  // reached here it means a filter regressed — fail loud rather than serve a
  // Snake-Eyes result. This makes the "ineligible candidates can never be
  // ranked/returned" invariant enforced by code, not merely by convention.
  if (subjectRequired) {
    const leaked = items.filter((i) => i.subjectEvidence?.satisfied !== true);
    if (leaked.length > 0) {
      throw new Error(
        `subject-eligibility guard: ${leaked.length} ineligible title(s) reached ranking for "${q.subjectCanonical ?? q.subjectLabel ?? 'subject'}" ` +
          `(e.g. ${leaked.slice(0, 3).map((i) => `${i.title} [${i.subjectEvidence?.centrality ?? 'UNSUPPORTED'}]`).join(', ')})`,
      );
    }
  }

  // REQUESTED-COUNT SELECTION. "a boxing movie" asks for ONE — the final cap is
  // the requested count, applied AFTER eligibility and ranking, never as a
  // discovery limit. When the phrasing states no count, the browse limit stands.
  const finalCap = q.finalCount != null ? q.finalCount : limit;
  const finalItems = items.slice(0, Math.max(1, Math.min(finalCap, MAX_RESULT_LIMIT)));
  // Attach the real next airing (channel + time) to every TV result, so "ask for
  // a show" always shows where and when it's on. Best-effort; null when unknown.
  await Promise.all(
    finalItems
      .filter((i) => i.mediaType === 'tv' && i.airing === undefined)
      .map(async (i) => {
        i.airing = await getNextAiring(i.imdbId ?? null);
      }),
  );

  // Per-candidate verdicts for the proof — eligible AND rejected, so a keyword
  // candidate that failed shows WHY. Only the titles that survived to the final
  // answer were "ranked by Taste DNA"; a rejected candidate never was.
  const finalKeys = new Set(finalItems.map((i) => `${i.mediaType}-${i.id}`));
  const evaluations = subjectRequired
    ? survivors
        .slice()
        .sort((a, b) => b.matchScore - a.matchScore)
        .slice(0, 60)
        .map((i) => ({
          id: i.id,
          mediaType: i.mediaType,
          title: i.title,
          year: i.year,
          status: i.subjectEvidence?.status ?? ('UNKNOWN' as SemanticStatus),
          centrality: i.subjectEvidence?.centrality ?? ('UNSUPPORTED' as SubjectCentrality),
          confidence: i.subjectEvidence?.confidence ?? 0,
          evidence: i.subjectEvidence?.evidence ?? '',
          rejectionReason: i.subjectEvidence?.rejectionReason ?? null,
          eligible: i.subjectEvidence?.satisfied === true,
          matchScore: i.matchScore,
          rankedByTasteDna: finalKeys.has(`${i.mediaType}-${i.id}`),
        }))
    : undefined;

  const diagnostics: FinderDiagnostics = {
    requestedCount: q.finalCount ?? null,
    candidateCount,
    deterministicEligibleCount,
    semanticEvaluatedCount,
    centralSubjectEligibleCount,
    qualityEligibleCount,
    finalReturnedCount: finalItems.length,
    evaluations,
  };

  return { items: finalItems, scoredFor, relaxed, total: items.length, diagnostics };
}
