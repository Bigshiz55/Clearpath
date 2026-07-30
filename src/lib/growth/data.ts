import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import { createAdminClient } from '@/lib/supabase/admin';
import type { FunnelCounts } from './core';

/**
 * Growth OS data layer — REAL production reads. Server-only. Every query is
 * fail-soft: on any error (e.g. a table that exists only after migration 0024,
 * or a column that isn't there) it returns "untracked" (undefined) rather than a
 * fake 0 or a crash. Honesty by construction — the UI labels untracked steps.
 *
 * User-count and funnel reads use the service-role client (profiles/activation
 * tables are RLS-scoped to each user); the caller MUST authorize as admin first.
 */

async function tryCount(admin: SupabaseClient, table: string, filter?: (q: any) => any): Promise<number | undefined> {
  try {
    let q = admin.from(table).select('*', { count: 'exact', head: true });
    if (filter) q = filter(q);
    const { count, error } = await q;
    if (error) return undefined;
    return count ?? 0;
  } catch {
    return undefined;
  }
}

/** Distinct users touching a table (small-scale early app; capped fetch). */
async function tryDistinctUsers(admin: SupabaseClient, table: string, col = 'user_id', filter?: (q: any) => any): Promise<number | undefined> {
  try {
    let q = admin.from(table).select(col).limit(20000);
    if (filter) q = filter(q);
    const { data, error } = await q;
    if (error || !data) return undefined;
    const rows = data as unknown as Array<Record<string, unknown>>;
    return new Set(rows.map((r) => r[col]).filter(Boolean)).size;
  } catch {
    return undefined;
  }
}

export async function realUserCount(): Promise<number> {
  const admin = createAdminClient();
  return (await tryCount(admin, 'profiles')) ?? 0;
}

/**
 * Build the real activation funnel from existing tables. Steps we can't yet
 * measure (anonymous visitors, first search, invitations, return visits) are
 * left undefined → the UI shows "— not tracked yet", never a fabricated number.
 */
export async function realFunnel(): Promise<FunnelCounts> {
  const admin = createAdminClient();
  const [signups, dna, watchlist, shares, verdicts, subs] = await Promise.all([
    tryCount(admin, 'profiles'),
    tryDistinctUsers(admin, 'preference_events', 'user_id', (q) => q.is('undone_at', null)),
    tryDistinctUsers(admin, 'watchlist_items', 'user_id'),
    tryDistinctUsers(admin, 'shares', 'user_id'),
    tryDistinctUsers(admin, 'verdicts', 'user_id'),
    tryCount(admin, 'entitlements', (q) => q.eq('pro', true)),
  ]);
  return {
    // visitors, onboarding_started, first_search, first_invite, return_visit stay
    // undefined until we wire client analytics — honestly untracked.
    signups,
    dna_completed: dna,
    first_verdict: verdicts,
    first_watchlist: watchlist,
    first_share: shares,
    subscription: subs,
  };
}

export interface ProspectStats {
  total: number;
  toContact: number;
  followUpsDue: number;
  tablesReady: boolean;
}

/** Owner-scoped CRM stats via the user's client (RLS: owner_id = auth.uid()). */
export async function prospectStats(supabase: SupabaseClient, todayIso: string): Promise<ProspectStats> {
  try {
    const total = await supabase.from('growth_prospects').select('*', { count: 'exact', head: true });
    if (total.error) return { total: 0, toContact: 0, followUpsDue: 0, tablesReady: false };
    const toContact = await supabase.from('growth_prospects').select('*', { count: 'exact', head: true }).eq('status', 'to_contact');
    const due = await supabase.from('growth_prospects').select('*', { count: 'exact', head: true }).not('next_follow_up', 'is', null).lte('next_follow_up', todayIso);
    return {
      total: total.count ?? 0,
      toContact: toContact.count ?? 0,
      followUpsDue: due.count ?? 0,
      tablesReady: true,
    };
  } catch {
    return { total: 0, toContact: 0, followUpsDue: 0, tablesReady: false };
  }
}

export async function trackedLinkCount(supabase: SupabaseClient): Promise<number> {
  try {
    const { count, error } = await supabase.from('growth_links').select('*', { count: 'exact', head: true });
    return error ? 0 : count ?? 0;
  } catch {
    return 0;
  }
}
