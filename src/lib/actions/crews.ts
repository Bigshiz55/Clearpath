'use server';

import { randomBytes } from 'crypto';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { createClient } from '@/lib/supabase/server';
import type { SupabaseClient } from '@supabase/supabase-js';

export interface CrewPerson {
  id: string;
  name: string;
  love: string[];
  avoid: string[];
  isGuest: boolean;
}
export interface CrewDNA {
  nights: number;
  lovedGenres: Record<string, number>;
  lovedTitles: { key: string; title: string }[];
  dislikedKeys: string[];
  compromiser: Record<string, number>;
  surprises: { title: string; who: string }[];
}
export interface Crew {
  id: string;
  name: string;
  joinCode: string;
  people: CrewPerson[];
  dna: CrewDNA;
}

function emptyDNA(): CrewDNA {
  return { nights: 0, lovedGenres: {}, lovedTitles: [], dislikedKeys: [], compromiser: {}, surprises: [] };
}

function isMissingTable(error: { code?: string; message?: string } | null): boolean {
  return !!error && (error.code === '42P01' || /relation .* does not exist/i.test(error.message ?? ''));
}

async function requireUser(supabase: SupabaseClient): Promise<string | null> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user?.id ?? null;
}

export interface ListCrewsResult {
  ok: boolean;
  needsSetup?: boolean;
  error?: string;
  crews?: Crew[];
}

export async function listCrews(): Promise<ListCrewsResult> {
  try {
    const supabase = createClient();
    const uid = await requireUser(supabase);
    if (!uid) return { ok: false, error: 'Not signed in.' };

    const { data: crews, error } = await supabase
      .from('crews')
      .select('id, name, join_code, dna')
      .eq('owner_id', uid)
      .order('created_at', { ascending: true });
    if (error) {
      if (isMissingTable(error)) return { ok: false, needsSetup: true };
      return { ok: false, error: error.message };
    }

    const ids = (crews ?? []).map((c) => c.id as string);
    const peopleByCrew = new Map<string, CrewPerson[]>();
    if (ids.length > 0) {
      const { data: people } = await supabase
        .from('crew_people')
        .select('id, crew_id, name, love, avoid, is_guest')
        .in('crew_id', ids);
      for (const p of people ?? []) {
        const list = peopleByCrew.get(p.crew_id as string) ?? [];
        list.push({
          id: p.id as string,
          name: p.name as string,
          love: (p.love as string[]) ?? [],
          avoid: (p.avoid as string[]) ?? [],
          isGuest: (p.is_guest as boolean) ?? false,
        });
        peopleByCrew.set(p.crew_id as string, list);
      }
    }

    return {
      ok: true,
      crews: (crews ?? []).map((c) => ({
        id: c.id as string,
        name: c.name as string,
        joinCode: c.join_code as string,
        people: peopleByCrew.get(c.id as string) ?? [],
        dna: { ...emptyDNA(), ...((c.dna as CrewDNA | null) ?? {}) },
      })),
    };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Failed to load crews.' };
  }
}

export async function createCrew(name: string): Promise<{ ok: boolean; error?: string; needsSetup?: boolean }> {
  const parsed = z.string().min(1).max(60).safeParse(name?.trim());
  if (!parsed.success) return { ok: false, error: 'Enter a crew name.' };
  try {
    const supabase = createClient();
    const uid = await requireUser(supabase);
    if (!uid) return { ok: false, error: 'Not signed in.' };
    const joinCode = randomBytes(8).toString('base64url');
    const { error } = await supabase.from('crews').insert({
      owner_id: uid,
      name: parsed.data,
      join_code: joinCode,
      dna: emptyDNA(),
    });
    if (error) {
      if (isMissingTable(error)) return { ok: false, needsSetup: true };
      return { ok: false, error: error.message };
    }
    revalidatePath('/app/together');
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Failed to create crew.' };
  }
}

export async function deleteCrew(id: string): Promise<{ ok: boolean; error?: string }> {
  if (!z.string().uuid().safeParse(id).success) return { ok: false, error: 'Invalid crew.' };
  try {
    const supabase = createClient();
    const uid = await requireUser(supabase);
    if (!uid) return { ok: false, error: 'Not signed in.' };
    const { error } = await supabase.from('crews').delete().eq('id', id).eq('owner_id', uid);
    if (error) return { ok: false, error: error.message };
    revalidatePath('/app/together');
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Failed.' };
  }
}

const personSchema = z.object({
  crewId: z.string().uuid(),
  name: z.string().min(1).max(40),
  love: z.array(z.string().max(40)).max(12).default([]),
  avoid: z.array(z.string().max(40)).max(12).default([]),
});

export async function addCrewPerson(input: z.infer<typeof personSchema>): Promise<{ ok: boolean; error?: string }> {
  const parsed = personSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: 'Invalid person.' };
  const v = parsed.data;
  try {
    const supabase = createClient();
    const uid = await requireUser(supabase);
    if (!uid) return { ok: false, error: 'Not signed in.' };
    // RLS ensures the crew belongs to this owner.
    const { error } = await supabase.from('crew_people').insert({
      crew_id: v.crewId,
      name: v.name.trim(),
      love: v.love,
      avoid: v.avoid,
      is_guest: false,
    });
    if (error) return { ok: false, error: error.message };
    revalidatePath('/app/together');
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Failed.' };
  }
}

export async function removeCrewPerson(personId: string): Promise<{ ok: boolean; error?: string }> {
  if (!z.string().uuid().safeParse(personId).success) return { ok: false, error: 'Invalid person.' };
  try {
    const supabase = createClient();
    const uid = await requireUser(supabase);
    if (!uid) return { ok: false, error: 'Not signed in.' };
    const { error } = await supabase.from('crew_people').delete().eq('id', personId);
    if (error) return { ok: false, error: error.message };
    revalidatePath('/app/together');
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Failed.' };
  }
}

const outcomeSchema = z.object({
  crewId: z.string().uuid(),
  key: z.string().max(40),
  title: z.string().max(300),
  genres: z.array(z.string().max(40)).max(20).default([]),
  perMember: z.array(z.object({ name: z.string(), score: z.number(), vetoed: z.boolean() })).default([]),
  outcome: z.enum(['loved', 'fine', 'nope']),
});

export async function logCrewOutcome(input: z.infer<typeof outcomeSchema>): Promise<{ ok: boolean; error?: string }> {
  const parsed = outcomeSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: 'Invalid.' };
  const v = parsed.data;
  try {
    const supabase = createClient();
    const uid = await requireUser(supabase);
    if (!uid) return { ok: false, error: 'Not signed in.' };

    const { data: crew, error: readErr } = await supabase
      .from('crews')
      .select('id, dna')
      .eq('id', v.crewId)
      .eq('owner_id', uid)
      .maybeSingle();
    if (readErr) return { ok: false, error: readErr.message };
    if (!crew) return { ok: false, error: 'Crew not found.' };

    const dna: CrewDNA = { ...emptyDNA(), ...((crew.dna as CrewDNA | null) ?? {}) };
    dna.nights += 1;
    if (v.outcome === 'loved') {
      for (const g of v.genres) dna.lovedGenres[g] = (dna.lovedGenres[g] ?? 0) + 1;
      if (!dna.lovedTitles.some((t) => t.key === v.key)) dna.lovedTitles.unshift({ key: v.key, title: v.title });
      dna.lovedTitles = dna.lovedTitles.slice(0, 30);
      const eligible = v.perMember.filter((m) => !m.vetoed);
      if (eligible.length > 0) {
        const low = eligible.reduce((a, b) => (b.score < a.score ? b : a));
        dna.compromiser[low.name] = (dna.compromiser[low.name] ?? 0) + 1;
      }
      for (const m of v.perMember) if (m.score < 55) dna.surprises.unshift({ title: v.title, who: m.name });
      dna.surprises = dna.surprises.slice(0, 20);
    } else if (v.outcome === 'nope') {
      if (!dna.dislikedKeys.includes(v.key)) dna.dislikedKeys.push(v.key);
    }

    const { error } = await supabase.from('crews').update({ dna, updated_at: new Date().toISOString() }).eq('id', v.crewId);
    if (error) return { ok: false, error: error.message };
    revalidatePath('/app/together');
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Failed.' };
  }
}

export async function getCrewInvite(
  crewId: string,
  origin: string,
): Promise<{ ok: boolean; url?: string; qrSvg?: string; error?: string }> {
  if (!z.string().uuid().safeParse(crewId).success) return { ok: false, error: 'Invalid crew.' };
  try {
    const supabase = createClient();
    const uid = await requireUser(supabase);
    if (!uid) return { ok: false, error: 'Not signed in.' };
    const { data: crew } = await supabase
      .from('crews')
      .select('join_code')
      .eq('id', crewId)
      .eq('owner_id', uid)
      .maybeSingle();
    if (!crew) return { ok: false, error: 'Crew not found.' };
    const base = /^https?:\/\//.test(origin) ? origin.replace(/\/$/, '') : 'https://clearpath-pearl-chi.vercel.app';
    const url = `${base}/join/${crew.join_code as string}`;
    const QRCode = (await import('qrcode')).default;
    const qrSvg = await QRCode.toString(url, { type: 'svg', margin: 1, width: 240 });
    return { ok: true, url, qrSvg };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Failed.' };
  }
}

const joinSchema = z.object({
  code: z.string().min(4).max(64),
  name: z.string().min(1).max(40),
  love: z.array(z.string().max(40)).max(12).default([]),
  avoid: z.array(z.string().max(40)).max(12).default([]),
});

export async function joinCrew(input: z.infer<typeof joinSchema>): Promise<{ ok: boolean; crewName?: string; error?: string }> {
  const parsed = joinSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: 'Enter your name first.' };
  const v = parsed.data;
  try {
    const supabase = createClient();
    const { data, error } = await supabase.rpc('join_crew', {
      p_code: v.code,
      p_name: v.name.trim(),
      p_love: v.love,
      p_avoid: v.avoid,
    });
    if (error) return { ok: false, error: error.message };
    const row = Array.isArray(data) ? data[0] : data;
    return { ok: true, crewName: (row?.crew_name as string) ?? 'the crew' };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Could not join.' };
  }
}
