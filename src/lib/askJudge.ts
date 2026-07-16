import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import { searchTitles } from '@/lib/tmdb/client';
import { getScoringData } from '@/lib/titleData';
import { buildVerdict } from '@/lib/scoring';
import { getProfile, getPersonalContext, regionFor, personalLabelFor } from '@/lib/profile';
import { streamingNames } from '@/lib/services';
import { tileRatingsFromScore } from '@/lib/ratings';
import { tmdbImage } from '@/lib/tmdb/image';
import { deciderSearchUrl } from '@/lib/tmdb/meta-helpers';
import { naiveParseQuery, EMPTY_QUERY } from '@/lib/finderParse';
import { genreIdFromName } from '@/lib/finderGenres';
import { runFinder } from '@/lib/finder';
import type { TitleVerdict, AltItem, JudgeFactor } from '@/lib/askTypes';

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
