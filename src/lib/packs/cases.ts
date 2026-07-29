import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { CaseRecord, CaseAlias } from './types';

interface CaseRow {
  id: string;
  slug: string;
  title: string;
  description: string | null;
  created_at: string;
  updated_at: string;
}

function toCase(row: CaseRow): CaseRecord {
  return {
    id: row.id,
    slug: row.slug,
    title: row.title,
    description: row.description,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export async function getCaseBySlug(supabase: SupabaseClient, slug: string): Promise<CaseRecord | null> {
  const { data, error } = await supabase.from('cases').select('*').eq('slug', slug).maybeSingle();
  if (error) throw error;
  return data ? toCase(data as CaseRow) : null;
}

/** Programme ids linked to a Case, across any number of networks. */
export async function listProgrammesForCase(supabase: SupabaseClient, caseId: string): Promise<string[]> {
  const { data, error } = await supabase.from('case_programmes').select('programme_id').eq('case_id', caseId);
  if (error) throw error;
  return (data as { programme_id: string }[]).map((row) => row.programme_id);
}

/**
 * The Case(s) a programme is linked to. A retitled airing resolves to the
 * same Case with no extra lookup here: tv_programmes identity is stable
 * across a retitle (see migration 0036), so this is the same
 * case_programmes join regardless of which title the programme aired under.
 */
export async function resolveCasesForProgramme(supabase: SupabaseClient, programmeId: string): Promise<CaseRecord[]> {
  const { data: links, error: linkError } = await supabase
    .from('case_programmes')
    .select('case_id')
    .eq('programme_id', programmeId);
  if (linkError) throw linkError;
  const caseIds = (links as { case_id: string }[]).map((row) => row.case_id);
  if (caseIds.length === 0) return [];

  const { data, error } = await supabase.from('cases').select('*').in('id', caseIds);
  if (error) throw error;
  return (data as CaseRow[]).map(toCase);
}

interface CaseAliasRow {
  id: string;
  programme_id: string;
  alias_title: string;
  created_at: string;
}

/** Alternate titles a programme has aired under. */
export async function listAliasesForProgramme(supabase: SupabaseClient, programmeId: string): Promise<CaseAlias[]> {
  const { data, error } = await supabase.from('case_aliases').select('*').eq('programme_id', programmeId);
  if (error) throw error;
  return (data as CaseAliasRow[]).map((row) => ({
    id: row.id,
    programmeId: row.programme_id,
    aliasTitle: row.alias_title,
    createdAt: row.created_at,
  }));
}
