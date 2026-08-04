/**
 * WHAT YOUR PICKS SAY ABOUT YOU.
 *
 * The grid used to end with "Got it." — a count and two buttons. That is the
 * moment someone has just done the work, and it gave them nothing back, so the
 * whole exercise felt like it went into a hole.
 *
 * This reads the picks straight back: the genres that dominated, the era, films
 * versus series, and how much of it you had already seen. Two rules keep it
 * from becoming a horoscope:
 *
 *  1. IT ONLY CLAIMS WHAT THE PICKS SUPPORT. A pattern needs a real share of
 *     the picks AND more than one title behind it. Three taps do not produce a
 *     personality; the copy says so instead of inventing one.
 *  2. IT NEVER SPEAKS FOR WHAT WAS NOT TAPPED. A genre absent from the picks is
 *     absent from the read-back — it is not "something you avoid", because
 *     leaving a card alone was explicitly defined as recording nothing.
 *
 * Pure. No I/O, no clock — the current year is a parameter.
 */

export type PickKind = 'like' | 'seen' | 'not_interested';

export interface AnalysedPick {
  title: string;
  year: number | null;
  mediaType: 'movie' | 'tv';
  /** Genre slug from the calibration pool. May be absent. */
  genre: string | null;
  kind: PickKind;
  /** Only for `seen`. */
  rating?: 'loved' | 'liked' | 'okay' | 'disliked';
}

/** Below this, we describe the picks but decline to describe the person. */
export const MIN_FOR_PATTERN = 5;
/** A genre has to carry at least this share of the picks to be called a lean. */
export const LEAN_SHARE = 0.3;
/** …and this many titles, so one lucky tap is never a trend. */
export const LEAN_COUNT = 2;

export interface PickFact {
  key: string;
  label: string;
  detail: string;
}

export interface PickAnalysis {
  total: number;
  /** True once there is enough to describe a pattern rather than a list. */
  enough: boolean;
  headline: string;
  facts: PickFact[];
  /** Genre slugs that carried the picks, strongest first. */
  leadingGenres: string[];
  /** Honest limit on what any of this means. Always present. */
  caveat: string;
}

const GENRE_LABELS: Record<string, string> = {
  drama: 'drama',
  comedy: 'comedy',
  crime: 'crime',
  thriller: 'thrillers',
  mystery: 'mystery',
  action: 'action',
  scifi: 'science fiction',
  horror: 'horror',
  romance: 'romance',
  fantasy: 'fantasy',
  animation: 'animation',
  documentary: 'documentary',
  family: 'family',
  reality: 'reality TV',
  soap: 'soaps',
};

function label(slug: string): string {
  return GENRE_LABELS[slug] ?? slug.replace(/_/g, ' ');
}

function list(parts: string[]): string {
  if (parts.length === 0) return '';
  if (parts.length === 1) return parts[0]!;
  return `${parts.slice(0, -1).join(', ')} and ${parts[parts.length - 1]}`;
}

export function analysePicks(picks: readonly AnalysedPick[], currentYear: number): PickAnalysis {
  const total = picks.length;
  const caveat =
    'Built only from what you tapped. Anything you left alone counted for nothing — it is not recorded as a dislike.';

  if (total === 0) {
    return { total: 0, enough: false, headline: 'Nothing to read yet.', facts: [], leadingGenres: [], caveat };
  }

  // "Doesn't look good" is a real, chosen negative — unlike an untouched tile,
  // it is honest evidence. But it is evidence of what to AVOID, not what to
  // reach for, so it is kept out of the genre/era/shape leans below (which
  // describe taste, not avoidance) and reported as its own fact instead.
  const passed = picks.filter((p) => p.kind === 'not_interested');
  const positive = picks.filter((p) => p.kind !== 'not_interested');

  // ── Genres ────────────────────────────────────────────────────────────────
  const byGenre = new Map<string, number>();
  for (const p of positive) {
    if (!p.genre) continue;
    byGenre.set(p.genre, (byGenre.get(p.genre) ?? 0) + 1);
  }
  const ranked = Array.from(byGenre.entries()).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
  const leadingGenres =
    positive.length > 0
      ? ranked
          .filter(([, n]) => n >= LEAN_COUNT && n / positive.length >= LEAN_SHARE)
          .slice(0, 3)
          .map(([g]) => g)
      : [];

  // ── Era ───────────────────────────────────────────────────────────────────
  const years = positive.map((p) => p.year).filter((y): y is number => typeof y === 'number' && y > 1900);
  const recent = years.filter((y) => currentYear - y <= 10).length;
  const old = years.filter((y) => currentYear - y >= 25).length;

  // ── Shape ─────────────────────────────────────────────────────────────────
  const movies = positive.filter((p) => p.mediaType === 'movie').length;
  const shows = positive.length - movies;
  const seen = positive.filter((p) => p.kind === 'seen');
  const loved = seen.filter((p) => p.rating === 'loved' || p.rating === 'liked').length;

  const facts: PickFact[] = [];

  if (leadingGenres.length > 0) {
    facts.push({
      key: 'genres',
      label: 'What you reached for',
      detail: `Mostly ${list(leadingGenres.map(label))}.`,
    });
  } else if (byGenre.size > 2) {
    facts.push({
      key: 'genres',
      label: 'What you reached for',
      detail: `Spread across ${byGenre.size} different genres — no single lane.`,
    });
  }

  if (years.length >= 3) {
    if (recent / years.length >= 0.6) {
      facts.push({ key: 'era', label: 'Era', detail: 'Almost all from the last decade.' });
    } else if (old / years.length >= 0.4) {
      facts.push({ key: 'era', label: 'Era', detail: 'A real appetite for older titles, not just what is new.' });
    } else {
      facts.push({ key: 'era', label: 'Era', detail: 'A mix of new and old.' });
    }
  }

  if (movies > 0 && shows > 0) {
    const lean = movies > shows * 2 ? 'Films far more than series.' : shows > movies * 2 ? 'Series far more than films.' : 'Films and series about evenly.';
    facts.push({ key: 'shape', label: 'Films or series', detail: lean });
  } else if (movies > 0) {
    facts.push({ key: 'shape', label: 'Films or series', detail: 'Films only.' });
  } else if (shows > 0) {
    facts.push({ key: 'shape', label: 'Films or series', detail: 'Series only.' });
  }

  if (seen.length > 0) {
    facts.push({
      key: 'seen',
      label: 'Already seen',
      detail:
        loved > 0
          ? `${seen.length} you had seen, ${loved} of which you rated well — that is the strongest evidence here.`
          : `${seen.length} you had already seen.`,
    });
  }

  if (passed.length > 0) {
    facts.push({
      key: 'passed',
      label: 'Not for you',
      detail: `${passed.length} ${passed.length === 1 ? 'title' : 'titles'} you said didn't look good — that counts too, as what to steer away from.`,
    });
  }

  // ── Headline ──────────────────────────────────────────────────────────────
  // Gated on POSITIVE picks: a round that is all "doesn't look good" is real,
  // recorded signal, but it describes what to avoid, not a taste to name.
  const enough = positive.length >= MIN_FOR_PATTERN;
  let headline: string;
  if (!enough) {
    headline = `${total} ${total === 1 ? 'pick' : 'picks'} — enough to start, not enough to describe you yet.`;
  } else if (leadingGenres.length > 0) {
    headline = `You went for ${list(leadingGenres.map(label))}.`;
  } else {
    headline = 'Your picks range widely — no single genre carried them.';
  }

  return { total, enough, headline, facts, leadingGenres, caveat };
}
