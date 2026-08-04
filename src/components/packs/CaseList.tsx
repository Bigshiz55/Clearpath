'use client';

import Link from 'next/link';
import { Poster } from '@/components/PosterCard';
import { SeenToggle } from './SeenToggle';

export interface ProgrammeSummary {
  id: string;
  title: string;
  posterUrl: string | null;
  networks: string[];
  seen: boolean;
}

export type UnmatchedProgramme = ProgrammeSummary;

export interface CaseSummary {
  id: string;
  slug: string;
  title: string;
  description: string | null;
  programmes: ProgrammeSummary[];
  seenCount: number;
  totalCount: number;
  nextUpcomingAiring: string | null;
}

function ProgrammeRow({ programme, packSlug, signedIn }: { programme: ProgrammeSummary; packSlug: string; signedIn: boolean }) {
  return (
    <div className="flex items-center gap-3 rounded-lg border border-white/10 bg-white/[0.03] p-2.5">
      <div className="h-14 w-10 flex-shrink-0 overflow-hidden rounded bg-ink-800">
        <Poster posterUrl={programme.posterUrl} title={programme.title} />
      </div>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-semibold text-white">{programme.title}</p>
        <p className="truncate text-[12px] text-slate-400">{programme.networks.join(', ') || 'Unknown network'}</p>
      </div>
      {signedIn && (
        <SeenToggle subjectType="programme" subjectId={programme.id} packSlug={packSlug} initialSeen={programme.seen} />
      )}
    </div>
  );
}

function CaseCard({ caseSummary, packSlug, signedIn }: { caseSummary: CaseSummary; packSlug: string; signedIn: boolean }) {
  const networks = [...new Set(caseSummary.programmes.flatMap((p) => p.networks))];

  return (
    <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <Link href={`/packs/${packSlug}/cases/${caseSummary.slug}`} className="text-lg font-bold text-white hover:underline">
            {caseSummary.title} →
          </Link>
          {caseSummary.description && <p className="mt-0.5 text-sm text-slate-400">{caseSummary.description}</p>}
          <p className="mt-1 text-[12px] text-slate-500">
            Covered across {networks.length} network{networks.length === 1 ? '' : 's'}: {networks.join(', ')}
          </p>
        </div>
        {signedIn && (
          <SeenToggle subjectType="case" subjectId={caseSummary.id} packSlug={packSlug} initialSeen={caseSummary.seenCount === caseSummary.totalCount} size="md" />
        )}
      </div>

      {signedIn && (
        <p className="mt-2 text-sm font-semibold text-brand-300">
          You have seen {caseSummary.seenCount} of {caseSummary.totalCount} episode{caseSummary.totalCount === 1 ? '' : 's'} covering this case.
        </p>
      )}

      {caseSummary.nextUpcomingAiring && (
        <p className="mt-1 text-[12px] text-emerald-300">
          Next airing: {new Date(caseSummary.nextUpcomingAiring).toLocaleString(undefined, { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}
        </p>
      )}

      <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2">
        {caseSummary.programmes.map((programme) => (
          <ProgrammeRow key={programme.id} programme={programme} packSlug={packSlug} signedIn={signedIn} />
        ))}
      </div>
    </div>
  );
}

/** Browse-by-Case for the True Crime Pack, plus an Unmatched section for real ingested episodes with no Case link yet. */
export function CaseList({
  cases,
  unmatched,
  packSlug,
  signedIn,
}: {
  cases: CaseSummary[];
  unmatched: UnmatchedProgramme[];
  packSlug: string;
  signedIn: boolean;
}) {
  return (
    <div className="space-y-6">
      {cases.length > 0 && (
        <div className="space-y-4">
          {cases.map((c) => (
            <CaseCard key={c.id} caseSummary={c} packSlug={packSlug} signedIn={signedIn} />
          ))}
        </div>
      )}

      {/* Every episode below is real (really ingested, really airing) —
          "unmatched" only means no Case row has been linked to it yet. Case
          linking is a curated, human-verified match (see
          src/lib/cases/reviewQueue.ts), never an automatic guess, so a Pack
          can legitimately have zero Cases for a while even with plenty of
          episodes. Named here so a fully-unmatched list reads as "not yet
          curated," not as a broken feature. */}
      {cases.length === 0 && unmatched.length > 0 && (
        <div className="rounded-xl border border-white/10 bg-white/[0.03] p-3 text-sm text-slate-400">
          No episodes have been linked to a verified Case yet. Case linking is reviewed by hand, not guessed automatically — the episodes below are real listings, just not grouped by case yet.
        </div>
      )}

      {unmatched.length > 0 && (
        <section>
          <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400">
            Unmatched — not yet linked to a Case ({unmatched.length})
          </h3>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            {unmatched.map((programme) => (
              <ProgrammeRow key={programme.id} programme={programme} packSlug={packSlug} signedIn={signedIn} />
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
