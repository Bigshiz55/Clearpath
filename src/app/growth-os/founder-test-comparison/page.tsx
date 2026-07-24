import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { isAdminEmail } from '@/lib/admin';
import { resolveFounderSnapshots, type FounderSnapshot } from '@/lib/founder/directory';
import { founderByKey } from '@/lib/founder/access';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = {
  title: 'Founder test comparison · Growth OS',
  robots: { index: false, follow: false },
};

/**
 * Owner-only side-by-side of the three founder test identities (Scott / Heather
 * / Amy): what each one's isolated Watch DNA has learned and how active their
 * sessions are. This is TEST data — kept out of customer analytics by design
 * (founder rows carry is_test=true).
 */
export default async function FounderComparisonPage() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user || !isAdminEmail(user.email)) notFound();

  const snapshots = await resolveFounderSnapshots();

  return (
    <div className="min-h-dvh bg-slate-950 px-4 py-8 text-white">
      <div className="mx-auto max-w-5xl">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="text-[11px] font-bold uppercase tracking-[0.18em] text-brand-300">Growth OS · owner</div>
            <h1 className="mt-1 text-2xl font-black sm:text-3xl">Founder test comparison</h1>
          </div>
          <span className="rounded-full border border-fuchsia-400/40 bg-fuchsia-500/15 px-3 py-1 text-[11px] font-black uppercase tracking-[0.14em] text-fuchsia-200">
            Test data · excluded from analytics
          </span>
        </div>
        <p className="mt-2 max-w-2xl text-sm text-slate-400">
          Three genuinely separate founder identities, each with its own sign-in account and isolated Watch DNA. This
          view reads across all three (owner-only) so you can compare what each has learned. Founder activity never
          enters customer analytics.
        </p>

        <div className="mt-6 grid grid-cols-1 gap-4 md:grid-cols-3">
          {snapshots.map((s) => (
            <FounderColumn key={s.key} s={s} />
          ))}
        </div>

        <p className="mt-6 text-center text-[11px] text-slate-500">
          Snapshots reflect current stored DNA. &ldquo;Not provisioned&rdquo; means the founder email isn&rsquo;t linked
          to a real sign-in account yet.
        </p>
      </div>
    </div>
  );
}

function FounderColumn({ s }: { s: FounderSnapshot }) {
  const route = founderByKey(s.key).route;
  return (
    <div className="rounded-2xl border border-white/10 bg-white/5 p-5">
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-lg font-bold">{s.name}</h2>
        <StatusPill s={s} />
      </div>
      <div className="mt-0.5 truncate text-[11px] text-slate-500" title={s.email ?? ''}>
        {s.email ?? 'no email configured'}
      </div>

      {s.provisioned ? (
        <dl className="mt-4 space-y-3">
          <Metric label="Persona" value={s.personaTitle ?? 'Forming…'} />
          <Metric label="DNA strength" value={String(s.strength)} />
          <Metric label="Titles rated" value={String(s.rated)} />
          <Metric label="Sessions" value={`${s.activeSessions} active · ${s.sessionCount} total`} />
          {s.topLeans.length > 0 && (
            <div>
              <dt className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">Top leans</dt>
              <dd className="mt-1 flex flex-wrap gap-1.5">
                {s.topLeans.map((l) => (
                  <span key={l} className="rounded-full border border-white/10 bg-white/5 px-2 py-0.5 text-[11px] text-slate-200">
                    {l}
                  </span>
                ))}
              </dd>
            </div>
          )}
        </dl>
      ) : (
        <p className="mt-4 rounded-xl border border-white/10 bg-black/20 px-3 py-3 text-sm text-slate-300">
          {s.configured
            ? 'Email configured, but no sign-in account exists yet. Provision the founder account to start comparing.'
            : 'No founder email configured for this environment.'}
        </p>
      )}

      <Link href={route} className="btn-secondary mt-4 inline-flex text-sm">
        Open {s.name}&rsquo;s lab →
      </Link>
    </div>
  );
}

function StatusPill({ s }: { s: FounderSnapshot }) {
  const label = s.provisioned ? 'Provisioned' : s.configured ? 'Not linked' : 'Unset';
  const cls = s.provisioned
    ? 'border-emerald-400/40 bg-emerald-500/15 text-emerald-200'
    : s.configured
      ? 'border-amber-400/40 bg-amber-500/15 text-amber-200'
      : 'border-white/15 bg-white/5 text-slate-300';
  return <span className={`rounded-full border px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide ${cls}`}>{label}</span>;
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-3 border-b border-white/5 pb-2">
      <dt className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">{label}</dt>
      <dd className="truncate text-sm font-semibold text-white" title={value}>
        {value}
      </dd>
    </div>
  );
}
