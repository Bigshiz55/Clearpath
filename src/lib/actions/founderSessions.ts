'use server';

import { z } from 'zod';
import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { serverEnv } from '@/lib/env';
import { resolveFounderAccess, founderByKey, type FounderKey, type AccessConfig } from '@/lib/founder/access';
import { createSession, refreshSession, archiveSession, renameSession, listSessions } from '@/lib/founder/sessions';
import { defaultSessionName, sanitizeSessionName } from '@/lib/founder/sessionModel';

/**
 * Server actions for founder test-session management. EVERY action re-verifies
 * founder-route access server-side (never trusts the client): a founder may only
 * ever touch their OWN founder's sessions; an admin may act on any founder's for
 * support. This is the same gate the route uses, enforced again at the mutation.
 */

const founderEnum = z.enum(['scott', 'heather', 'amy']);

type Ctx = { userId: string; email: string | null };

async function authorize(founder: FounderKey): Promise<{ ok: true; ctx: Ctx } | { ok: false; error: string }> {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const email = user?.email ?? null;
  const cfg: AccessConfig = {
    founderEmails: serverEnv.founderEmails(),
    adminEmails: serverEnv.adminEmails(),
  };
  const access = resolveFounderAccess(email, founder, cfg);
  if (!access.allowed || !user) {
    return { ok: false, error: 'Not authorized for this founder environment.' };
  }
  return { ok: true, ctx: { userId: user.id, email } };
}

function revalidate(founder: FounderKey) {
  revalidatePath(founderByKey(founder).route);
}

const createSchema = z.object({ founder: founderEnum, name: z.string().max(80).optional() });
export async function createFounderSession(input: z.infer<typeof createSchema>): Promise<{ ok: boolean; error?: string }> {
  const parsed = createSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: 'Invalid input.' };
  const { founder, name } = parsed.data;

  const auth = await authorize(founder);
  if (!auth.ok) return { ok: false, error: auth.error };

  const supabase = createClient();
  const existing = await listSessions(supabase, auth.ctx.userId, founder);
  const fallback = defaultSessionName(existing.length, Date.now());
  const finalName = sanitizeSessionName(name ?? '', fallback);

  const created = await createSession(supabase, auth.ctx.userId, founder, finalName);
  if (!created) return { ok: false, error: 'Could not create session (is the migration applied?).' };
  revalidate(founder);
  return { ok: true };
}

const refreshSchema = z.object({ founder: founderEnum, name: z.string().max(80).optional() });
export async function refreshFounderSession(input: z.infer<typeof refreshSchema>): Promise<{ ok: boolean; error?: string }> {
  const parsed = refreshSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: 'Invalid input.' };
  const { founder, name } = parsed.data;

  const auth = await authorize(founder);
  if (!auth.ok) return { ok: false, error: auth.error };

  const supabase = createClient();
  const existing = await listSessions(supabase, auth.ctx.userId, founder);
  const fallback = defaultSessionName(existing.length, Date.now());
  const finalName = sanitizeSessionName(name ?? '', fallback);

  const created = await refreshSession(supabase, auth.ctx.userId, founder, finalName);
  if (!created) return { ok: false, error: 'Could not refresh (is the migration applied?).' };
  revalidate(founder);
  return { ok: true };
}

const idSchema = z.object({ founder: founderEnum, id: z.string().min(3).max(80) });
export async function archiveFounderSession(input: z.infer<typeof idSchema>): Promise<{ ok: boolean; error?: string }> {
  const parsed = idSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: 'Invalid input.' };
  const { founder, id } = parsed.data;

  const auth = await authorize(founder);
  if (!auth.ok) return { ok: false, error: auth.error };

  const supabase = createClient();
  const ok = await archiveSession(supabase, auth.ctx.userId, id);
  if (ok) revalidate(founder);
  return { ok };
}

const renameSchema = z.object({ founder: founderEnum, id: z.string().min(3).max(80), name: z.string().max(80) });
export async function renameFounderSession(input: z.infer<typeof renameSchema>): Promise<{ ok: boolean; error?: string }> {
  const parsed = renameSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: 'Invalid input.' };
  const { founder, id, name } = parsed.data;

  const auth = await authorize(founder);
  if (!auth.ok) return { ok: false, error: auth.error };

  const finalName = sanitizeSessionName(name, 'Session');
  const supabase = createClient();
  const ok = await renameSession(supabase, auth.ctx.userId, id, finalName);
  if (ok) revalidate(founder);
  return { ok };
}
