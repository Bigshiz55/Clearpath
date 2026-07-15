// "Will you finish it?" — the honest version of a Regret Predictor. It shows the
// user's OWN measured completion behavior (a fact, not a guess) alongside this
// title's real risk factors, and never invents a precise percentage. Pure logic
// lives here (testable); the count query takes a caller-provided client.
import type { SupabaseClient } from '@supabase/supabase-js';

export interface FinishProfile {
  finished: number;
  abandoned: number;
  /** watched / (watched + dropped); null when there's too little history. */
  finishRate: number | null;
  sample: number;
}

const MIN_SAMPLE = 5;

/** The user's real finish behavior from their watchlist (watched vs dropped). */
export async function getFinishProfile(supabase: SupabaseClient, userId: string): Promise<FinishProfile> {
  if (!userId) return { finished: 0, abandoned: 0, finishRate: null, sample: 0 };
  const { data } = await supabase
    .from('watchlist_items')
    .select('status')
    .eq('user_id', userId)
    .in('status', ['watched', 'dropped']);
  const rows = data ?? [];
  const finished = rows.filter((r) => r.status === 'watched').length;
  const abandoned = rows.filter((r) => r.status === 'dropped').length;
  const sample = finished + abandoned;
  const finishRate = sample >= MIN_SAMPLE ? finished / sample : null;
  return { finished, abandoned, finishRate, sample };
}

export interface TitleRiskInput {
  long: boolean;
  longRunningTv: boolean;
  subtitleOnly: boolean;
  runtimeMinutes: number | null;
  seasons: number | null;
}

export interface RiskAssessment {
  level: 'low' | 'medium' | 'high' | 'unknown';
  headline: string;
  note: string;
  factors: string[];
}

function runtimeLabel(min: number): string {
  const h = Math.floor(min / 60);
  const m = min % 60;
  return h > 0 ? `a ${h}h ${m}m runtime` : `a ${m}-minute runtime`;
}

/**
 * Combine the user's measured finish behavior with this title's real risk
 * factors into an honest "will you finish it?" read. Everything shown is either
 * the user's own history or a fact about the title — nothing is predicted out
 * of thin air.
 */
export function assessTitleRisk(input: TitleRiskInput, profile: FinishProfile): RiskAssessment {
  const factors: string[] = [];
  if (input.long && input.runtimeMinutes) factors.push(runtimeLabel(input.runtimeMinutes));
  if (input.longRunningTv && input.seasons) factors.push(`a ${input.seasons}-season commitment`);
  if (input.subtitleOnly) factors.push('subtitles only — no English dub');

  if (profile.finishRate == null && factors.length === 0) {
    return { level: 'unknown', headline: '', note: '', factors: [] };
  }

  // Ordinal risk: base on the user's finish rate, then raise for risk factors.
  let ord: number;
  if (profile.finishRate == null) {
    ord = factors.length >= 2 ? 1 : 0;
  } else if (profile.finishRate >= 0.8) ord = 0;
  else if (profile.finishRate >= 0.6) ord = 1;
  else ord = 2;
  if (profile.finishRate != null && factors.length > 0) ord = Math.min(2, ord + (factors.length >= 2 ? 2 : 1));

  const level = (['low', 'medium', 'high'] as const)[ord]!;
  const headline =
    level === 'low'
      ? 'You’ll probably finish this'
      : level === 'medium'
        ? 'You might not finish this one'
        : 'You tend to bail on ones like this';

  let note: string;
  if (profile.finishRate != null) {
    const pct = Math.round(profile.finishRate * 100);
    note = `You finish ${pct}% of what you start (${profile.finished} of ${profile.sample}).`;
    if (factors.length > 0) note += ` This one brings ${factors.join(', ')}.`;
  } else {
    note = `This one brings ${factors.join(', ')}. Rate a few more finishes and abandons and this gets personal.`;
  }

  return { level, headline, note, factors };
}
