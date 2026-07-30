import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { PersonRecord } from './types';

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
