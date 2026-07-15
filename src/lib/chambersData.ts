import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import {
  EMPTY_COUNTS,
  consecutiveWeeks,
  weekIndex,
  type ChambersCounts,
} from '@/lib/chambers';
import { humanTrait } from '@/lib/scoring/traits';
import type { PreferenceTrait, VerdictTier } from '@/lib/types';

export interface ChambersDnaDim {
  key: string;
  label: string;
  value: number; // 0..100 for the bar
  caption: string; // always states its own sample size
}

export interface ChambersData {
  counts: ChambersCounts;
  mix: { watch: number; maybe: number; skip: number };
  topLove: string | null;
  loves: string[];
  avoids: string[];
  dna: ChambersDnaDim[];
}

/** A tier maps to one of the three headline calls. */
function bucketOf(tier: string): 'watch' | 'maybe' | 'skip' {
  const t = tier as VerdictTier;
  if (t === 'Must Watch' || t === 'Strong Watch' || t === 'Worth Watching') return 'watch';
  if (t === 'Skip' || t === 'Low Priority') return t === 'Skip' ? 'skip' : 'maybe';
  return 'maybe';
}

// A missing optional table (0007 follows / 0009 title_feedback) must never 500
// the page — the honour just isn't computed yet.
function isMissing(err: { code?: string; message?: string } | null): boolean {
  if (!err) return false;
  return err.code === '42P01' || err.code === '42883' || /does not exist|relation .* does not/i.test(err.message ?? '');
}

/** Aggregate the signed-in user's own rows into the Chambers view model.
 *  Everything here is a real count; nothing is invented. */
export async function getChambersData(supabase: SupabaseClient, userId: string, nowMs: number): Promise<ChambersData> {
  const counts: ChambersCounts = { ...EMPTY_COUNTS };
  const mix = { watch: 0, maybe: 0, skip: 0 };
  const activeWeeks = new Set<number>();

  // --- Watchlist items: ratings, docket, finishes, decades, activity. --------
  const { data: items } = await supabase
    .from('watchlist_items')
    .select('status, rating, year, added_at, watched_at')
    .eq('user_id', userId);

  const decades = new Set<number>();
  for (const it of items ?? []) {
    const row = it as { status: string; rating: number | null; year: number | null; added_at: string | null; watched_at: string | null };
    if (row.rating != null) {
      counts.rated++;
      if (row.year) decades.add(Math.floor(row.year / 10));
    }
    if (row.status === 'watched') counts.finished++;
    else if (row.status === 'strict' || row.status === 'possible' || row.status === 'watching' || row.status === 'paused') {
      counts.onDocket++;
    }
    for (const ts of [row.watched_at, row.added_at]) {
      if (ts) activeWeeks.add(weekIndex(Date.parse(ts)));
    }
  }
  counts.decades = decades.size;

  // --- Verdicts: count + tier mix + activity. --------------------------------
  const { data: verdicts } = await supabase
    .from('verdicts')
    .select('tier, created_at')
    .eq('user_id', userId);
  for (const v of verdicts ?? []) {
    const row = v as { tier: string; created_at: string | null };
    counts.verdicts++;
    mix[bucketOf(row.tier)]++;
    if (row.created_at) activeWeeks.add(weekIndex(Date.parse(row.created_at)));
  }

  // --- Post-watch interviews (0009): reviews + pacing/ending DNA. -------------
  const dna: ChambersDnaDim[] = [];
  const fb = await supabase
    .from('title_feedback')
    .select('disposition, answers, created_at')
    .eq('user_id', userId);
  if (!isMissing(fb.error)) {
    const pacing = { drag: 0, base: 0 };
    const ending = { good: 0, base: 0 };
    for (const f of fb.data ?? []) {
      const row = f as { disposition: string | null; answers: Record<string, string> | null; created_at: string | null };
      counts.reviews++;
      if (row.created_at) activeWeeks.add(weekIndex(Date.parse(row.created_at)));
      const a = row.answers ?? {};
      if (row.disposition === 'abandoned' || a.pacing) {
        pacing.base++;
        if (a.why_stopped === 'too_slow' || a.pacing === 'yes') pacing.drag++;
        else if (a.pacing === 'somewhat') pacing.drag += 0.5;
      }
      if (a.ending) {
        ending.base++;
        if (a.ending === 'yes') ending.good++;
        else if (a.ending === 'somewhat') ending.good += 0.5;
      }
    }
    if (pacing.base > 0) {
      const value = Math.round((100 * pacing.drag) / pacing.base);
      dna.push({ key: 'pacing', label: 'Patience for slow burns', value: 100 - value, caption: `${value}% of the time you felt it dragged (${pacing.base} ${pacing.base === 1 ? 'review' : 'reviews'})` });
    }
    if (ending.base > 0) {
      const value = Math.round((100 * ending.good) / ending.base);
      dna.push({ key: 'ending', label: 'Endings landed for you', value, caption: `${value}% of endings satisfied you (${ending.base})` });
    }
  }

  // --- Verdict mix as a DNA dimension (always honest, sample size shown). -----
  const calls = mix.watch + mix.maybe + mix.skip;
  if (calls > 0) {
    const watchPct = Math.round((100 * mix.watch) / calls);
    dna.push({ key: 'appetite', label: 'Says “watch it”', value: watchPct, caption: `${watchPct}% of your ${calls} verdicts were a watch (${mix.skip} skips)` });
  }

  // --- Preference traits: loves / avoids + the top love for the title. -------
  const loves: string[] = [];
  const avoids: string[] = [];
  let topLove: string | null = null;
  let topLoveWeight = 0;
  const { data: rules } = await supabase
    .from('preference_rules')
    .select('trait, weight')
    .eq('user_id', userId);
  for (const r of rules ?? []) {
    const row = r as { trait: string; weight: number };
    const label = humanTrait(row.trait as PreferenceTrait);
    if (row.weight > 0) {
      loves.push(label);
      if (row.weight > topLoveWeight) {
        topLoveWeight = row.weight;
        topLove = label;
      }
    } else if (row.weight < 0) {
      avoids.push(label);
    }
  }

  // --- Social (0007). Optional. ----------------------------------------------
  const followers = await supabase.from('follows').select('*', { count: 'exact', head: true }).eq('following_id', userId);
  if (!isMissing(followers.error)) counts.followers = followers.count ?? 0;
  const following = await supabase.from('follows').select('*', { count: 'exact', head: true }).eq('follower_id', userId);
  if (!isMissing(following.error)) counts.following = following.count ?? 0;

  counts.streakWeeks = consecutiveWeeks(activeWeeks, weekIndex(nowMs));

  return { counts, mix, topLove, loves, avoids, dna };
}
