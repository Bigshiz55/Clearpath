'use server';

import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { serverEnv } from '@/lib/env';
import { getEntitlement, grantPro, revokePro, type Entitlement } from '@/lib/pro';

export interface CheckoutResult {
  status: 'coming_soon' | 'redirect' | 'error';
  url?: string;
  message?: string;
}

/**
 * Begin a Pro upgrade. Processor-agnostic seam: today it returns `coming_soon`
 * because no processor is wired. To go live, create a checkout session here
 * (Stripe/Lemon Squeezy/…) and return `{ status: 'redirect', url }`; the
 * processor's webhook then calls `grantPro()` to flip the entitlement.
 */
export async function startProCheckout(): Promise<CheckoutResult> {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { status: 'error', message: 'Sign in to upgrade.' };

  // ── Processor integration goes here ──────────────────────────────────────
  // e.g. const session = await stripe.checkout.sessions.create({ … , client_reference_id: user.id });
  //      return { status: 'redirect', url: session.url };
  return {
    status: 'coming_soon',
    message: 'Pro is almost here — checkout isn’t live yet. Thanks for the interest!',
  };
}

/** The signed-in user's current entitlement (for the upgrade page UI). */
export async function myEntitlement(): Promise<Entitlement> {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { pro: false, source: null, currentPeriodEnd: null };
  return getEntitlement(supabase, user.id);
}

/**
 * Admin-only manual Pro toggle — lets you QA the gated features before a
 * processor is wired. Gated to ADMIN_EMAILS; a no-op for everyone else.
 */
export async function toggleProForTesting(): Promise<{ ok: boolean; pro?: boolean; error?: string }> {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: 'Sign in first.' };
  const admins = serverEnv.adminEmails();
  if (!user.email || !admins.includes(user.email.toLowerCase())) {
    return { ok: false, error: 'Admins only.' };
  }
  const current = await getEntitlement(supabase, user.id);
  const res = current.pro ? await revokePro(user.id) : await grantPro(user.id, 'manual');
  if (!res.ok) return { ok: false, error: res.error };
  revalidatePath('/app/pro');
  return { ok: true, pro: !current.pro };
}
