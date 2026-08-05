import { createClient } from '@/lib/supabase/server';
import { getPackPremiereCalendar } from '@/lib/packs/packs';
import { listStationsForPack } from '@/lib/packs/stations';
import { listPersonsForProgramme, ensureCreditsForProgramme } from '@/lib/packs/persons';
import { listSubscriptions } from '@/lib/packs/userTracking';
import { resolveProgrammeTmdbId, getPackDnaScores } from '@/lib/packs/dna';
import type { Pack } from '@/lib/packs/types';
import { PremiereListOrCalendar, type PremiereEntry, type CreditedPerson } from './PremiereListOrCalendar';
import { PackEmptyState } from './PackEmptyState';
import { getPackUpcoming } from '@/lib/packs/schedule';
import { UpcomingScheduleList } from './UpcomingScheduleList';

/** Resolution is a live TMDB search/credits call per title — bounded to a
 *  small window (the premiere calendar, not the full checklist) so it stays
 *  cheap. Shared by Watch DNA scoring and actor-credit ingest. */
const DNA_SCORE_LIMIT = 20;

function isoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/**
 * The premiere-calendar + person-tracking feature. Driven entirely by
 * `pack.premiereCalendar`/`pack.personTracking` — never by `pack.slug`.
 */
export async function PremiereCalendarView({ pack, userId }: { pack: Pack; userId: string | null }) {
  const supabase = createClient();

  // A 6-week window (today through the end of the following month) — enough
  // to fill a month-grid view without an unbounded query.
  const today = new Date();
  const start = isoDate(today);
  const end = isoDate(new Date(today.getTime() + 42 * 86_400_000));

  const [premieres, stationIds] = await Promise.all([
    getPackPremiereCalendar(supabase, pack.id, start, end),
    listStationsForPack(supabase, pack.id),
  ]);

  if (stationIds.length === 0) {
    return (
      <PackEmptyState
        title="No channels wired to this Pack yet"
        detail="This Pack hasn't been connected to any TV listings. Run the admin ingest to populate its channel lineup."
      />
    );
  }

  if (premieres.length === 0) {
    // NO VERIFIED PREMIERES IS NOT THE SAME FACT AS NO SCHEDULE. Providers
    // set premiere flags sparsely (TV Media's isNew is rare; TVmaze's
    // detection only covers episodic series), so a pack whose channels have
    // dozens of real upcoming airings used to render a giant empty panel
    // here that blamed the ingest. Show the schedule that exists, with each
    // entry honestly labelled — see src/lib/packs/schedule.ts.
    const upcoming = await getPackUpcoming(supabase, pack.id).catch(() => []);
    if (upcoming.length > 0) {
      return <UpcomingScheduleList entries={upcoming} />;
    }
    return (
      <PackEmptyState
        title="No upcoming listings for this Pack's channels"
        detail="The listings feed currently has no future airings for these channels. This is a data-coverage gap, not an empty catalog — the checklist and franchise sections below still work from the catalog."
      />
    );
  }

  const programmeIds = [...new Set(premieres.map((p) => p.programmeId))];
  const stationIdsUsed = [...new Set(premieres.map((p) => p.stationId))];
  const anonymousUserId = '00000000-0000-0000-0000-000000000000';

  // TMDB id resolution — bounded to a small window (never the whole ingest)
  // since it's a live search call per unresolved title. Feeds both Watch DNA
  // and real actor-credit ingest below. Runs regardless of sign-in: credits
  // are public data, useful to every visitor, not just DNA scoring.
  const resolved = await Promise.all(
    premieres.slice(0, DNA_SCORE_LIMIT).map((p) => resolveProgrammeTmdbId(supabase, p.programmeId).then((r) => [p.programmeId, r] as const)),
  );
  const tmdbIdByProgramme = new Map(resolved.filter(([, r]) => r != null).map(([pid, r]) => [pid, r!.tmdbId]));
  const resolvedTitles = resolved.filter((r): r is [string, { tmdbId: number; mediaType: 'movie' | 'tv' }] => r[1] != null);

  // Real TMDB cast credits for the same bounded window — idempotent past the
  // first successful run per programme, so this is cheap on repeat visits.
  await Promise.all(resolvedTitles.map(([programmeId, r]) => ensureCreditsForProgramme(programmeId, r.tmdbId, r.mediaType)));

  const [programmeRes, stationRes, seenRes, subs, creditsPerProgramme] = await Promise.all([
    supabase.from('tv_programmes').select('id, title, artwork_url').in('id', programmeIds),
    supabase.from('tv_stations').select('id, name').in('id', stationIdsUsed),
    supabase.from('user_seen_programmes').select('programme_id').in('programme_id', programmeIds).eq('user_id', userId ?? anonymousUserId),
    userId ? listSubscriptions(supabase, userId) : Promise.resolve([]),
    Promise.all(programmeIds.map((id) => listPersonsForProgramme(supabase, id).then((credits) => [id, credits] as const))),
  ]);

  const programmeById = new Map(
    (programmeRes.data ?? []).map((r) => [r.id as string, r as { id: string; title: string; artwork_url: string | null }]),
  );
  const stationById = new Map((stationRes.data ?? []).map((r) => [r.id as string, r as { id: string; name: string }]));
  const seenIds = new Set<string>((seenRes.data ?? []).map((r) => r.programme_id as string));
  const followedPersonIds = new Set(
    subs.filter((s) => s.subscriptionType === 'person' && s.subjectUuid).map((s) => s.subjectUuid as string),
  );
  const creditsByProgramme = new Map(creditsPerProgramme);

  // Watch DNA — cache-only: never a live classification call from here, only
  // reads whatever's already cached from elsewhere in the app.
  const dnaByTmdbId = userId ? await getPackDnaScores(supabase, userId, resolvedTitles.map(([, r]) => r)) : new Map();

  const entries: PremiereEntry[] = premieres.map((p) => {
    const credits = creditsByProgramme.get(p.programmeId) ?? [];
    const people: CreditedPerson[] = credits.map((c) => ({
      id: c.person.id,
      name: c.person.fullName,
      role: c.role,
      following: followedPersonIds.has(c.person.id),
    }));
    const tmdbId = tmdbIdByProgramme.get(p.programmeId);
    return {
      programmeId: p.programmeId,
      title: programmeById.get(p.programmeId)?.title ?? p.title,
      posterUrl: programmeById.get(p.programmeId)?.artwork_url ?? null,
      channel: stationById.get(p.stationId)?.name ?? 'Unknown channel',
      premiereDate: p.premiereDate,
      startAtUtc: p.startAtUtc,
      seen: seenIds.has(p.programmeId),
      people,
      dnaScore: tmdbId != null ? dnaByTmdbId.get(tmdbId) ?? null : null,
    };
  });

  return <PremiereListOrCalendar entries={entries} packSlug={pack.slug} signedIn={userId != null} />;
}
