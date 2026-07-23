/**
 * The deterministic "system under test" for offline evaluation.
 *
 * IMPORTANT — faithfulness note: this is a **faithful in-process reference of
 * the production `runFinder` contract**, not a copy of its network/DB
 * orchestration (which is `import 'server-only'` and TMDB/Supabase-bound). It
 * reuses the REAL authoritative pieces:
 *   - `buildVerdict` (the pure deterministic scoring/ranking engine), and
 *   - the real service-inclusion semantics (`includedServiceNames`).
 * and mirrors `runFinder`'s documented steps: candidate pull → exclude seen →
 * CANDIDATE_CAP → per-candidate hard filter → rank by personal match → relax on
 * empty. Broadcast intents mirror `getStoredGridAirings`' in-progress window +
 * dedup.
 *
 * The finder acts ONLY on the *normalized* query (what the parser produced).
 * Whether that matches the user's intent is graded separately (Layer A), and
 * whether the returned titles satisfy the *intended* hard constraints is graded
 * independently against fixture facts (Layer B). So a parser miss shows up as a
 * constraint violation here without the finder having to "know" the truth.
 */
import { buildVerdict } from '@/lib/scoring/verdict';
import { includedServiceNames } from '@/lib/services';
import type { NormalizedQuery, NormalizedIntent } from '../contract';
import type { EvalProfile } from '../fixtures/profiles';
import { householdContext, PROFILES } from '../fixtures/profiles';
import { providersFor, PROVIDER_NAMES, type FixtureTitle } from '../fixtures/titles';
import type { FixtureWorld, ResolvedAiring } from '../fixtures/index';

/** Mirrors src/lib/finder.ts CANDIDATE_CAP. */
export const CANDIDATE_CAP = 16;
/** Mirrors the finder default page size. */
export const DEFAULT_LIMIT = 8;

export interface PipelineResultItem {
  id: string;
  tmdbId: number;
  mediaType: 'movie' | 'tv';
  title: string;
  year: number | null;
  matchScore: number;
  generalScore: number;
  primaryCall: string;
  where: string | null;
  networkKey?: string | null;
  airingStartMs?: number | null;
  airingEndMs?: number | null;
  receipts: string[];
}

export interface PipelineResult {
  intent: NormalizedIntent;
  items: PipelineResultItem[];
  scoredFor: string;
  relaxed: string | null;
  total: number;
  clarification: string | null;
  /** Diagnostic: candidates considered before ranking (for recall grading). */
  consideredIds: string[];
  /** The message a voice UI would speak. */
  responseText: string;
}

/** Canonical form for cross-source genre/attribute comparison. */
function canon(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]/g, '');
}

function personalContextFor(q: NormalizedQuery, profile: EvalProfile) {
  if (q.householdProfile) {
    const other = PROFILES[q.householdProfile.toLowerCase()];
    if (other) return householdContext(profile, other);
  }
  return profile.personal;
}

function seenIds(profile: EvalProfile): Set<string> {
  // Mirrors runFinder: exclude watched/dropped; we also exclude explicit
  // rejections so "nothing I rejected" is honoured by default.
  return new Set(profile.history.map((h) => h.id));
}

function score(title: FixtureTitle, q: NormalizedQuery, profile: EvalProfile, nowMs: number) {
  const providers = providersFor(title.facts.providerIds, profile.region);
  const report = buildVerdict({
    meta: title.meta,
    providers,
    personal: personalContextFor(q, profile),
    now: new Date(nowMs).toISOString(),
  });
  return { report, providers };
}

/** Does the title pass every hard filter the normalized query declares? */
function passesFilters(
  title: FixtureTitle,
  q: NormalizedQuery,
  profile: EvalProfile,
): { ok: boolean; where: string | null } {
  const f = title.facts;

  // content type (movie/tv/documentary/etc.)
  if (q.contentTypes.length && !q.contentTypes.includes(f.contentType)) {
    // movie/tv are the storage types; documentary/live_tv are facets — allow a
    // documentary request to match a movie/tv whose attributes say documentary.
    const facet = q.contentTypes.some((c) => f.attributes.includes(c));
    if (!facet) return { ok: false, where: null };
  }

  // platform (streaming): title must be included on at least one requested provider
  let where: string | null = null;
  if (q.platforms.length) {
    const wanted = q.platforms.map((p) => p.id);
    const inc = includedServiceNames(providersFor(f.providerIds).options, wanted);
    if (inc.length === 0) return { ok: false, where: null };
    where = inc[0] ?? null;
  }

  // subscription access: when the request is scoped to "my services"
  if (q.availability.type === 'streaming' && q.excludedAttributes.includes('__my_services__')) {
    const inc = includedServiceNames(providersFor(f.providerIds).options, profile.subscriptions);
    if (inc.length === 0) return { ok: false, where: null };
    where = where ?? inc[0] ?? null;
  }

  // language / "no subtitles" / "no dubbed"
  if (q.excludedAttributes.includes('subtitles') && title.meta.englishAvailability === 'subtitles') {
    return { ok: false, where };
  }
  if (q.excludedAttributes.includes('dubbed') && title.meta.englishAvailability === 'available') {
    return { ok: false, where };
  }

  // explicit excluded content attributes (supernatural, science_fiction, noir…)
  const titleGenreCanon = title.meta.genres.map(canon);
  const attrCanon = f.attributes.map(canon);
  for (const attr of q.excludedAttributes) {
    if (attr.startsWith('__')) continue;
    const a = canon(attr);
    if (attrCanon.includes(a)) return { ok: false, where };
    if (titleGenreCanon.includes(a)) return { ok: false, where }; // genre-name exclusion
  }

  // genre requirement (any-of). Compare on a canonical form so "Science-Fiction"
  // (detector) matches "Science Fiction" (title) and "science_fiction" (attr).
  if (q.genres.length) {
    const wanted = q.genres.map(canon);
    if (!wanted.some((w) => titleGenreCanon.includes(w) || attrCanon.includes(w))) return { ok: false, where };
  }

  if (where === null && f.providerIds.length) where = PROVIDER_NAMES[f.providerIds[0]!] ?? null;
  return { ok: true, where };
}

function toItem(
  title: FixtureTitle,
  scored: ReturnType<typeof score>,
  where: string | null,
  airing?: ResolvedAiring,
): PipelineResultItem {
  return {
    id: `${title.meta.mediaType}-${title.meta.id}`,
    tmdbId: title.meta.id,
    mediaType: title.meta.mediaType,
    title: title.meta.title,
    year: title.meta.year,
    matchScore: Math.round(scored.report.personal.score),
    generalScore: Math.round(scored.report.general.score),
    primaryCall: scored.report.primaryCall,
    where: airing ? airing.networkKey : where,
    networkKey: airing?.networkKey ?? null,
    airingStartMs: airing?.startMs ?? null,
    airingEndMs: airing?.endMs ?? null,
    receipts: scored.report.reasonsFor.slice(0, 3),
  };
}

/** Route to broadcast when the request is a scheduled/airing/network ask. */
function isBroadcast(q: NormalizedQuery): boolean {
  return (
    q.normalizedIntent === 'scheduled_broadcast_discovery' ||
    q.availability.type === 'scheduled_broadcast' ||
    (q.networks.length > 0 && q.platforms.length === 0)
  );
}

export function runFixtureFinder(q: NormalizedQuery, profileKey: string, world: FixtureWorld): PipelineResult {
  const profile = world.profile(profileKey);
  const seen = seenIds(profile);
  const limit = q.requestedCount ?? DEFAULT_LIMIT;
  const scoredForBase = q.personalizationRequested ? `${profile.displayName} match` : 'Your match';

  // ── Unsupported content types → reject, never fabricate ──────────────────
  if (q.normalizedIntent === 'unsupported') {
    return {
      intent: 'unsupported',
      items: [],
      scoredFor: scoredForBase,
      relaxed: null,
      total: 0,
      clarification: 'WatchVerdict covers movies and TV, not that. Want me to look for a related show or film instead?',
      consideredIds: [],
      responseText: 'I can’t search that category — WatchVerdict is for movies and TV. Want a related film or show?',
    };
  }

  // ── Broadcast (live TV within a time window) ─────────────────────────────
  if (isBroadcast(q)) {
    const horizonHours = q.availability.endOffsetHours ?? 24;
    const networkKey = q.networks[0] ?? null;
    const movieOnly = q.contentTypes.includes('movie') && !q.contentTypes.includes('tv');
    let airings = world.airingsWithin({ horizonHours, networkKey, movieOnly });

    // dedup by title|start (mirrors getUpcomingTv merge dedup)
    const seenKey = new Set<string>();
    airings = airings.filter((a) => {
      const k = `${a.title.meta.title.toLowerCase()}|${a.startMs}`;
      if (seenKey.has(k)) return false;
      seenKey.add(k);
      return true;
    });

    const scoredItems = airings
      .filter((a) => !seen.has(a.id))
      .map((a) => {
        const { ok } = passesFilters(a.title, q, profile);
        if (!ok) return null;
        const s = score(a.title, q, profile, world.nowMs);
        return { item: toItem(a.title, s, null, a), key: a.id };
      })
      .filter((x): x is { item: PipelineResultItem; key: string } => x !== null);

    // rank by personal match when personalization requested, else by airing time
    if (q.personalizationRequested) scoredItems.sort((x, y) => y.item.matchScore - x.item.matchScore);
    else scoredItems.sort((x, y) => (x.item.airingStartMs ?? 0) - (y.item.airingStartMs ?? 0));

    const items = scoredItems.slice(0, limit).map((x) => x.item);
    const total = scoredItems.length;
    return {
      intent: 'scheduled_broadcast_discovery',
      items,
      scoredFor: scoredForBase,
      relaxed: null,
      total,
      clarification: null,
      consideredIds: scoredItems.map((x) => x.key),
      responseText: responseFor(items, limit, q, total),
    };
  }

  // ── Streaming / personalized discovery / platform browse ─────────────────
  const considered: string[] = [];
  const candidates = world.catalog
    .filter((t) => (t.facts.airings ?? []).length === 0 || t.facts.providerIds.length > 0) // has a streaming home
    .filter((t) => !seen.has(`${t.meta.mediaType}-${t.meta.id}`));

  const scored: { item: PipelineResultItem; report: ReturnType<typeof score> }[] = [];
  for (const t of candidates.slice(0, CANDIDATE_CAP * 2)) {
    const { ok, where } = passesFilters(t, q, profile);
    if (!ok) continue;
    considered.push(`${t.meta.mediaType}-${t.meta.id}`);
    if (considered.length > CANDIDATE_CAP) break; // mirror the recall cap
    const s = score(t, q, profile, world.nowMs);
    scored.push({ item: toItem(t, s, where), report: s });
  }

  scored.sort((a, b) => b.item.matchScore - a.item.matchScore);
  // dedup by id
  const dedup = new Map<string, PipelineResultItem>();
  for (const s of scored) if (!dedup.has(s.item.id)) dedup.set(s.item.id, s.item);
  let items = [...dedup.values()].slice(0, limit);

  // relaxed fallback: mirror runFinder — only relax SOFT constraints. Hard
  // constraints (excluded attributes, platform, content type) are NEVER dropped,
  // so a relaxed search can never leak content the user explicitly excluded.
  // Here the only soft constraint is the (often mis-parsed) positive genre
  // requirement.
  let relaxed: string | null = null;
  if (items.length === 0 && q.genres.length) {
    const relaxedQ: NormalizedQuery = { ...q, genres: [] };
    const again = runFixtureFinder(relaxedQ, profileKey, world);
    if (again.items.length) {
      items = again.items.slice(0, limit);
      relaxed = 'Nothing cleared every bar, so we widened the search a little.';
    }
  }

  const intent: NormalizedIntent =
    q.normalizedIntent === 'platform_browse' || q.normalizedIntent === 'similar_to'
      ? q.normalizedIntent
      : 'personalized_content_discovery';

  return {
    intent,
    items,
    scoredFor: scoredForBase,
    relaxed,
    total: dedup.size,
    clarification: null,
    consideredIds: considered,
    responseText: responseFor(items, limit, q, dedup.size),
  };
}

function responseFor(items: PipelineResultItem[], limit: number, q: NormalizedQuery, total: number): string {
  if (items.length === 0) {
    return 'I couldn’t find anything that fits — nothing matched your filters. Want me to loosen one?';
  }
  const n = items.length;
  const asked = q.requestedCount;
  const lead =
    asked && n < asked
      ? `I found ${n} (you asked for ${asked}) that truly fit`
      : `Here ${n === 1 ? 'is' : 'are'} ${n}`;
  const top = items[0]!;
  return `${lead}. Top pick: ${top.title}${top.year ? ` (${top.year})` : ''} — ${top.receipts[0] ?? 'a strong match for your taste'}.`;
}
