import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import { searchTitles, getSimilar } from '@/lib/tmdb/client';
import { getScoringData } from '@/lib/titleData';
import { buildVerdict } from '@/lib/scoring';
import { getProfile, getPersonalContext, regionFor, personalLabelFor } from '@/lib/profile';
import { streamingNames } from '@/lib/services';
import { tileRatingsFromScore } from '@/lib/ratings';
import { tmdbImage } from '@/lib/tmdb/image';
import { deciderSearchUrl } from '@/lib/tmdb/meta-helpers';
import { naiveParseQuery, EMPTY_QUERY } from '@/lib/finderParse';
import { genreIdFromName } from '@/lib/finderGenres';
import { runFinder, type FinderItem, type FinderQuery } from '@/lib/finder';
import type { TitleVerdict, AltItem, JudgeFactor } from '@/lib/askTypes';
import { getCachedDimensions } from '@/lib/titleDimensions';
import { rankSeedSimilar } from '@/lib/search/seedSimilarity';
import { canonicalKey, type SeedTitle } from '@/lib/search/titleDna';
import { classifySimilar, type NoCloseMatches } from '@/lib/search/similarResponse';
import type { MediaType } from '@/lib/types';

/** Result of a similar-to-title request: qualified similar items, or an honest
 *  no-close-matches state (never a silent ungated-Finder fallback), or null when
 *  the reference title couldn't be resolved at all. */
export type SimilarResult =
  | { kind: 'similar'; query: FinderQuery; scoredFor: string; items: FinderItem[] }
  | {
      kind: 'no_close_matches';
      scoredFor: string;
      seedTitle: string;
      seedMediaType: MediaType;
      noClose: NoCloseMatches;
      /** Personally-appealing titles that are explicitly NOT close matches. */
      broaderAlternatives: FinderItem[];
    };

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

function titleMatches(cleaned: string, resultTitle: string): boolean {
  const a = norm(cleaned);
  const b = norm(resultTitle);
  if (a.length < 3 || b.length < 3) return false;
  return a === b || a.includes(b) || b.includes(a);
}

/** Only treat the input as a named-title lookup when it isn't a constraint
 *  phrase ("a crime thriller under 2h") — those belong to the Finder. */
export function looksLikeTitleAsk(text: string): boolean {
  const q = naiveParseQuery(text);
  if (q.genreIds.length > 0 || q.minMatch != null || q.minAudience != null || q.maxRuntime !== EMPTY_QUERY.maxRuntime) return false;
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
 * Pull the reference title out of a "more like X" ask. Takes what follows the
 * LAST comparison cue (so "shows I'd like if I like Fargo" → "Fargo"), then
 * strips leading filler. Returns null when there's no comparison in the text.
 */
export function extractReference(text: string): string | null {
  REF_CUE.lastIndex = 0;
  let last: RegExpExecArray | null = null;
  let m: RegExpExecArray | null;
  while ((m = REF_CUE.exec(text)) !== null) {
    last = m;
    if (m.index === REF_CUE.lastIndex) REF_CUE.lastIndex++;
  }
  if (!last) return null;
  const tail = text
    .slice(last.index + last[0].length)
    .replace(/^\s*(?:to|the|a|an|watch|watching|some|something)\s+/i, '')
    .replace(/[?!.]+\s*$/, '')
    .trim();
  return tail.length >= 2 ? tail : null;
}

/**
 * "More like X" — resolve the reference title, pull TMDB's similar/recommended
 * titles, and score each through the deterministic engine for this user. Real
 * neighbors of what they named, best match first. Returns null when the title
 * can't be confidently resolved, so the caller falls back to the plain Finder.
 */
export async function askSimilarTo(
  supabase: SupabaseClient,
  userId: string,
  refText: string,
  limit = 10,
  lens: string | null = null,
): Promise<SimilarResult | null> {
  const cleaned = cleanTitleText(refText);
  if (cleaned.length < 2) return null;
  const results = await searchTitles(cleaned).catch(() => []);
  const matches = results.filter((r) => titleMatches(cleaned, r.title));
  const seed = matches[0];
  if (!seed) return null; // no confident title → not a "more like this" ask

  const similar = await getSimilar(seed.mediaType, seed.id).catch(() => []);
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

  // Only drop titles the user has already handled here; the SEED itself and any
  // canonical duplicate are excluded later by canonical identity (not a bare id),
  // so an alternate/re-release record of the seed can't slip through.
  const cands = similar.filter((s) => !seen.has(`${s.mediaType}-${s.id}`)).slice(0, 16);

  // Title-DNA for the gate: genres + keywords come free from metadata; the 15-axis
  // fingerprint is read cache-only (no LLM at request time) — missing fingerprints
  // degrade gracefully (the gate then relies on genres + keyword anchors).
  const seedData = await getScoringData(seed.mediaType, seed.id, region).catch(() => null);
  const dims = await getCachedDimensions([
    { tmdb_id: seed.id, media_type: seed.mediaType },
    ...cands.map((c) => ({ tmdb_id: c.id, media_type: c.mediaType })),
  ]).catch(() => new Map());
  const seedDna: SeedTitle = {
    canonicalId: canonicalKey({ title: seed.title, year: seed.year ?? null, mediaType: seed.mediaType }),
    tmdbId: seed.id, title: seed.title, year: seed.year ?? null, mediaType: seed.mediaType,
    genres: seedData?.meta.genres ?? [], keywords: seedData?.meta.keywords ?? [],
    dims: dims.get(`${seed.mediaType}-${seed.id}`) ?? {}, collectionId: seedData?.meta.collectionId ?? null, dimsConfidence: 0.9,
  };

  const scored = await Promise.all(
    cands.map(async (c) => {
      try {
        const { meta, providers } = await getScoringData(c.mediaType, c.id, region);
        const report = buildVerdict({ meta, providers, personal: { ...personal, collectionId: null } });
        const item = {
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
        const dna: SeedTitle & { personalScore: number } = {
          canonicalId: canonicalKey({ title: meta.title, year: meta.year, mediaType: c.mediaType }),
          tmdbId: c.id, title: meta.title, year: meta.year, mediaType: c.mediaType,
          genres: meta.genres ?? [], keywords: meta.keywords ?? [],
          dims: dims.get(`${c.mediaType}-${c.id}`) ?? {}, collectionId: meta.collectionId ?? null,
          personalScore: report.personal.score,
        };
        return { item, dna };
      } catch {
        return null;
      }
    }),
  );

  const pairs = scored.filter((x): x is { item: FinderItem; dna: SeedTitle & { personalScore: number } } => x !== null);

  // The seed-similarity qualification gate: canonical seed/duplicate exclusion +
  // shared-anchor / contradiction gate applied BEFORE personalization. Personal
  // fit ranks only the survivors — it can never rescue a candidate that fails the
  // gate. We return FEWER results rather than pad with weak matches.
  const ranked = rankSeedSimilar(seedDna, pairs.map((p) => p.dna), {
    requestedCount: Math.max(1, Math.min(limit, 20)),
    lens: lens ?? undefined,
  });
  const byCanonical = new Map(pairs.map((p) => [p.dna.canonicalId, p.item]));
  const items = ranked.items.map((r) => byCanonical.get(r.canonicalId)).filter((x): x is FinderItem => x != null);

  const query: FinderQuery = { ...EMPTY_QUERY, mediaType: seed.mediaType, similarTo: seed.title };

  const classified = classifySimilar(seed.title, lens, ranked);
  if (classified.kind === 'similar') {
    return { kind: 'similar', query, scoredFor, items };
  }

  // Zero candidates qualified. We do NOT silently hand the request to the ungated
  // Finder. We return an honest no-close-matches state, and — clearly labelled as
  // BROADER ALTERNATIVES, not close matches — offer personally-appealing titles in
  // the seed's genres. The gate breakdown records which gate eliminated candidates.
  const seedGenreIds = (seedData?.meta.genres ?? [])
    .map((n) => genreIdFromName(n))
    .filter((n): n is number => n != null)
    .slice(0, 2);
  let broaderAlternatives: FinderItem[] = [];
  try {
    const alt = await runFinder(
      supabase,
      userId,
      { ...EMPTY_QUERY, mediaType: seed.mediaType, genreIds: seedGenreIds },
      null,
    );
    broaderAlternatives = alt.items
      .filter((i) => canonicalKey({ title: i.title, year: i.year ?? null, mediaType: i.mediaType }) !== seedDna.canonicalId)
      .slice(0, Math.max(1, Math.min(limit, 8)));
  } catch {
    /* broader alternatives are a bonus; the honest no-match state still stands */
  }

  return {
    kind: 'no_close_matches',
    scoredFor,
    seedTitle: seed.title,
    seedMediaType: seed.mediaType,
    noClose: classified,
    broaderAlternatives,
  };
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
): Promise<{ verdict: TitleVerdict; alternatives: AltItem[] } | null> {
  if (!looksLikeTitleAsk(text)) return null;
  const cleaned = cleanTitleText(text);
  const results = await searchTitles(cleaned).catch(() => []);
  if (results.length === 0) return null;

  const wantsTv = /\b(season|series|episodes?)\b/i.test(text);
  const matches = results.filter((r) => titleMatches(cleaned, r.title));
  if (matches.length === 0) return null;
  const top = (wantsTv ? matches.find((m) => m.mediaType === 'tv') : undefined) ?? matches[0]!;

  const profile = await getProfile(supabase, userId);
  const region = regionFor(profile);
  const personal = await getPersonalContext(supabase, userId, null);
  const scoredFor = profile ? personalLabelFor(profile) : 'Your match';

  const { meta, providers } = await getScoringData(top.mediaType, top.id, region);
  const report = buildVerdict({ meta, providers, personal });

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
