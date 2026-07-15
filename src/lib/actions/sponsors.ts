'use server';

import { z } from 'zod';
import { createClient } from '@/lib/supabase/server';

export interface ClaimResult {
  ok: boolean;
  code?: string;
  url?: string;
  error?: string;
}

/**
 * Record a coupon claim (the conversion a sponsor pays for) and reveal the code.
 * Gating the reveal behind this call is what makes claims countable. Does not
 * touch anything about recommendations.
 */
export async function claimSettlement(sponsorId: string): Promise<ClaimResult> {
  if (!z.string().uuid().safeParse(sponsorId).success) return { ok: false, error: 'Invalid sponsor.' };
  try {
    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    const { data: sponsor, error } = await supabase
      .from('sponsors')
      .select('id, discount_code, cta_url, active')
      .eq('id', sponsorId)
      .maybeSingle();
    if (error) {
      if (error.code === '42P01' || /sponsors/.test(error.message)) {
        return { ok: false, error: 'Sponsors need migration 0011 applied first.' };
      }
      return { ok: false, error: error.message };
    }
    if (!sponsor || sponsor.active !== true) return { ok: false, error: 'That offer isn’t available.' };

    await supabase
      .from('sponsor_events')
      .insert({ sponsor_id: sponsorId, user_id: user?.id ?? null, kind: 'claim' })
      .then(() => undefined, () => undefined);

    return {
      ok: true,
      code: (sponsor.discount_code as string | null) ?? undefined,
      url: (sponsor.cta_url as string | null) ?? undefined,
    };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Failed.' };
  }
}
