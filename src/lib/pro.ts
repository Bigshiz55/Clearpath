import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import { createAdminClient } from '@/lib/supabase/admin';

/**
 * Pro entitlement reads (server-only). The `entitlements` table is the single
 * source of truth; a payment processor writes it, the app reads it. Everything
 * degrades to "not Pro" if the table is missing or anything errors, so gating
 * never breaks the app.
 */

export interface Entitlement {
  pro: boolean;
  source: string | null;
  currentPeriodEnd: string | null;
}

const NONE: Entitlement = { pro: false, source: null, currentPeriodEnd: null };

/** Full entitlement for a user (never throws). */
export async function getEntitlement(supabase: SupabaseClient, userId: string): Promise<Entitlement> {
  if (!userId) return NONE;
  try {
    const { data, error } = await supabase
      .from('entitlements')
      .select('pro, source, current_period_end')
      .eq('user_id', userId)
      .maybeSingle();
    if (error || !data) return NONE;
    const end = (data.current_period_end as string | null) ?? null;
    const active = !end || Date.parse(end) > Date.now();
    return {
      pro: Boolean(data.pro) && active,
      source: (data.source as string | null) ?? null,
      currentPeriodEnd: end,
    };
  } catch {
    return NONE;
  }
}

/** True when the user currently has an active Pro entitlement. */
export async function isPro(supabase: SupabaseClient, userId: string): Promise<boolean> {
  return (await getEntitlement(supabase, userId)).pro;
}

/**
 * Grant (or refresh) Pro for a user — used by a processor webhook or an admin
 * action. Writes via the service role. `currentPeriodEnd` null = no expiry.
 */
export async function grantPro(
  userId: string,
  source: string,
  currentPeriodEnd: string | null = null,
): Promise<{ ok: boolean; error?: string }> {
  try {
    const admin = createAdminClient();
    const { error } = await admin
      .from('entitlements')
      .upsert({ user_id: userId, pro: true, source, current_period_end: currentPeriodEnd, updated_at: new Date().toISOString() });
    if (error) return { ok: false, error: error.message };
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Failed to grant Pro.' };
  }
}

/** Revoke Pro (cancellation / refund webhook, or admin). */
export async function revokePro(userId: string): Promise<{ ok: boolean; error?: string }> {
  try {
    const admin = createAdminClient();
    const { error } = await admin
      .from('entitlements')
      .upsert({ user_id: userId, pro: false, source: 'revoked', updated_at: new Date().toISOString() });
    if (error) return { ok: false, error: error.message };
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Failed to revoke Pro.' };
  }
}
