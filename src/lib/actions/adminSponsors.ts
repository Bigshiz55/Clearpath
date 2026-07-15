'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { isAdminEmail } from '@/lib/admin';

export interface AdminSponsor {
  id: string;
  name: string;
  judgeName: string;
  tagline: string | null;
  emoji: string | null;
  accent: string | null;
  ctaLabel: string | null;
  ctaUrl: string | null;
  discountCode: string | null;
  discountLabel: string | null;
  scope: 'national' | 'region' | 'local';
  region: string | null;
  lat: number | null;
  lng: number | null;
  radiusKm: number | null;
  active: boolean;
  claims: number;
}

async function requireAdmin() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user || !isAdminEmail(user.email)) throw new Error('Not authorized.');
  return user;
}

function missingTable(err: { code?: string; message?: string }): boolean {
  return err.code === '42P01' || /sponsors/.test(err.message ?? '');
}

const sponsorSchema = z.object({
  id: z.string().uuid().optional(),
  name: z.string().min(1).max(80),
  judgeName: z.string().min(1).max(80),
  tagline: z.string().max(160).nullish(),
  emoji: z.string().max(8).nullish(),
  accent: z.string().regex(/^#[0-9a-fA-F]{6}$/, 'Accent must be a hex color like #e11d48').nullish().or(z.literal('')),
  ctaLabel: z.string().max(40).nullish(),
  ctaUrl: z.string().url().max(300).nullish().or(z.literal('')),
  discountCode: z.string().max(40).nullish(),
  discountLabel: z.string().max(80).nullish(),
  scope: z.enum(['national', 'region', 'local']),
  region: z.string().max(2).nullish().or(z.literal('')),
  lat: z.number().min(-90).max(90).nullish(),
  lng: z.number().min(-180).max(180).nullish(),
  radiusKm: z.number().min(0).max(500).nullish(),
  active: z.boolean(),
});

export type SponsorInput = z.infer<typeof sponsorSchema>;

export interface AdminResult {
  ok: boolean;
  error?: string;
  id?: string;
}

const orNull = (v: string | null | undefined) => (v && v.trim() !== '' ? v.trim() : null);

export async function saveSponsor(input: SponsorInput): Promise<AdminResult> {
  const parsed = sponsorSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? 'Invalid sponsor.' };
  const v = parsed.data;
  try {
    await requireAdmin();
    const admin = createAdminClient();
    const row = {
      name: v.name.trim(),
      judge_name: v.judgeName.trim(),
      tagline: orNull(v.tagline),
      emoji: orNull(v.emoji),
      accent: orNull(v.accent),
      cta_label: orNull(v.ctaLabel),
      cta_url: orNull(v.ctaUrl),
      discount_code: orNull(v.discountCode),
      discount_label: orNull(v.discountLabel),
      scope: v.scope,
      region: v.scope === 'region' ? orNull(v.region)?.toUpperCase() ?? null : null,
      lat: v.scope === 'local' ? v.lat ?? null : null,
      lng: v.scope === 'local' ? v.lng ?? null : null,
      radius_km: v.scope === 'local' ? v.radiusKm ?? null : null,
      active: v.active,
    };
    if (v.id) {
      const { error } = await admin.from('sponsors').update(row).eq('id', v.id);
      if (error) return { ok: false, error: missingTable(error) ? 'Sponsors need migration 0011.' : error.message };
      revalidatePath('/app/admin/sponsors');
      return { ok: true, id: v.id };
    }
    const { data, error } = await admin.from('sponsors').insert(row).select('id').single();
    if (error) return { ok: false, error: missingTable(error) ? 'Sponsors need migration 0011.' : error.message };
    revalidatePath('/app/admin/sponsors');
    return { ok: true, id: data!.id as string };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Failed.' };
  }
}

export async function deleteSponsor(id: string): Promise<AdminResult> {
  if (!z.string().uuid().safeParse(id).success) return { ok: false, error: 'Invalid.' };
  try {
    await requireAdmin();
    const admin = createAdminClient();
    const { error } = await admin.from('sponsors').delete().eq('id', id);
    if (error) return { ok: false, error: error.message };
    revalidatePath('/app/admin/sponsors');
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Failed.' };
  }
}

export async function listSponsorsAdmin(): Promise<{ ok: boolean; sponsors: AdminSponsor[]; error?: string }> {
  try {
    await requireAdmin();
    const admin = createAdminClient();
    const { data, error } = await admin
      .from('sponsors')
      .select('*')
      .order('active', { ascending: false })
      .order('created_at', { ascending: false });
    if (error) {
      return { ok: false, sponsors: [], error: missingTable(error) ? 'Sponsors need migration 0011 applied first.' : error.message };
    }
    const { data: events } = await admin.from('sponsor_events').select('sponsor_id').eq('kind', 'claim');
    const claims = new Map<string, number>();
    for (const e of events ?? []) claims.set(e.sponsor_id as string, (claims.get(e.sponsor_id as string) ?? 0) + 1);

    const sponsors: AdminSponsor[] = (data ?? []).map((r) => ({
      id: r.id as string,
      name: r.name as string,
      judgeName: r.judge_name as string,
      tagline: (r.tagline as string | null) ?? null,
      emoji: (r.emoji as string | null) ?? null,
      accent: (r.accent as string | null) ?? null,
      ctaLabel: (r.cta_label as string | null) ?? null,
      ctaUrl: (r.cta_url as string | null) ?? null,
      discountCode: (r.discount_code as string | null) ?? null,
      discountLabel: (r.discount_label as string | null) ?? null,
      scope: r.scope as AdminSponsor['scope'],
      region: (r.region as string | null) ?? null,
      lat: (r.lat as number | null) ?? null,
      lng: (r.lng as number | null) ?? null,
      radiusKm: (r.radius_km as number | null) ?? null,
      active: r.active as boolean,
      claims: claims.get(r.id as string) ?? 0,
    }));
    return { ok: true, sponsors };
  } catch (e) {
    return { ok: false, sponsors: [], error: e instanceof Error ? e.message : 'Failed.' };
  }
}
