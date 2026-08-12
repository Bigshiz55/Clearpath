import { createClient } from '@/lib/supabase/server';
import { listStationsForPack } from '@/lib/packs/stations';
import type { Pack } from '@/lib/packs/types';
import { CaseList, type CaseSummary, type UnmatchedProgramme } from './CaseList';
import { PackEmptyState } from './PackEmptyState';
import { partitionEligible } from '@/lib/packs/eligibility';
import { shapeForPack } from '@/lib/packs/identity';

interface ProgrammeRow {
  id: string;
  title: string;
  artwork_url: string | null;
  genres?: string[] | null;
  tmdb_media_type?: 'movie' | 'tv' | null;
  programme_type?: string | null;
  season_number?: number | null;
  episode_number?: number | null;
}

/**
 * The Case-browsing + completion-stats feature. Driven entirely by
 * `pack.caseTracking`/`pack.completionStats` — never by `pack.slug`.
 */
export async function CaseBrowserView({ pack, userId }: { pack: Pack; userId: string | null }) {
  const supabase = createClient();

  const stationIds = await listStationsForPack(supabase, pack.id);
  if (stationIds.length === 0) {
    return (
      <PackEmptyState
        title="No channels wired to this Pack yet"
        detail="This Pack hasn't been connected to any TV listings. Run the admin ingest to populate its channel lineup."
      />
    );
  }

  const { data: airingRows } = await supabase
    .from('tv_airings')
    .select('programme_id, station_id, start_at_utc')
    .in('station_id', stationIds);

  if (!airingRows || airingRows.length === 0) {
    return (
      <PackEmptyState
        title="No episodes ingested yet"
        detail="This Pack's channels are connected, but no airings have been ingested yet. Run the admin ingest, then check back."
      />
    );
  }

  const programmeIds = [...new Set(airingRows.map((r) => r.programme_id as string))];
  const stationIdsUsed = [...new Set(airingRows.map((r) => r.station_id as string))];

  const [{ data: linkRows }, { data: programmeRows }, { data: stationRows }, { data: seenRows }] = await Promise.all([
    supabase.from('case_programmes').select('case_id, programme_id').in('programme_id', programmeIds),
    supabase
      .from('tv_programmes')
      .select('id, title, artwork_url, genres, tmdb_media_type, programme_type, season_number, episode_number')
      .in('id', programmeIds),
    supabase.from('tv_stations').select('id, name').in('id', stationIdsUsed),
    userId
      ? supabase.from('user_seen_programmes').select('programme_id').in('programme_id', programmeIds).eq('user_id', userId)
      : Promise.resolve({ data: [] as { programme_id: string }[] }),
  ]);

  const programmeById = new Map(
    (programmeRows ?? []).map((r) => [r.id as string, r as ProgrammeRow]),
  );
  const stationById = new Map((stationRows ?? []).map((r) => [r.id as string, r as { id: string; name: string }]));
  const seenProgrammeIds = new Set((seenRows ?? []).map((r) => r.programme_id as string));

  // Networks per programme, from its airings on this Pack's stations.
  const networksByProgramme = new Map<string, Set<string>>();
  const nextAiringByProgramme = new Map<string, string>();
  for (const row of airingRows) {
    const pid = row.programme_id as string;
    const stationName = stationById.get(row.station_id as string)?.name;
    if (stationName) {
      const set = networksByProgramme.get(pid) ?? new Set<string>();
      set.add(stationName);
      networksByProgramme.set(pid, set);
    }
    const startAt = row.start_at_utc as string;
    if (startAt >= new Date().toISOString()) {
      const current = nextAiringByProgramme.get(pid);
      if (!current || startAt < current) nextAiringByProgramme.set(pid, startAt);
    }
  }

  const caseIdByProgramme = new Map((linkRows ?? []).map((r) => [r.programme_id as string, r.case_id as string]));
  const linkedCaseIds = [...new Set((linkRows ?? []).map((r) => r.case_id as string))];

  const { data: caseRows } =
    linkedCaseIds.length > 0
      ? await supabase.from('cases').select('id, slug, title, description').in('id', linkedCaseIds)
      : { data: [] as { id: string; slug: string; title: string; description: string | null }[] };

  const caseMeta = new Map((caseRows ?? []).map((r) => [r.id as string, r]));

  const programmesByCaseId = new Map<string, string[]>();
  for (const pid of programmeIds) {
    const caseId = caseIdByProgramme.get(pid);
    if (!caseId) continue;
    const list = programmesByCaseId.get(caseId) ?? [];
    list.push(pid);
    programmesByCaseId.set(caseId, list);
  }

  const cases: CaseSummary[] = [...programmesByCaseId.entries()]
    .map(([caseId, pids]) => {
      const meta = caseMeta.get(caseId);
      if (!meta) return null;
      const seenCount = pids.filter((pid) => seenProgrammeIds.has(pid)).length;
      const nextUpcoming = pids
        .map((pid) => nextAiringByProgramme.get(pid))
        .filter((v): v is string => v != null)
        .sort()[0] ?? null;
      return {
        id: caseId,
        slug: meta.slug,
        title: meta.title,
        description: meta.description,
        programmes: pids.map((pid) => ({
          id: pid,
          title: programmeById.get(pid)?.title ?? 'Untitled',
          posterUrl: programmeById.get(pid)?.artwork_url ?? null,
          networks: [...(networksByProgramme.get(pid) ?? [])],
          seen: seenProgrammeIds.has(pid),
        })),
        seenCount,
        totalCount: pids.length,
        nextUpcomingAiring: nextUpcoming,
      };
    })
    .filter((c): c is CaseSummary => c !== null)
    .sort((a, b) => b.totalCount - a.totalCount);

  /* ELIGIBILITY BEFORE ANYTHING ELSE.
     This page showed every programme that aired on the Pack's channels, which
     is how Storage Wars, K9 PD and an infomercial called "Natural Blood
     Pressure Management" ended up inside a true-crime destination. The listings
     were right; treating "aired on ID" as "is a case" was not. */
  const shape = shapeForPack(pack.slug);
  const eligibleIds = new Set(
    partitionEligible(
      shape,
      programmeIds.map((pid) => {
        const p = programmeById.get(pid);
        return {
          id: pid,
          title: p?.title ?? '',
          mediaType: p?.tmdb_media_type ?? null,
          programmeType: p?.programme_type ?? null,
          seasonNumber: p?.season_number ?? null,
          episodeNumber: p?.episode_number ?? null,
          genres: p?.genres ?? [],
        };
      }),
    ).kept.map((k) => k.id),
  );

  const unmatched: UnmatchedProgramme[] = programmeIds
    .filter((pid) => !caseIdByProgramme.has(pid) && eligibleIds.has(pid))
    .map((pid) => ({
      id: pid,
      title: programmeById.get(pid)?.title ?? 'Untitled',
      posterUrl: programmeById.get(pid)?.artwork_url ?? null,
      networks: [...(networksByProgramme.get(pid) ?? [])],
      seen: seenProgrammeIds.has(pid),
    }));

  if (cases.length === 0 && unmatched.length === 0) {
    return (
      <PackEmptyState
        title="No episodes ingested yet"
        detail="This Pack's channels are connected, but no airings have been ingested yet. Run the admin ingest, then check back."
      />
    );
  }

  /* NO VERIFIED CASES MEANS THE PRODUCT'S ACTUAL PROMISE IS NOT AVAILABLE.
     Crime Case Files exists to say "you already saw this case on Dateline".
     That requires canonical case identity — a real event with aliases, people,
     a place and a date, linked to the programmes that retold it — and the
     `case_programmes` table is empty. Rendering a list of true-crime episodes
     under a heading about cases implies a linkage that does not exist, which is
     a fake-certainty claim rather than a sparse one.
     So when nothing is linked, the page says so, and offers what it CAN
     honestly offer: the eligible programming, labelled as programming. See
     docs/CANONICAL-CASE-IDENTITY.md for what has to exist before the real
     product can ship. */
  if (cases.length === 0) {
    return (
      <div className="space-y-4" data-testid="cases-unlinked">
        <PackEmptyState
          title="Case linking isn’t live yet"
          detail={`We can tell you what's airing, but not yet whether two shows cover the same case — that needs verified case records we don't have. ${unmatched.length} true-crime ${unmatched.length === 1 ? 'programme' : 'programmes'} below, from this Pack's channels.`}
        />
        <CaseList cases={[]} unmatched={unmatched} packSlug={pack.slug} signedIn={userId != null} />
      </div>
    );
  }

  return <CaseList cases={cases} unmatched={unmatched} packSlug={pack.slug} signedIn={userId != null} />;
}
