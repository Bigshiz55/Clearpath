// The Critics' Table — a multi-perspective "panel" that argues about a title.
// PURE and DETERMINISTIC: every panelist's stance and line is derived from real
// data already in the verdict report (scores, genres, runtime, critic/audience
// numbers). No fabrication, and it NEVER changes the computed verdict — it only
// discusses it. Optional AI phrasing (see /api/swarm) rewrites these takes in
// voice, constrained to these same facts.
import type { VerdictReport } from '@/lib/types';

export type Stance = 'love' | 'mixed' | 'pass';

export interface Panelist {
  key: string;
  name: string;
  emoji: string;
  stance: Stance;
  /** The take, grounded in a real datapoint. */
  line: string;
  /** Short "receipt" — the data the take is based on. */
  basis: string;
}

export interface Panel {
  panelists: Panelist[];
  /** Tally for a one-line "the room split …" summary. */
  lean: { love: number; mixed: number; pass: number };
}

function sourceVal(report: VerdictReport, name: string): number | null {
  const s = report.general.sources.find((x) => x.name === name && x.available);
  return s && s.value != null ? s.value : null;
}
function hasGenre(genres: string[], names: string[]): string | null {
  const lower = genres.map((g) => g.toLowerCase());
  for (const n of names) if (lower.includes(n)) return n;
  return null;
}
function tally(panelists: Panelist[]): Panel['lean'] {
  return panelists.reduce(
    (acc, p) => ({ ...acc, [p.stance]: acc[p.stance] + 1 }),
    { love: 0, mixed: 0, pass: 0 },
  );
}

function actionJunkie(report: VerdictReport): Panelist {
  const g = hasGenre(report.title.genres, ['action', 'thriller', 'adventure', 'crime', 'war', 'science fiction']);
  const eng = report.general.breakdown.engagement;
  let stance: Stance;
  let line: string;
  if (g && eng >= 62) {
    stance = 'love';
    line = `A ${g} with an engagement read of ${eng}? Sign me up — this moves.`;
  } else if (g || eng >= 55) {
    stance = 'mixed';
    line = g
      ? `It's a ${g}, but engagement's only ${eng}. Could be a slow burn dressed as a thrill ride.`
      : `Engagement's ${eng}, but there's no real action genre here. I'll be checking my phone.`;
  } else {
    stance = 'pass';
    line = `No action, no thriller, engagement sitting at ${eng}. Not my night.`;
  }
  return { key: 'action', name: 'The Action Junkie', emoji: '🔥', stance, line, basis: `genre + engagement ${eng}` };
}

function pacingCritic(report: VerdictReport): Panelist {
  const watch = report.general.breakdown.watchability;
  const t = report.title;
  let stance: Stance;
  let line: string;
  let basis: string;
  if (t.mediaType === 'movie') {
    const rt = t.runtimeMinutes;
    basis = `runtime ${rt ?? '?'}m · watchability ${watch}`;
    if (rt && rt >= 150) {
      stance = watch >= 65 ? 'mixed' : 'pass';
      line = `${rt} minutes. It had better earn every one — watchability's ${watch}.`;
    } else if (rt && rt <= 105) {
      stance = 'love';
      line = `A tight ${rt} minutes — no fat on it. This is how you respect my evening.`;
    } else {
      stance = watch >= 60 ? 'love' : 'mixed';
      line = `${rt ?? 'An unclear'} runtime, watchability ${watch}. Reasonable ask for one sitting.`;
    }
  } else {
    const seasons = t.numberOfSeasons ?? null;
    basis = `${seasons ?? '?'} seasons · watchability ${watch}`;
    if (seasons && seasons >= 5) {
      stance = 'pass';
      line = `${seasons} seasons is a relationship, not a movie night. That's a big commitment.`;
    } else if (seasons && seasons <= 2) {
      stance = 'love';
      line = `Only ${seasons} season${seasons === 1 ? '' : 's'} — bingeable without wrecking your week.`;
    } else {
      stance = 'mixed';
      line = `${seasons ?? 'Several'} seasons. Doable, but know what you're signing up for.`;
    }
  }
  return { key: 'pacing', name: 'The Pacing Critic', emoji: '⏱️', stance, line, basis };
}

function indieSnob(report: VerdictReport): Panelist {
  const critic = sourceVal(report, 'Rotten Tomatoes') ?? sourceVal(report, 'Metacritic');
  const audience = sourceVal(report, 'TMDB Audience') ?? sourceVal(report, 'IMDb');
  const prestige = hasGenre(report.title.genres, ['drama', 'history', 'documentary']);
  let stance: Stance;
  let line: string;
  if (critic != null && audience != null) {
    const gap = Math.round(critic - audience);
    if (gap >= 8) {
      stance = 'love';
      line = `Critics at ${critic}, crowd at ${audience}. The masses just don't get it — I do.`;
    } else if (gap <= -10) {
      stance = 'pass';
      line = `Audience ${audience}, critics only ${critic}. Popcorn consensus. Hard pass.`;
    } else {
      stance = prestige ? 'mixed' : 'pass';
      line = `Critics ${critic}, audience ${audience} — safe, agreeable, forgettable.`;
    }
  } else if (prestige) {
    stance = 'mixed';
    line = `No critic aggregate to hide behind, but the ${prestige} pedigree buys it a look.`;
  } else {
    stance = 'pass';
    line = `No critical footprint and no prestige genre. Why are we even here?`;
  }
  return { key: 'indie', name: 'The Indie Snob', emoji: '🎩', stance, line, basis: `critic ${critic ?? '—'} vs audience ${audience ?? '—'}` };
}

function visualAesthete(report: VerdictReport): Panelist {
  const spectacle = hasGenre(report.title.genres, ['science fiction', 'fantasy', 'adventure', 'animation', 'action']);
  const prod = report.general.breakdown.production;
  const qual = report.general.breakdown.quality;
  let stance: Stance;
  let line: string;
  if (spectacle && prod >= 60) {
    stance = 'love';
    line = `A ${spectacle} with a production read of ${prod} — this was built for the big picture.`;
  } else if (qual >= 66) {
    stance = 'mixed';
    line = `Craft's there (quality ${qual}), but nothing here screams visually essential.`;
  } else {
    stance = 'pass';
    line = `Production ${prod}, quality ${qual}. I'm not seeing a frame worth pausing on.`;
  }
  return { key: 'visual', name: 'The Visual Aesthete', emoji: '🎨', stance, line, basis: `production ${prod} · quality ${qual}` };
}

/** Build the deterministic panel from a verdict report. */
export function buildPanel(report: VerdictReport): Panel {
  const panelists = [actionJunkie(report), pacingCritic(report), indieSnob(report), visualAesthete(report)];
  return { panelists, lean: tally(panelists) };
}
