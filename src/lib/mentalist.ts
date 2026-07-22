import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { MediaType, TitleMetadata } from '@/lib/types';
import { getScoringData } from '@/lib/titleData';
import { getSimilar, discoverByGenres } from '@/lib/tmdb/client';
import { getTitleVector } from '@/lib/dna';
import { getTitleDimensions } from '@/lib/titleDimensions';
import { buildProfile, dimensionMatch, topDials, type DimensionProfile, type TitleDimensions } from '@/lib/scoring/dimensions';
import { cosine, buildTasteDna, type TasteDna } from '@/lib/scoring/dna';
import { buildVerdict } from '@/lib/scoring';
import { getProfile, getPersonalContext, regionFor } from '@/lib/profile';
import { streamingNames } from '@/lib/services';
import { tileRatingsFromScore, type TileRatings } from '@/lib/ratings';
import { tmdbImage } from '@/lib/tmdb/image';
import { GENRE_IDS } from '@/lib/finderGenres';

/**
 * WatchVerdict Mentalist — "name a few you love, we read your viewing mind."
 *
 * Turns 3–7 loved titles into a multi-signal Viewing DNA (the 15-axis content
 * fingerprint + an embedding vibe centroid + genre & story-motif frequencies),
 * generates a candidate pool from TMDB's behavioral neighbors, and scores each
 * candidate on a transparent blend of those signals — never inventing data.
 * Every signal degrades to a no-op if its source (OpenAI) is absent, so the
 * engine still ranks on genres + motifs + quality alone.
 */

export interface MentalistSeed {
  id: number;
  mediaType: MediaType;
}

export interface MentalistPick {
  id: number;
  mediaType: MediaType;
  title: string;
  year: number | null;
  posterPath: string | null;
  posterUrl: string | null;
  /** 0..100 fit — how strongly your fingerprint points here (a MATCH, not a claim about finishing). */
  match: number;
  primaryCall: string;
  reason: string;
  because: string | null; // the loved title it most echoes
  commitment: string; // "Movie · 2h" / "Limited series" / "5 seasons"
  where: string | null;
  stretch: boolean; // a deliberate wildcard to reveal a new taste dimension
  ratings: TileRatings;
}

export interface ViewingDna {
  summary: string; // one-paragraph read of the taste
  dials: { label: string; lean: string }[]; // the strongest axes
  predictions: string[]; // "Scarily accurate?" statements to confirm/reject
  seeds: string[]; // the titles it read
}

export interface MentalistResult {
  dna: ViewingDna;
  picks: MentalistPick[];
}

interface Seeded {
  meta: TitleMetadata;
  dims: TitleDimensions | null;
  vector: number[] | null;
}

interface Fingerprint {
  profile: DimensionProfile;
  liked: TasteDna;
  genreCounts: Map<string, number>;
  keywordCounts: Map<string, number>;
  seedTitles: string[];
  region: string;
}

const SIM = (n: number) => Math.max(0, Math.min(100, Math.round(n)));

/** Cosine → a calibrated 0..100 "vibe fit" (related content sits ~0.15–0.60). */
function vibeFit(vec: number[] | null, liked: number[] | null): number | null {
  if (!vec || !liked) return null;
  const s = cosine(vec, liked);
  return SIM(((s - 0.15) / 0.45) * 100);
}

/** Fraction of a title's genres that the user's loved set leans on → 0..100. */
function genreFit(genres: string[], counts: Map<string, number>): number | null {
  if (counts.size === 0 || genres.length === 0) return null;
  const top = new Set([...counts.entries()].filter(([, c]) => c >= 1).map(([g]) => g));
  if (top.size === 0) return null;
  const hits = genres.filter((g) => top.has(g.toLowerCase())).length;
  return SIM((hits / Math.max(1, Math.min(genres.length, 3))) * 100);
}

/** Shared story motifs (TMDB keywords) between a title and the loved set → 0..100. */
function motifFit(keywords: string[], counts: Map<string, number>): { score: number | null; shared: string[] } {
  if (counts.size === 0 || keywords.length === 0) return { score: null, shared: [] };
  const shared: string[] = [];
  let weight = 0;
  for (const k of keywords) {
    const c = counts.get(k.toLowerCase());
    if (c) {
      weight += c;
      if (shared.length < 3) shared.push(k);
    }
  }
  if (weight === 0) return { score: 0, shared: [] };
  // 2+ shared motifs is a strong signal; saturate there.
  return { score: SIM(Math.min(1, weight / 3) * 100), shared };
}

function commitmentLabel(meta: TitleMetadata): { label: string; fit: number } {
  if (meta.mediaType === 'movie') {
    const rt = meta.runtimeMinutes;
    const t = rt ? ` · ${Math.floor(rt / 60)}h${rt % 60 ? ` ${rt % 60}m` : ''}` : '';
    return { label: `Movie${t}`, fit: 82 };
  }
  const seasons = meta.numberOfSeasons ?? null;
  const eps = meta.numberOfEpisodes ?? null;
  if (seasons != null && seasons <= 1) return { label: eps ? `Limited · ${eps} eps` : 'Limited series', fit: 88 };
  if (seasons != null) {
    const fit = seasons <= 3 ? 66 : seasons <= 5 ? 50 : 36;
    return { label: `${seasons} seasons`, fit };
  }
  return { label: 'Series', fit: 60 };
}

async function hydrateSeed(mediaType: MediaType, id: number, region: string): Promise<Seeded | null> {
  try {
    const { meta } = await getScoringData(mediaType, id, region);
    const [dims, vector] = await Promise.all([
      getTitleDimensions(meta).catch(() => null),
      getTitleVector(mediaType, id).catch(() => null),
    ]);
    return { meta, dims, vector };
  } catch {
    return null;
  }
}

function buildFingerprint(seeded: Seeded[], region: string): Fingerprint {
  const profile = buildProfile(
    seeded.filter((s) => s.dims).map((s) => ({ dims: s.dims as TitleDimensions, rating: 9 })),
  );
  const liked = buildTasteDna(
    seeded.filter((s) => s.vector).map((s) => ({ vector: s.vector as number[], rating: 9 })),
  );
  const genreCounts = new Map<string, number>();
  const keywordCounts = new Map<string, number>();
  for (const s of seeded) {
    for (const g of s.meta.genres) genreCounts.set(g.toLowerCase(), (genreCounts.get(g.toLowerCase()) ?? 0) + 1);
    for (const k of s.meta.keywords.slice(0, 20)) keywordCounts.set(k.toLowerCase(), (keywordCounts.get(k.toLowerCase()) ?? 0) + 1);
  }
  return { profile, liked, genreCounts, keywordCounts, seedTitles: seeded.map((s) => s.meta.title), region };
}

/** Turn the fingerprint into a plain-English "read" + confirm/reject statements. */
function readViewingDna(fp: Fingerprint): ViewingDna {
  const dials = topDials(fp.profile, 6);
  const leadGenres = [...fp.genreCounts.entries()]
    .filter(([, c]) => c >= 2)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([g]) => g);

  const leanPhrase = (key: string, pref: number): string | null => {
    const hi = pref >= 50;
    switch (key) {
      case 'pacing': return hi ? 'things that move' : 'a patient slow burn';
      case 'darkness': return hi ? 'a dark streak' : 'a lighter touch';
      case 'complexity': return hi ? 'something to chew on' : 'an easy watch';
      case 'realism': return hi ? 'grounded over supernatural' : 'the fantastical';
      case 'character': return hi ? 'strong lead characters' : 'a driving plot';
      case 'suspense': return hi ? 'real tension' : 'a low-stress ride';
      case 'morality': return hi ? 'morally grey people' : 'clear good-and-bad';
      case 'serialized': return hi ? 'a serialized arc' : 'satisfying episodes';
      case 'violence': return hi ? 'a hard edge' : 'a tamer tone';
      case 'emotion': return hi ? 'an emotional gut-punch' : 'a breezier feel';
      default: return null;
    }
  };

  const leans = dials.map((d) => leanPhrase(d.dim.key, d.pref)).filter((x): x is string => x != null).slice(0, 4);
  const genreBit = leadGenres.length ? `You gravitate to ${leadGenres.join(', ')}. ` : '';
  const summary = `${genreBit}You go for ${leans.length ? leans.join(', ') : 'a consistent vibe across what you picked'}.`;

  // 5 "scarily accurate?" statements from the strongest axes.
  const stmtFor = (key: string, pref: number): string | null => {
    const hi = pref >= 50;
    switch (key) {
      case 'pacing': return hi ? 'A slow start loses you — you want it moving.' : 'You’re patient with a slow burn if it pays off.';
      case 'darkness': return hi ? 'You lean dark over cozy.' : 'You’d rather not sit in bleakness.';
      case 'complexity': return hi ? 'You want something to think about, not background noise.' : 'You want an easy watch, not homework.';
      case 'realism': return hi ? 'You tolerate violence more than supernatural storylines.' : 'You’re open to the supernatural and sci-fi.';
      case 'character': return hi ? 'You need an interesting lead character.' : 'A gripping plot matters more to you than the lead.';
      case 'serialized': return hi ? 'You’ll commit to a long arc that builds.' : 'You’d rather watch six excellent episodes than twenty average ones.';
      case 'morality': return hi ? 'You’re drawn to morally complicated people.' : 'You like a clear line between right and wrong.';
      case 'suspense': return hi ? 'You want mysteries with real tension and a payoff.' : 'You don’t need constant edge-of-seat tension.';
      default: return null;
    }
  };
  const predictions = dials.map((d) => stmtFor(d.dim.key, d.pref)).filter((x): x is string => x != null).slice(0, 5);

  return {
    summary,
    dials: dials.slice(0, 5).map((d) => ({ label: d.dim.label, lean: d.lean })),
    predictions,
    seeds: fp.seedTitles,
  };
}

function whereFrom(providers: { available: boolean; options: { providerName: string; type: string }[] } | null): string | null {
  if (!providers || !providers.available) return null;
  const names = streamingNames(providers.options as never);
  return names.length ? names[0]! : null;
}

/**
 * Read a viewer's mind from 3–7 loved titles: build the fingerprint, gather
 * behavioral neighbors, score them on the blended model, and return a ranked
 * set of predicted picks (with a couple of deliberate stretch picks) plus the
 * Viewing-DNA read-back. `limit` is the number of picks to return.
 */
export async function readViewingMind(
  supabase: SupabaseClient,
  userId: string,
  seeds: MentalistSeed[],
  limit = 12,
): Promise<MentalistResult | null> {
  const uniqueSeeds = seeds.filter((s, i) => seeds.findIndex((o) => o.id === s.id && o.mediaType === s.mediaType) === i).slice(0, 7);
  if (uniqueSeeds.length < 2) return null;

  const profileRow = await getProfile(supabase, userId);
  const region = regionFor(profileRow);
  const personal = await getPersonalContext(supabase, userId, null);

  const seeded = (await Promise.all(uniqueSeeds.map((s) => hydrateSeed(s.mediaType, s.id, region)))).filter(
    (x): x is Seeded => x != null,
  );
  if (seeded.length < 2) return null;

  const fp = buildFingerprint(seeded, region);
  const dna = readViewingDna(fp);

  const seedKeys = new Set(uniqueSeeds.map((s) => `${s.mediaType}-${s.id}`));

  // Exclude anything the user has already handled (seen / dropped).
  const { data: wl } = await supabase
    .from('watchlist_items')
    .select('tmdb_id, media_type, status')
    .eq('user_id', userId);
  const handled = new Set(
    (wl ?? []).filter((r) => r.status === 'watched' || r.status === 'dropped').map((r) => `${r.media_type}-${r.tmdb_id}`),
  );

  // Behavioral neighbors: TMDB similar/recommended for each seed (freq = how many
  // of your favorites point at it), plus a genre-discovery slice for breadth.
  const topGenreIds = [...fp.genreCounts.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([g]) => genreIdFor(g))
    .filter((n): n is number => n != null)
    .slice(0, 3);

  const [simLists, discMovies, discTv] = await Promise.all([
    Promise.all(uniqueSeeds.map((s) => getSimilar(s.mediaType, s.id).catch(() => []))),
    topGenreIds.length ? discoverByGenres('movie', topGenreIds, region).catch(() => []) : Promise.resolve([]),
    topGenreIds.length ? discoverByGenres('tv', topGenreIds, region).catch(() => []) : Promise.resolve([]),
  ]);

  const freq = new Map<string, { id: number; mediaType: MediaType; vote: number; freq: number }>();
  const consider = (id: number, mediaType: MediaType, vote: number) => {
    const key = `${mediaType}-${id}`;
    if (seedKeys.has(key) || handled.has(key)) return;
    const e = freq.get(key);
    if (e) e.freq += 1;
    else freq.set(key, { id, mediaType, vote, freq: 1 });
  };
  for (const list of simLists) for (const t of list) consider(t.id, t.mediaType, t.voteAverage ?? 0);
  for (const t of [...discMovies, ...discTv]) consider(t.id, t.mediaType, 0);

  // Cheap pre-rank (behavioral frequency, then crowd score) → only richly score
  // the strongest ~28, keeping the expensive fingerprint work bounded.
  const preRanked = [...freq.values()].sort((a, b) => b.freq - a.freq || b.vote - a.vote).slice(0, 28);
  if (preRanked.length === 0) return { dna, picks: [] };

  const maxFreq = Math.max(...preRanked.map((c) => c.freq));
  const grounded = (fp.profile.pref.realism ?? 50) >= 62 && (fp.profile.weight.realism ?? 0) > 2;

  const scored = await Promise.all(
    preRanked.map(async (c) => {
      try {
        const { meta, providers } = await getScoringData(c.mediaType, c.id, region);
        const [dims, vector] = await Promise.all([
          getTitleDimensions(meta).catch(() => null),
          getTitleVector(c.mediaType, c.id).catch(() => null),
        ]);
        const report = buildVerdict({ meta, providers, personal: { ...personal, collectionId: null } });

        const dimM = dims ? dimensionMatch(dims, fp.profile) : null;
        const vibe = vibeFit(vector, fp.liked.liked);
        const gFit = genreFit(meta.genres, fp.genreCounts);
        const { score: mFit, shared } = motifFit(meta.keywords, fp.keywordCounts);
        const behavioral = SIM((c.freq / maxFreq) * 100);
        const quality = report.general.standardScore ?? report.general.score;
        const commit = commitmentLabel(meta);

        // Content/tone similarity: the fingerprint match + the vibe vector (mean
        // of whichever we have). This is the heart of the model.
        const content = avg([dimM, vibe]);

        // Weighted blend — skips any signal we couldn't compute and renormalizes.
        let match = weighted([
          [content, 0.35],
          [behavioral, 0.2],
          [mFit, 0.15],
          [quality, 0.15],
          [commit.fit, 0.1],
          [providers?.available ? 100 : 40, 0.05],
        ]);

        // Rejection penalty: a grounded viewer being handed supernatural/sci-fi.
        if (grounded && meta.genres.some((g) => /science fiction|fantasy/i.test(g))) match -= 12;

        const primaryGenre = meta.genres[0] ?? null;
        return {
          pick: {
            id: c.id,
            mediaType: c.mediaType,
            title: meta.title,
            year: meta.year,
            posterPath: meta.posterPath,
            posterUrl: tmdbImage(meta.posterPath, 'w342'),
            match: SIM(match),
            primaryCall: report.primaryCall,
            reason: buildReason({ shared, primaryGenre, dna, commit: commit.label, behavioral, content }),
            because: strongestSeed(c.mediaType, c.id, simLists, uniqueSeeds, fp.seedTitles),
            commitment: commit.label,
            where: whereFrom(providers),
            stretch: false,
            ratings: tileRatingsFromScore(report.general),
          } as MentalistPick,
          primaryGenre: primaryGenre?.toLowerCase() ?? null,
          content: content ?? 0,
        };
      } catch {
        return null;
      }
    }),
  );

  const valid = scored.filter((x): x is NonNullable<typeof x> => x != null).sort((a, b) => b.pick.match - a.pick.match);
  if (valid.length === 0) return { dna, picks: [] };

  // Controlled novelty: reserve 2 slots for "stretch picks" — solid-scoring
  // titles whose lead genre is OUTSIDE the user's core, to test a new dimension.
  const coreGenres = new Set([...fp.genreCounts.entries()].filter(([, c]) => c >= 2).map(([g]) => g));
  const core = valid.slice(0, Math.max(0, limit - 2));
  const coreKeys = new Set(core.map((c) => `${c.pick.mediaType}-${c.pick.id}`));
  const stretches = valid
    .filter((c) => !coreKeys.has(`${c.pick.mediaType}-${c.pick.id}`))
    .filter((c) => c.primaryGenre && !coreGenres.has(c.primaryGenre) && c.pick.match >= 55)
    .slice(0, 2)
    .map((c) => ({ ...c, pick: { ...c.pick, stretch: true, reason: `Stretch pick — ${c.pick.reason}` } }));

  const picks = [...core, ...stretches].slice(0, limit).map((c) => c.pick);
  return { dna, picks };
}

// ---- helpers ----

function avg(vals: (number | null)[]): number | null {
  const xs = vals.filter((v): v is number => v != null);
  if (xs.length === 0) return null;
  return xs.reduce((a, b) => a + b, 0) / xs.length;
}

function weighted(pairs: [number | null, number][]): number {
  let num = 0;
  let den = 0;
  for (const [v, w] of pairs) {
    if (v == null) continue;
    num += v * w;
    den += w;
  }
  return den > 0 ? num / den : 50;
}

function genreIdFor(name: string): number | null {
  // Local import avoided at top to keep this pure-ish; map is tiny + client-safe.
  return GENRE_IDS[name.toLowerCase()] ?? null;
}

function strongestSeed(
  mediaType: MediaType,
  id: number,
  simLists: { id: number; mediaType: MediaType }[][],
  seeds: MentalistSeed[],
  seedTitles: string[],
): string | null {
  for (let i = 0; i < simLists.length; i++) {
    if (simLists[i]!.some((t) => t.id === id && t.mediaType === mediaType)) return seedTitles[i] ?? null;
  }
  return null;
}

function buildReason(a: {
  shared: string[];
  primaryGenre: string | null;
  dna: ViewingDna;
  commit: string;
  behavioral: number;
  content: number | null;
}): string {
  const bits: string[] = [];
  if (a.shared.length) bits.push(`shares the ${a.shared.slice(0, 2).join(' & ')} you keep picking`);
  else if (a.primaryGenre) bits.push(`hits your ${a.primaryGenre.toLowerCase()} lane`);
  const lead = a.dna.dials[0];
  if (lead) bits.push(`with the ${lead.lean.toLowerCase()} you go for`);
  if (a.behavioral >= 66) bits.push('and fans of your list land here too');
  const tail = bits.length ? bits.join(', ') : 'matches your taste fingerprint';
  return `${tail.charAt(0).toUpperCase()}${tail.slice(1)} — ${a.commit}.`;
}
