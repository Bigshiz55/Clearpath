import 'server-only';
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import type { DiscoveryPage, TitleFacts } from './types';

/**
 * TITLE PAGE GENERATOR — turns cached canonical title facts into movie and show
 * pages, then hands them to the same quality gate every editorial page passes.
 *
 * ARCHITECTURE NOTE (required by the spec): public pages must never make a live
 * TMDB, availability or AI call on request. Facts are read from a CACHE FILE
 * written by `scripts/seed-title-facts.mjs`, which is the only thing that talks
 * to TMDB, and only when a key exists. At request time this module is pure
 * filesystem + pure functions.
 *
 * A title with no verified availability and no rating evidence produces a page
 * that FAILS the gate and therefore never publishes. That is deliberate: it is
 * exactly the thin auto-generated page the platform must refuse to emit.
 */

const CACHE_PATH = join(process.cwd(), 'src/lib/discovery/data/titleFacts.json');

export interface CachedTitle extends TitleFacts {
  slug: string;
  title: string;
  overview: string;
  /** Original WatchVerd1ct analysis — never a copy of the TMDB synopsis. */
  verdictSummary: string;
  whoItIsFor: string;
  whoShouldSkip: string;
  characteristics: string[];
  contentNotes: string[];
  similar: { slug: string; label: string; kind: 'movie' | 'show' }[];
  /** When the cached facts were captured, for freshness disclosure. */
  cachedAt: string;
}

let memo: CachedTitle[] | null = null;

/** Read the cache once per process. Missing or malformed cache = no title pages. */
export function loadCachedTitles(): CachedTitle[] {
  if (memo) return memo;
  try {
    if (!existsSync(CACHE_PATH)) {
      memo = [];
      return memo;
    }
    const raw = JSON.parse(readFileSync(CACHE_PATH, 'utf8')) as unknown;
    memo = Array.isArray(raw) ? (raw as CachedTitle[]) : [];
  } catch {
    memo = [];
  }
  return memo;
}

/** For tests: build pages from an explicit list instead of the cache file. */
export function buildTitlePages(titles: CachedTitle[]): DiscoveryPage[] {
  return titles.map(toPage);
}

/** Every movie/show page the platform knows about. */
export function titlePages(): DiscoveryPage[] {
  return buildTitlePages(loadCachedTitles());
}

const yearLabel = (t: CachedTitle) => (t.year ? ` (${t.year})` : '');

function runtimeLabel(t: CachedTitle): string {
  if (t.mediaType === 'tv') {
    return t.episodes ? `${t.seasons ?? 1} season${(t.seasons ?? 1) === 1 ? '' : 's'} · ${t.episodes} episodes` : 'Series';
  }
  return t.runtimeMinutes ? `${t.runtimeMinutes} minutes` : 'Runtime unavailable';
}

/** Availability sentence — never asserts more than the cache actually holds. */
function availabilityLine(t: CachedTitle): string {
  if (t.providers.length === 0) {
    return 'We have no verified streaming availability for this title in your region right now. Availability changes frequently, so check inside WatchVerd1ct for a live answer.';
  }
  return `Listed on ${t.providers.join(', ')} according to our listings source as of ${t.cachedAt}. Availability changes often, so WatchVerd1ct re-checks it live when you ask for a recommendation.`;
}

function evidenceLine(t: CachedTitle): string {
  if (t.ratings.length === 0) {
    return 'No independent rating sources are available for this title yet, so any confident claim about its reception would be invented. WatchVerd1ct shows what exists and marks its confidence accordingly.';
  }
  return `Independent evidence: ${t.ratings.map((r) => `${r.source} ${r.value}`).join(' · ')}. WatchVerd1ct blends every source it has into one Watchability score, then weighs that against your own taste profile.`;
}

/** One cached title → one publishable-shaped page. */
function toPage(t: CachedTitle): DiscoveryPage {
  const isShow = t.mediaType === 'tv';
  const kind = isShow ? 'show' : 'movie';
  const genreLine = t.genres.length ? t.genres.join(', ') : 'Genre unavailable';

  return {
    kind,
    slug: t.slug,
    title: `${t.title}${yearLabel(t)}: Should You Watch It?`,
    description:
      `Is ${t.title} worth your evening? The WatchVerd1ct take on who will enjoy it, who should skip it, ` +
      `where to stream it and how it scores against your own taste.`,
    heading: `${t.title}${yearLabel(t)}`,
    standfirst: `${genreLine} · ${runtimeLabel(t)}`,
    status: 'published',
    updated: t.cachedAt,
    title_data: t,
    sections: [
      {
        heading: 'The WatchVerd1ct take',
        body: [t.verdictSummary, evidenceLine(t)],
      },
      {
        heading: 'Why people like it',
        body: [t.whoItIsFor],
        bullets: t.characteristics,
      },
      {
        heading: 'Who should skip it',
        body: [t.whoShouldSkip],
        bullets: t.contentNotes.length ? t.contentNotes : undefined,
      },
      {
        heading: 'Where to watch',
        body: [availabilityLine(t)],
      },
      {
        heading: `How ${t.title} scores for you`,
        body: [
          `A crowd average cannot tell you whether ${t.title} suits you specifically tonight. WatchVerd1ct predicts a Your Match score from your Viewer DNA across interpretable traits — pace, tone, darkness, complexity and more — and separates that from Tonight Fit, which accounts for who is watching and how long you have.`,
          'Every recommendation explains why it rose, what held it back, which of your requirements were checked, and how confident the system actually is given the evidence available.',
        ],
      },
    ],
    faq: [
      {
        question: `Where can I stream ${t.title}?`,
        answer: availabilityLine(t),
      },
      {
        question: `How long is ${t.title}?`,
        answer: isShow
          ? `${runtimeLabel(t)}${t.seriesStatus ? `. Series status: ${t.seriesStatus}.` : '.'} Episode length is what WatchVerd1ct matches against a runtime request, since that is the unit you commit to in one sitting.`
          : `${t.title} runs ${t.runtimeMinutes ?? 'an unlisted number of'} minutes. WatchVerd1ct treats a runtime limit as a hard rule, so it will never appear when you ask for something shorter.`,
      },
      {
        question: `Will I like ${t.title}?`,
        answer:
          'That depends on your taste rather than the average viewer\'s. Build a Viewer DNA profile and WatchVerd1ct predicts a personal Your Match score with its reasoning shown, instead of handing you a crowd percentage.',
      },
    ],
    related: [
      ...t.similar.slice(0, 3).map((s) => ({
        href: `/${s.kind === 'show' ? 'show' : 'movie'}/${s.slug}`,
        label: s.label,
      })),
      { href: '/for/movie-night', label: 'What should I watch tonight?' },
      { href: '/guides/why-average-ratings-fail', label: 'Why average ratings fail' },
    ],
    cta: { label: `Get your Verd1ct on ${t.title}`, href: '/start' },
  };
}
