import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import { searchTitles, getSimilar, type SearchResultItem } from '@/lib/tmdb/client';
import { getScoringData } from '@/lib/titleData';
import { buildVerdict } from '@/lib/scoring';
import { getProfile, getPersonalContext, regionFor, personalLabelFor } from '@/lib/profile';
import { streamingNames } from '@/lib/services';
import { tileRatingsFromScore } from '@/lib/ratings';
import { tmdbImage } from '@/lib/tmdb/image';
import { deciderSearchUrl } from '@/lib/tmdb/meta-helpers';
import { MAX_REQUESTED_COUNT } from '@/lib/nlu/count';
import { candidateTarget, mapPool, HYDRATE_CONCURRENCY } from '@/lib/finderPool';
import { naiveParseQuery, EMPTY_QUERY } from '@/lib/finderParse';
import { genreIdFromName } from '@/lib/finderGenres';
import { runFinder, type FinderItem, type FinderQuery } from '@/lib/finder';
import type { TitleVerdict, AltItem, JudgeFactor } from '@/lib/askTypes';
import { classifySearch, type SearchClassification } from '@/lib/nlu/searchMode';
import { rankByTitleIdentity, isExactTitle, titleMatchTier } from '@/lib/nlu/titleNormalize';
import { referenceCandidates, resolveNamedTitle } from '@/lib/nlu/titleReference';
import { validateTitleResult } from '@/lib/nlu/resultGuard';

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, '');

/** Strip season/series noise so "wisting season 2" resolves to "wisting". */
function cleanTitleText(text: string): string {
  return text
    .replace(/\bseasons?\s*\d+\b/gi, '')
    .replace(/\bs\d+(e\d+)?\b/gi, '')
    .replace(/\b(series|episodes?|the show|show|tv)\b/gi, '')
    .replace(/[?!.]+$/g, '')
    .trim();
}

/**
 * Is this result even in the running for the requested title?
 *
 * This was a raw `includes` in both directions, which is how "Cinderella Man"
 * matched "Cinderella" — and, on a whole sentence, how "Man", "Seen" and "That"
 * all counted as titles. The tiering in `titleNormalize` requires whole-WORD
 * containment, so a mid-string coincidence no longer qualifies; the caller
 * still narrows to a genuine exact match after this.
 */
function titleMatches(cleaned: string, resultTitle: string): boolean {
  return titleMatchTier(cleaned, resultTitle) !== 'none';
}

/** Only treat the input as a named-title lookup when it isn't a constraint
 *  phrase ("a crime thriller under 2h") — those belong to the Finder. */
export function looksLikeTitleAsk(text: string): boolean {
  const q = naiveParseQuery(text);
  if (q.genreIds.length > 0 || q.minMatch != null || q.minAudience != null || q.maxRuntime != null) return false;
  if (/\b(something|anything|surprise|recommend|find me|show me|in the mood|funny|scary|short|long|bingeable)\b/i.test(text)) return false;
  return cleanTitleText(text).length >= 3;
}

function whereFrom(providers: { available: boolean; options: { providerName: string; type: string }[] } | null): string | null {
  if (!providers || !providers.available) return null;
  const names = streamingNames(providers.options as never);
  return names.length ? names.slice(0, 3).join(', ') : null;
}

// Comparison cues: "shows like Mindhunter", "if I like Fargo", "in the vein of
// Fargo". Ordered longest-first within each group; the bare "like" is last so a
// specific cue wins when several are present.
const REF_CUE =
  /\b(?:in the vein of|reminds me of|if i (?:really )?(?:like|liked|enjoy|enjoyed|love|loved)|similar to|(?:something|stuff|shows?|movies?|a show|a movie|more|kinda|kind of|sort of|just|a lot) like|like the (?:show|movie)|like watching|like)\b/gi;

/**
 * Preference clauses people tack on the end: "…that I would like", "…I'd
 * enjoy", "…for me". They are not part of the title and they are extremely
 * common, so leaving them attached means the reference never resolves.
 */
const TRAILING_FILLER =
  /\s*,?\s*\b(?:that\s+)?(?:i(?:'d|’d| would| will| might)?\s+(?:would\s+)?(?:like|enjoy|love|dig|go for)|for me|please)\b.*$/i;

/**
 * Pull the reference title out of a "more like X" ask, and only the title.
 * Returns null when there is no comparison in the text at all.
 */
export function extractReference(text: string): string | null {
  REF_CUE.lastIndex = 0;
  const hits: RegExpExecArray[] = [];
  let m: RegExpExecArray | null;
  while ((m = REF_CUE.exec(text)) !== null) {
    hits.push(m);
    if (m.index === REF_CUE.lastIndex) REF_CUE.lastIndex++;
  }
  if (hits.length === 0) return null;

  const tailOf = (hit: RegExpExecArray): string =>
    text
      .slice(hit.index + hit[0].length)
      .replace(TRAILING_FILLER, '')
      .replace(/^\s*(?:to|the|a|an|watch|watching|some|something)\s+/i, '')
      .replace(/[?!.,]+\s*$/, '')
      .trim();

  // SPECIFIC CUES BEAT A BARE "LIKE", and a cue with nothing after it is not a
  // cue at all. Both rules exist because of real sentences:
  //
  //   "…similar to Tulsa King that I would like" ends on a bare "like" with an
  //   empty tail. Taking the last cue unconditionally returned nothing, the
  //   similarity path bailed, and the ask silently degraded to generic
  //   discovery — which from the outside looks like the feature not existing.
  //
  //   "something like Like Water for Chocolate" has a bare "like" INSIDE the
  //   title. Preferring the compound cue keeps the title whole.
  //
  // Among equally specific cues the last still wins, so "shows I'd enjoy if I
  // liked Fargo" resolves to Fargo.
  const specific = hits.filter((h) => /\s/.test(h[0]));
  const bare = hits.filter((h) => !/\s/.test(h[0]));
  for (const group of [specific, bare]) {
    for (let i = group.length - 1; i >= 0; i--) {
      const tail = tailOf(group[i]!);
      if (tail.length >= 2) return tail;
    }
  }
  return null;
}

/**
 * Resolve every title a comparison names, strictly.
 *
 * "kinda like Rocky or Cinderella Man that I probably haven't seen" is two
 * titles and a clause. It used to be searched as ONE string against a raw
 * substring test, which accepted "Man", "Seen" and "That" as matches — so the
 * first junk result became the seed, its media type became the filter, and a
 * boxing request came back as a cartoon shortlist filtered to Shows.
 *
 * Now each named title is resolved on its own and only an EXACT title identity
 * counts. That is also what separates "Cinderella Man" from "Cinderella":
 * containment is not identity, and no popularity ranking can fix it, because
 * the fairy tale outranks the boxing picture on both questions.
 */
async function resolveSeeds(
  refText: string,
  max: number,
  wantType: 'movie' | 'tv' | null,
): Promise<SearchResultItem[]> {
  const candidates = referenceCandidates(cleanTitleText(refText)).filter((s) => s.length >= 2);
  const seeds: SearchResultItem[] = [];
  const taken = new Set<string>();
  for (const name of candidates) {
    if (seeds.length >= max) break;
    const results = await searchTitles(name).catch(() => []);
    // When they said "movie", prefer a movie of that name — "Fargo" is both a
    // film and a series, and the reference decides the whole result set's type.
    const typed = wantType ? results.filter((r) => r.mediaType === wantType) : [];
    const { match } = resolveNamedTitle(name, typed.length > 0 ? typed : results);
    // No exact title? Then we do not know what they meant, and substituting the
    // nearest famous thing is how "Cinderella Man" became "Cinderella". Skip it.
    if (!match) continue;
    const key = `${match.mediaType}-${match.id}`;
    if (taken.has(key)) continue;
    taken.add(key);
    seeds.push(match);
  }
  return seeds;
}

/**
 * "More like X" — resolve the reference title(s), pull TMDB's similar/recommended
 * titles, and score each through the deterministic engine for this user. Real
 * neighbors of what they named, best match first. Returns null when no title
 * can be confidently resolved, so the caller falls back to the plain Finder.
 */
export async function askSimilarTo(
  supabase: SupabaseClient,
  userId: string,
  refText: string,
  limit = 10,
  /** The media type the ask states outright ("a boxing movie like…"), if any. */
  wantType: 'movie' | 'tv' | null = null,
): Promise<{ query: FinderQuery; scoredFor: string; items: FinderItem[] } | null> {
  const cleaned = cleanTitleText(refText);
  if (cleaned.length < 2) return null;

  // BOTH titles, when they named two. "Like Rocky or Cinderella Man" is a
  // request for the intersection of two neighbourhoods, and answering from one
  // of them throws away half of what they told us.
  const seeds = await resolveSeeds(refText, 2, wantType);
  const seed = seeds[0];
  if (!seed) return null; // no confident title → not a "more like this" ask

  const neighbourhoods = await Promise.all(
    seeds.map((s) => getSimilar(s.mediaType, s.id).catch(() => [])),
  );
  const similar = neighbourhoods.flat();
  if (similar.length === 0) return null;

  const profile = await getProfile(supabase, userId);
  const region = regionFor(profile);
  const personal = await getPersonalContext(supabase, userId, null);
  const scoredFor = profile ? personalLabelFor(profile) : 'Your match';

  const { data: wl } = await supabase
    .from('watchlist_items')
    .select('tmdb_id, media_type, status')
    .eq('user_id', userId);
  const seen = new Set(
    (wl ?? [])
      .filter((r) => r.status === 'watched' || r.status === 'dropped')
      .map((r) => `${r.media_type}-${r.tmdb_id}`),
  );

  // A title that neighbours BOTH named references is the best answer to "like
  // Rocky or Cinderella Man" there is, so it gets looked at first. This orders
  // which candidates are considered — it does not touch anyone's score, which
  // stays the deterministic engine's call.
  const seedKeys = new Set(seeds.map((s) => `${s.mediaType}-${s.id}`));
  const pool = new Map<string, { item: (typeof similar)[number]; hits: number }>();
  for (const s of similar) {
    const key = `${s.mediaType}-${s.id}`;
    if (seedKeys.has(key) || seen.has(key)) continue;
    const prior = pool.get(key);
    if (prior) prior.hits++;
    else pool.set(key, { item: s, hits: 1 });
  }
  // Sized from the ask, like the Finder's pool. This was a flat 16 — below both
  // the requested limit and the size of the neighbour list it was cutting.
  const cands = [...pool.values()]
    .sort((a, b) => b.hits - a.hits)
    .slice(0, candidateTarget(limit))
    .map((e) => e.item);

  const scored = await mapPool(cands, HYDRATE_CONCURRENCY, async (c) => {
    try {
      const { meta, providers } = await getScoringData(c.mediaType, c.id, region);
      const report = buildVerdict({ meta, providers, personal: { ...personal, collectionId: null } });
      return {
        id: c.id,
        mediaType: c.mediaType,
        title: meta.title,
        year: meta.year,
        posterPath: meta.posterPath,
        matchScore: report.personal.score,
        generalScore: report.general.score,
        primaryCall: report.primaryCall,
        reason: report.oneLiner,
        where: whereFrom(providers),
        receipts: [`${scoredFor.split(' ')[0]} ${report.personal.score}`, ...(meta.year ? [String(meta.year)] : [])],
        deciderUrl: deciderSearchUrl(meta.title, meta.year),
        ratings: tileRatingsFromScore(report.general),
        imdbId: meta.imdbId ?? null,
      } as FinderItem;
    } catch {
      return null;
    }
  });

  const items = scored
    .filter((x): x is FinderItem => x !== null)
    .sort((a, b) => b.matchScore - a.matchScore)
    // A "more like this" ask is a browse too — its own 20 was one more ceiling
    // below the requested limit.
    .slice(0, Math.max(1, Math.min(limit, MAX_REQUESTED_COUNT)));
  if (items.length === 0) return null;

  // WHAT THEY SAID BEATS WHAT THE SEED HAPPENS TO BE. The read-back chip said
  // "Shows" for a request that began "a boxing movie" — because the seed's own
  // type was copied straight into the filter. An explicit media type in the ask
  // is not a guess and must not be overwritten by one.
  const query: FinderQuery = {
    ...EMPTY_QUERY,
    mediaType: wantType ?? seed.mediaType,
    similarTo: seeds.map((s) => s.title).join(' / '),
  };
  return { query, scoredFor, items };
}

/**
 * Put a specifically-named title on trial: resolve it, compute the full verdict
 * for this user (every love/avoid rule that fires), then surface genuinely
 * better-for-them alternatives in the same lane. Returns null when the text
 * isn't a confident title match, so the caller falls back to the Finder.
 */
export async function askJudgeTitle(
  supabase: SupabaseClient,
  userId: string,
  text: string,
  cls?: SearchClassification,
): Promise<{ verdict: TitleVerdict; alternatives: AltItem[] } | null> {
  if (!looksLikeTitleAsk(text)) return null;
  // Classify to isolate the REQUESTED title + provider (so "Gone on BritBox"
  // searches "Gone", not the raw string), then search on the clean title.
  const c = cls ?? classifySearch(text);
  const requestedTitle = c.requestedTitle ?? cleanTitleText(text);
  const cleaned = requestedTitle;
  const results = await searchTitles(cleaned).catch(() => []);
  if (results.length === 0) return null;

  const wantsTv = c.contentType === 'tv' || /\b(season|series|episodes?)\b/i.test(text);
  const wantsMovie = c.contentType === 'movie';
  // Keep only candidates that are at least a near match, then RANK BY TITLE
  // IDENTITY: an exact "Gone" always outranks a merely-contains "Gone Girl",
  // regardless of popularity. This is the core anti-substitution fix.
  const near = results.filter((r) => titleMatches(cleaned, r.title));
  if (near.length === 0) return null;
  const exacts = near.filter((r) => isExactTitle(cleaned, r.title));
  const pool = exacts.length ? exacts : near;
  const typed = wantsTv ? pool.filter((m) => m.mediaType === 'tv')
    : wantsMovie ? pool.filter((m) => m.mediaType === 'movie') : pool;
  const ranked = rankByTitleIdentity(cleaned, typed.length ? typed : pool, (r) => r.title, (r) => (r as { popularity?: number }).popularity ?? 0);
  const top = ranked[0]!;

  const profile = await getProfile(supabase, userId);
  const region = regionFor(profile);
  const personal = await getPersonalContext(supabase, userId, null);
  const scoredFor = profile ? personalLabelFor(profile) : 'Your match';

  const { meta, providers } = await getScoringData(top.mediaType, top.id, region);
  const report = buildVerdict({ meta, providers, personal });

  // ── Title-identity + provider guard ───────────────────────────────────────
  // Verify the returned title actually IS the requested one, and (if a service
  // was required) whether it's available there. TMDB provider data is often
  // incomplete, so "not listed" is treated as UNVERIFIED (honest) — never as a
  // confirmed absence, and never as grounds to substitute a different title.
  const providerAvailability: 'verified' | 'unverified' | 'confirmed_absent' = (() => {
    if (!c.requiredProvider) return 'verified';
    const want = c.requiredProvider.name.toLowerCase().replace(/[^a-z0-9]+/g, '');
    const names = (providers?.options ?? []).map((o) => o.providerName.toLowerCase().replace(/[^a-z0-9]+/g, ''));
    return names.some((n) => n.includes(want) || want.includes(n)) ? 'verified' : 'unverified';
  })();
  const guard = validateTitleResult({
    requestedTitle: requestedTitle,
    returnedTitle: meta.title,
    requiredProvider: c.requiredProvider?.name ?? null,
    providerStrength: c.providerStrength,
    providerAvailability,
    requestedType: c.contentType,
    returnedType: top.mediaType === 'tv' ? 'tv' : 'movie',
  });

  const keyFactors: JudgeFactor[] = report.personal.adjustments
    .filter((a) => a.trait !== 'base' && a.points !== 0)
    .sort((a, b) => Math.abs(b.points) - Math.abs(a.points))
    .map((a) => ({ label: a.label, points: a.points, defining: a.defining, reason: a.reason }));

  const verdict: TitleVerdict = {
    id: meta.id,
    mediaType: top.mediaType,
    title: meta.title,
    year: meta.year,
    posterUrl: tmdbImage(meta.posterPath, 'w342'),
    posterPath: meta.posterPath,
    scoredFor,
    primaryCall: report.primaryCall,
    tier: report.tier,
    matchScore: report.personal.score,
    generalScore: report.general.standardScore ?? report.general.score,
    oneLiner: report.oneLiner,
    reasonsFor: report.reasonsFor,
    reasonsAgainst: report.reasonsAgainst,
    keyFactors,
    english: meta.englishAvailability,
    where: whereFrom(providers),
    ratings: tileRatingsFromScore(report.general),
    deciderUrl: deciderSearchUrl(meta.title, meta.year),
    matchStatus: guard.status,
    matchMessage: guard.message,
    isSubstitute: guard.blockAsAnswer,
    requestedTitle,
    requiredProvider: c.requiredProvider?.name ?? null,
  };

  // Better-for-you alternatives: the best-matching titles in the same lane. The
  // Finder scores them for this user, so noir/slow-burn mismatches naturally
  // fall away and only genuine fits surface.
  const genreIds = meta.genres.map((g) => genreIdFromName(g)).filter((n): n is number => n != null).slice(0, 2);
  let alternatives: AltItem[] = [];
  try {
    const altRun = await runFinder(
      supabase,
      userId,
      { ...EMPTY_QUERY, mediaType: top.mediaType, genreIds, minMatch: Math.max(report.personal.score + 1, 65) },
      null,
      // Five alternatives are shown; ask for a few more so the match floor has
      // something to cut, not for a whole browse page nobody sees.
      12,
    );
    alternatives = altRun.items
      .filter((i) => !(i.mediaType === top.mediaType && i.id === top.id))
      .slice(0, 5)
      .map((i) => ({
        id: i.id,
        mediaType: i.mediaType,
        title: i.title,
        year: i.year,
        posterPath: i.posterPath,
        posterUrl: tmdbImage(i.posterPath, 'w342'),
        matchScore: i.matchScore,
        primaryCall: i.primaryCall,
        reason: i.reason,
        where: i.where,
        deciderUrl: i.deciderUrl,
        ratings: i.ratings,
      }));
  } catch {
    /* alternatives are a bonus; a failure here still returns the verdict */
  }

  return { verdict, alternatives };
}
