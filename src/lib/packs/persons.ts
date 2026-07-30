import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import { createAdminClient } from '@/lib/supabase/admin';
import type { PersonRecord } from './types';

function slugifyName(name: string): string {
  const base = name
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 70);
  return base.length >= 2 ? base : `person-${base || 'x'}`;
}

interface PersonRow {
  id: string;
  slug: string;
  full_name: string;
  created_at: string;
  updated_at: string;
}

function toPerson(row: PersonRow): PersonRecord {
  return {
    id: row.id,
    slug: row.slug,
    fullName: row.full_name,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export async function getPersonBySlug(supabase: SupabaseClient, slug: string): Promise<PersonRecord | null> {
  const { data, error } = await supabase.from('persons').select('*').eq('slug', slug).maybeSingle();
  if (error) throw error;
  return data ? toPerson(data as PersonRow) : null;
}

/** Programme ids a person is credited on, with their role on each. */
export async function listCreditsForPerson(
  supabase: SupabaseClient,
  personId: string,
): Promise<{ programmeId: string; role: string }[]> {
  const { data, error } = await supabase
    .from('person_programmes')
    .select('programme_id, role')
    .eq('person_id', personId);
  if (error) throw error;
  return (data as { programme_id: string; role: string }[]).map((row) => ({
    programmeId: row.programme_id,
    role: row.role,
  }));
}

/**
 * Idempotent upsert keyed on `persons.tmdb_person_id` (unique index from
 * migration 0039) — a real TMDB cast member is written at most once no
 * matter how many programmes credit them.
 */
export async function upsertPerson(tmdbPersonId: number, fullName: string): Promise<PersonRecord> {
  const admin = createAdminClient();

  const { data: existing, error: existingError } = await admin
    .from('persons')
    .select('*')
    .eq('tmdb_person_id', tmdbPersonId)
    .maybeSingle();
  if (existingError) throw existingError;
  if (existing) return toPerson(existing as PersonRow);

  const { data, error } = await admin
    .from('persons')
    .insert({ slug: slugifyName(fullName), full_name: fullName, tmdb_person_id: tmdbPersonId })
    .select('*')
    .maybeSingle();
  if (error) {
    // Unique-constraint race (slug or tmdb_person_id inserted concurrently
    // by another request resolving the same premiere-calendar window) —
    // read back the winner rather than fail the caller.
    const { data: retry, error: retryError } = await admin
      .from('persons')
      .select('*')
      .eq('tmdb_person_id', tmdbPersonId)
      .maybeSingle();
    if (retryError || !retry) throw error;
    return toPerson(retry as PersonRow);
  }
  return toPerson(data as PersonRow);
}

/** Idempotent — safe to call repeatedly for the same person/programme/role. */
export async function linkPersonToProgramme(personId: string, programmeId: string, role: string): Promise<void> {
  const admin = createAdminClient();
  const { error } = await admin
    .from('person_programmes')
    .upsert({ person_id: personId, programme_id: programmeId, role }, { onConflict: 'person_id,programme_id,role' });
  if (error) throw error;
}

/**
 * Pulls real TMDB cast credits for a programme (top-billed 8, per
 * `getCredits`) and persists them via `upsertPerson`/`linkPersonToProgramme`
 * so `listPersonsForProgramme` has real data instead of an empty result.
 * A no-op past the first successful run for a given programme+role set —
 * safe to call on every page load. Never fabricates a credit: anything
 * TMDB doesn't return simply isn't linked.
 */
export async function ensureCreditsForProgramme(
  programmeId: string,
  tmdbId: number,
  mediaType: 'movie' | 'tv',
): Promise<void> {
  const { getCredits } = await import('@/lib/tmdb/client');
  const credits = await getCredits(mediaType, tmdbId).catch(() => null);
  if (!credits || credits.cast.length === 0) return;

  await Promise.all(
    credits.cast.map(async (member) => {
      const person = await upsertPerson(member.id, member.name);
      await linkPersonToProgramme(person.id, programmeId, member.character ?? 'Cast');
    }),
  );
}

/** Persons credited on a programme, with role. Serves any Pack's person tracking — no Pack-specific table. */
export async function listPersonsForProgramme(
  supabase: SupabaseClient,
  programmeId: string,
): Promise<{ person: PersonRecord; role: string }[]> {
  const { data: credits, error: creditsError } = await supabase
    .from('person_programmes')
    .select('person_id, role')
    .eq('programme_id', programmeId);
  if (creditsError) throw creditsError;
  const rows = credits as { person_id: string; role: string }[];
  if (rows.length === 0) return [];

  const personIds = [...new Set(rows.map((row) => row.person_id))];
  const { data, error } = await supabase.from('persons').select('*').in('id', personIds);
  if (error) throw error;
  const byId = new Map((data as PersonRow[]).map((row) => [row.id, toPerson(row)]));

  return rows
    .map((row) => {
      const person = byId.get(row.person_id);
      return person ? { person, role: row.role } : null;
    })
    .filter((entry): entry is { person: PersonRecord; role: string } => entry !== null);
}
