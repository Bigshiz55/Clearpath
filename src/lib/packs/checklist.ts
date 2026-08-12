import 'server-only';
import { partitionEligible, shapeForPack } from './eligibility';
import type { SupabaseClient } from '@supabase/supabase-js';
import { listStationsForPack } from './stations';
import type { Pack, ChecklistItem } from './types';

/**
 * BROWSE, CHECKLIST AND WATCHED ARE THREE DIFFERENT QUESTIONS.
 *
 * ── THE DEFECT THIS FIXES ─────────────────────────────────────────────────
 * "My Checklist" listed EVERY programme on the Pack's stations and offered a
 * "Want to watch" filter that simply meant "not marked seen". So a user who
 * had never interacted with the Pack was shown a personal-sounding to-do
 * list of two hundred titles they never chose, most of them infomercials and
 * paid programming that happened to air on the same channel. The word "my"
 * was doing work the data could not support, and "want to watch" asserted an
 * intention the user had never expressed.
 *
 * The three questions, now kept apart:
 *
 *   Browse Pack   every title the Pack's channels actually carry. Not
 *                 personal, not a list, no implied intent.
 *   My Checklist  ONLY titles the user explicitly added. Empty until they
 *                 add something, and that empty state is correct, not a bug.
 *   Watched       ONLY titles explicitly marked seen (user_seen).
 *
 * Nothing is ever inferred in the other direction: not-watched never means
 * want-to-watch, and not-on-the-list never means anything at all.
 *
 * ── FEATURE DETECTION ─────────────────────────────────────────────────────
 * The explicit list lives in `pack_list_items` (migration 0043). Applying a
 * migration is an owner action this codebase cannot perform on its own, so
 * every read here degrades to "storage unavailable" rather than throwing, and
 * the UI says so plainly instead of silently showing an empty list that looks
 * like the user simply has not added anything. The moment 0043 is applied the
 * feature turns on with no code change.
 */

const BROWSE_LIMIT = 300;

export interface PackTitle extends ChecklistItem {
  /** True when the user explicitly added this to their checklist. */
  onList: boolean;
}

export interface PackChecklistState {
  /** False when pack_list_items is not present in this database yet. */
  storageAvailable: boolean;
  items: PackTitle[];
}

/** Cached per process: the answer only changes when a migration runs. */
let listTableAvailable: boolean | null = null;

export async function packListStorageAvailable(supabase: SupabaseClient): Promise<boolean> {
  if (listTableAvailable !== null) return listTableAvailable;
  const { error } = await supabase.from('pack_list_items').select('programme_id').limit(1);
  // PGRST205 = table not in the schema cache, i.e. the migration has not run.
  listTableAvailable = !error || !/schema cache|does not exist/i.test(error.message);
  return listTableAvailable;
}

interface ProgrammeRow {
  id: string;
  title: string;
  artwork_url: string | null;
  genres: string[] | null;
  release_year: number | null;
  tmdb_media_type?: 'movie' | 'tv' | null;
}

async function loadProgrammes(
  supabase: SupabaseClient,
  programmeIds: string[],
): Promise<Map<string, { title: string; artwork_url: string | null; genres: string[] | null; release_year: number | null }>> {
  const out = new Map<string, { title: string; artwork_url: string | null; genres: string[] | null; release_year: number | null }>();
  if (programmeIds.length === 0) return out;
  const { data } = await supabase
    .from('tv_programmes')
    .select('id, title, artwork_url, genres, release_year')
    .in('id', programmeIds);
  for (const p of (data ?? []) as Array<{ id: string; title: string; artwork_url: string | null; genres: string[] | null; release_year: number | null }>) {
    out.set(p.id, p);
  }
  return out;
}

async function seenSet(supabase: SupabaseClient, userId: string | null, programmeIds: string[]): Promise<Set<string>> {
  if (!userId || programmeIds.length === 0) return new Set();
  const { data } = await supabase
    .from('user_seen_programmes')
    .select('programme_id')
    .eq('user_id', userId)
    .in('programme_id', programmeIds);
  return new Set(((data ?? []) as { programme_id: string }[]).map((r) => r.programme_id));
}

async function listedSet(
  supabase: SupabaseClient, userId: string | null, packId: string, programmeIds: string[],
): Promise<Set<string>> {
  if (!userId || programmeIds.length === 0) return new Set();
  if (!(await packListStorageAvailable(supabase))) return new Set();
  const { data } = await supabase
    .from('pack_list_items')
    .select('programme_id')
    .eq('user_id', userId)
    .eq('pack_id', packId)
    .in('programme_id', programmeIds);
  return new Set(((data ?? []) as { programme_id: string }[]).map((r) => r.programme_id));
}

/**
 * BROWSE — everything the Pack's channels carry, newest airing first.
 * Impersonal by construction: `onList` and `seen` are decorations on a list
 * that exists whether or not anyone is signed in.
 */
export async function listPackBrowse(
  supabase: SupabaseClient, pack: Pack, userId: string | null,
): Promise<PackTitle[]> {
  const stationIds = await listStationsForPack(supabase, pack.id);
  if (stationIds.length === 0) return [];

  const { data: airings } = await supabase
    .from('tv_airings')
    .select('programme_id, start_at_utc')
    .in('station_id', stationIds)
    .order('start_at_utc', { ascending: false })
    .limit(2000);

  const latestByProgramme = new Map<string, string>();
  for (const row of (airings ?? []) as { programme_id: string; start_at_utc: string }[]) {
    if (!latestByProgramme.has(row.programme_id)) latestByProgramme.set(row.programme_id, row.start_at_utc);
  }
  const programmeIds = [...latestByProgramme.keys()].slice(0, BROWSE_LIMIT);
  if (programmeIds.length === 0) return [];

  const [programmes, seen, listed] = await Promise.all([
    loadProgrammes(supabase, programmeIds),
    seenSet(supabase, userId, programmeIds),
    listedSet(supabase, userId, pack.id, programmeIds),
  ]);

  /* ELIGIBILITY, WHICH DID NOT EXIST BEFORE THIS.
     Browse used to show every programme that had aired on the Pack's channels —
     no filter on media type, genre, or whether the thing was entertainment at
     all. That is why the Lifetime Movie Vault carried Castle, The Rookie and
     Dr. Pimple Popper, and Crime Case Files carried Storage Wars and an
     infomercial about blood pressure. The listings were correct; the product was
     treating "aired on this channel" as "is what this channel is for", and a
     cable schedule is mostly not the thing the channel is known for. */
  const shape = shapeForPack(pack.slug);
  const rows = programmeIds
    .map((id) => {
      const p = programmes.get(id);
      if (!p) return null;
      return { id, p };
    })
    .filter((x): x is { id: string; p: ProgrammeRow } => x !== null);

  const { kept, rejected } = partitionEligible(
    shape,
    rows.map(({ id, p }) => ({
      id,
      title: p.title,
      mediaType: p.tmdb_media_type ?? null,
      genres: p.genres ?? [],
      releaseYear: p.release_year,
    })),
  );

  /* REPORTED, NOT SWALLOWED. "The Vault is empty" and "the Vault filtered out
     300 infomercials" are different problems with different owners, and a
     silently-empty page is indistinguishable from a broken one. */
  if (rejected.length > 0) {
    console.info(
      `[packs] ${pack.slug}: ${rejected.length}/${rows.length} airings excluded as ineligible ` +
        `(${[...new Set(rejected.map((r) => r.reason))].join('; ')})`,
    );
  }

  return kept
    .map(({ id }) => {
      const p = programmes.get(id)!;
      return {
        programmeId: id,
        title: p.title,
        posterUrl: p.artwork_url,
        genres: p.genres ?? [],
        releaseYear: p.release_year,
        seen: seen.has(id),
        latestAiringUtc: latestByProgramme.get(id) ?? null,
        onList: listed.has(id),
      } as PackTitle;
    });
}

/**
 * MY CHECKLIST — only what the user put there. Never derived from the
 * schedule, never from what they have not watched.
 */
export async function listMyChecklist(
  supabase: SupabaseClient, pack: Pack, userId: string | null,
): Promise<PackChecklistState> {
  const storageAvailable = await packListStorageAvailable(supabase);
  if (!userId || !storageAvailable) return { storageAvailable, items: [] };

  const { data: rows } = await supabase
    .from('pack_list_items')
    .select('programme_id, added_at')
    .eq('user_id', userId)
    .eq('pack_id', pack.id)
    .order('added_at', { ascending: false })
    .limit(BROWSE_LIMIT);

  const programmeIds = ((rows ?? []) as { programme_id: string }[]).map((r) => r.programme_id);
  if (programmeIds.length === 0) return { storageAvailable, items: [] };

  const [programmes, seen] = await Promise.all([
    loadProgrammes(supabase, programmeIds),
    seenSet(supabase, userId, programmeIds),
  ]);

  const items = programmeIds
    .map((id) => {
      const p = programmes.get(id);
      if (!p) return null;
      return {
        programmeId: id,
        title: p.title,
        posterUrl: p.artwork_url,
        genres: p.genres ?? [],
        releaseYear: p.release_year,
        seen: seen.has(id),
        latestAiringUtc: null,
        onList: true,
      } as PackTitle;
    })
    .filter((x): x is PackTitle => x !== null);

  return { storageAvailable, items };
}

export async function addToPackList(
  supabase: SupabaseClient, userId: string, packId: string, programmeId: string,
): Promise<void> {
  const { error } = await supabase
    .from('pack_list_items')
    .upsert({ user_id: userId, pack_id: packId, programme_id: programmeId }, { onConflict: 'user_id,pack_id,programme_id' });
  if (error) throw error;
}

export async function removeFromPackList(
  supabase: SupabaseClient, userId: string, packId: string, programmeId: string,
): Promise<void> {
  const { error } = await supabase
    .from('pack_list_items')
    .delete()
    .eq('user_id', userId)
    .eq('pack_id', packId)
    .eq('programme_id', programmeId);
  if (error) throw error;
}
