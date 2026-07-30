import Link from 'next/link';
import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import { createClient } from '@/lib/supabase/server';
import { getPackBySlug } from '@/lib/packs/packs';
import { getCaseBySlug, listProgrammesForCase, listCaseSubjects, listCaseTimeline } from '@/lib/packs/cases';
import { findSubscription } from '@/lib/packs/userTracking';
import { FollowButton } from '@/components/packs/FollowButton';
import { SeenToggle } from '@/components/packs/SeenToggle';
import { SourceNote } from '@/components/packs/SourceNote';
import { PublicHeader, PublicFooter } from '@/components/discovery/DiscoveryLayout';
import { Poster } from '@/components/PosterCard';

export const dynamic = 'force-dynamic';

export async function generateMetadata({ params }: { params: { slug: string; caseSlug: string } }): Promise<Metadata> {
  try {
    const supabase = createClient();
    const c = await getCaseBySlug(supabase, params.caseSlug);
    return { title: c ? `${c.title} · Crime Case Files · WatchVerd1ct` : 'Case · WatchVerd1ct' };
  } catch {
    return { title: 'Case · WatchVerd1ct' };
  }
}

const ROLE_LABEL: Record<string, string> = {
  victim: 'Victim',
  person_of_interest: 'Person of interest',
  suspect: 'Suspect',
  charged: 'Charged',
  defendant: 'Defendant',
  convicted: 'Convicted',
  acquitted: 'Acquitted',
  exonerated: 'Exonerated',
  witness: 'Witness',
  other: 'Related',
};

const EVENT_LABEL: Record<string, string> = {
  incident: 'Incident',
  investigation: 'Investigation',
  arrest: 'Arrest',
  charges: 'Charges filed',
  trial: 'Trial',
  verdict: 'Verdict',
  sentencing: 'Sentencing',
  appeal: 'Appeal',
  development: 'Development',
};

export default async function CaseDetailPage({ params }: { params: { slug: string; caseSlug: string } }) {
  const supabase = createClient();
  const pack = await getPackBySlug(supabase, params.slug).catch(() => null);
  if (!pack || !pack.caseTracking) notFound();

  const caseRecord = await getCaseBySlug(supabase, params.caseSlug);
  if (!caseRecord) notFound();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const [programmeIds, subjects, timeline, tracking] = await Promise.all([
    listProgrammesForCase(supabase, caseRecord.id),
    listCaseSubjects(supabase, caseRecord.id),
    listCaseTimeline(supabase, caseRecord.id),
    user ? findSubscription(supabase, user.id, 'case', caseRecord.id) : Promise.resolve(null),
  ]);

  const { data: programmeRows } =
    programmeIds.length > 0
      ? await supabase.from('tv_programmes').select('id, title, artwork_url').in('id', programmeIds)
      : { data: [] as { id: string; title: string; artwork_url: string | null }[] };

  const anonymousUserId = '00000000-0000-0000-0000-000000000000';
  const { data: seenRows } =
    programmeIds.length > 0
      ? await supabase
          .from('user_seen_programmes')
          .select('programme_id')
          .in('programme_id', programmeIds)
          .eq('user_id', user?.id ?? anonymousUserId)
      : { data: [] as { programme_id: string }[] };
  const seenIds = new Set(((seenRows ?? []) as { programme_id: string }[]).map((r) => r.programme_id));
  const seenCount = programmeIds.filter((id) => seenIds.has(id)).length;

  return (
    <>
      <PublicHeader />
      <main className="container-page space-y-6 py-8">
        <Link href={`/packs/${pack.slug}`} className="text-sm text-slate-400 hover:text-white">
          ← {pack.displayName}
        </Link>

        <section>
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h1 className="text-2xl font-bold text-white sm:text-3xl">{caseRecord.title}</h1>
              {caseRecord.description && <p className="mt-1 max-w-2xl text-sm text-slate-400">{caseRecord.description}</p>}
              <p className="mt-2 text-sm text-slate-300">{caseRecord.statusSummary || 'Not yet documented.'}</p>
              {(caseRecord.location || caseRecord.incidentDate) && (
                <p className="mt-1 text-[12px] text-slate-500">
                  {[caseRecord.location, caseRecord.incidentDate].filter(Boolean).join(' · ')}
                </p>
              )}
            </div>
            {user && (
              <FollowButton
                subscriptionType="case"
                subject={caseRecord.id}
                packSlug={pack.slug}
                initialTrackingId={tracking?.id ?? null}
                label="Follow this case"
              />
            )}
          </div>

          {user && seenCount > 0 && seenCount < programmeIds.length && (
            <div className="mt-4 rounded-xl border border-gold-400/30 bg-gold-500/[0.08] p-3 text-sm text-gold-200">
              <span className="font-semibold">You may already know this case</span> — you&apos;ve seen {seenCount} of{' '}
              {programmeIds.length} program{programmeIds.length === 1 ? '' : 's'} covering it.
            </div>
          )}
        </section>

        {subjects.length > 0 && (
          <section>
            <h2 className="mb-2 text-lg font-bold text-white">People</h2>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              {subjects.map((s) => (
                <div key={s.id} className="rounded-xl border border-white/10 bg-white/[0.03] p-3">
                  <p className="text-sm font-semibold text-white">{s.fullName}</p>
                  <p className="text-[12px] text-slate-400">{ROLE_LABEL[s.role] ?? s.role}{s.outcome ? ` · ${s.outcome}` : ''}</p>
                  <div className="mt-1.5"><SourceNote sourceUrl={s.sourceUrl} confidence={s.confidence} /></div>
                </div>
              ))}
            </div>
          </section>
        )}

        <section>
          <h2 className="mb-2 text-lg font-bold text-white">Case timeline</h2>
          {timeline.length === 0 ? (
            <p className="rounded-xl border border-white/10 bg-white/[0.03] p-4 text-sm text-slate-400">
              Not yet documented. A sourced timeline will appear here once one has been curated.
            </p>
          ) : (
            <ol className="space-y-2 border-l border-white/10 pl-4">
              {timeline.map((e) => (
                <li key={e.id} className="relative">
                  <span aria-hidden className="absolute -left-[21px] top-1.5 h-2.5 w-2.5 rounded-full bg-brand-400" />
                  <p className="text-[11px] font-bold uppercase tracking-wide text-brand-300">
                    {EVENT_LABEL[e.eventType] ?? e.eventType}
                    {e.eventDate ? ` · ${e.eventDate}` : ''}
                    {e.disputed && <span className="ml-1.5 text-amber-300">(disputed)</span>}
                  </p>
                  <p className="text-sm font-semibold text-white">{e.headline}</p>
                  {e.detail && <p className="text-sm text-slate-400">{e.detail}</p>}
                  <div className="mt-1"><SourceNote sourceUrl={e.sourceUrl} confidence={e.confidence} /></div>
                </li>
              ))}
            </ol>
          )}
        </section>

        <section>
          <h2 className="mb-2 text-lg font-bold text-white">Related programs</h2>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            {((programmeRows ?? []) as { id: string; title: string; artwork_url: string | null }[]).map((p) => (
              <div key={p.id} className="flex items-center gap-3 rounded-lg border border-white/10 bg-white/[0.03] p-2.5">
                <div className="h-14 w-10 flex-shrink-0 overflow-hidden rounded bg-ink-800">
                  <Poster posterUrl={p.artwork_url} title={p.title} />
                </div>
                <p className="min-w-0 flex-1 truncate text-sm font-semibold text-white">{p.title}</p>
                {user && <SeenToggle subjectType="programme" subjectId={p.id} packSlug={pack.slug} initialSeen={seenIds.has(p.id)} />}
              </div>
            ))}
          </div>
        </section>
      </main>
      <PublicFooter />
    </>
  );
}
