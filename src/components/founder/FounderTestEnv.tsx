import Link from 'next/link';
import { createClient } from '@/lib/supabase/server';
import { serverEnv } from '@/lib/env';
import {
  founderByKey,
  resolveFounderAccess,
  denyMessage,
  type FounderKey,
  type AccessConfig,
  type AccessResult,
} from '@/lib/founder/access';
import { listSessions, sessionsAvailable } from '@/lib/founder/sessions';
import { activeSession } from '@/lib/founder/sessionModel';
import { FounderSessions, toView } from '@/components/founder/FounderSessions';
import { getWatchStats } from '@/lib/watchStats';
import { getUserDimensionProfile } from '@/lib/titleDimensions';
import { describePersonality } from '@/lib/scoring/personality';
import { dnaStrength, tasteDials } from '@/lib/scoring/dimensions';
import { loadDnaConfidence, countCalibrationAnswers } from '@/lib/preference/dnaSignals';
import { calibrationProgress } from '@/lib/preference/calibration';
import { DnaConfidencePanel } from '@/components/DnaConfidencePanel';
import { RecommendationSlate } from '@/components/RecommendationSlate';
import { WatchVerdictWordmark } from '@/components/WatchVerdictWordmark';

/**
 * The gated shell for a single founder test environment (/TestScott,
 * /TestHeather, /TestAmy). It is the SECURITY BOUNDARY: it resolves the verified
 * signed-in identity server-side and decides — from the server-only founder /
 * admin allowlists — whether this exact person may enter this exact route.
 *
 * A founder may enter ONLY their own route; an admin/owner may enter any (for
 * support); everyone else sees an access-denied screen and is NEVER shown
 * another founder's environment. Data isolation underneath is enforced by RLS
 * (every row keyed to the founder's own user_id); this is the route gate.
 */
export async function FounderTestEnv({ founder }: { founder: FounderKey }) {
  const meta = founderByKey(founder);

  // Verify identity from the request cookies. Any config/auth failure is treated
  // as "not signed in" — a founder route must fail closed, never 500 open.
  let email: string | null = null;
  let userId = '';
  let supabase: ReturnType<typeof createClient> | null = null;
  try {
    supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    email = user?.email ?? null;
    userId = user?.id ?? '';
  } catch {
    email = null;
    supabase = null;
  }

  const cfg: AccessConfig = {
    founderEmails: serverEnv.founderEmails(),
    adminEmails: serverEnv.adminEmails(),
  };
  const access = resolveFounderAccess(email, founder, cfg);

  if (!access.allowed || !supabase) {
    return <AccessDenied founderName={meta.name} access={access} />;
  }

  // Load this founder's sessions + a snapshot of what their DNA has learned so
  // far. Everything here is fail-open: a missing migration or read error still
  // renders the environment (the founder's ratings work regardless).
  const [migrationReady, sessions, stats] = await Promise.all([
    sessionsAvailable(supabase).catch(() => false),
    listSessions(supabase, userId, founder).catch(() => []),
    getWatchStats(supabase, userId).catch(() => null),
  ]);
  const rated = stats?.rated ?? 0;
  const profile = await getUserDimensionProfile(supabase, userId, rated).catch(() => null);
  const persona = profile ? describePersonality(profile) : null;
  const strength = profile ? dnaStrength(profile) : 0;
  const dials = profile ? tasteDials(profile, 5) : [];
  const dnaReady = (profile?.samples ?? 0) >= 3;

  // The active named session scopes this founder's calibration + confidence, so
  // "Scott Main" and "Scott Fresh DNA" learn independently. Session-scoped DNA
  // Confidence + Quiz Progress are the two separate metrics (never mirror).
  const active = activeSession(sessions);
  const sessionId = active?.id;
  const [confResult, calAnswered] = await Promise.all([
    loadDnaConfidence(supabase, userId, sessionId ? { sessionId } : {})
      .then((r) => r.confidence)
      .catch(() => null),
    countCalibrationAnswers(supabase, userId, sessionId).catch(() => 0),
  ]);
  const quizProgress = calibrationProgress(calAnswered);
  const quizHref = sessionId ? `/app/quiz?session=${encodeURIComponent(sessionId)}` : '/app/quiz';

  return (
    <div className="min-h-dvh bg-slate-950 text-white">
      <header className="border-b border-white/10 bg-black/40 backdrop-blur">
        <div className="mx-auto flex max-w-3xl items-center justify-between gap-3 px-4 py-3">
          <Link href="/app" className="text-lg" aria-label="WatchVerdict home">
            <WatchVerdictWordmark />
          </Link>
          <TestModeBadge label={meta.badge} owner={access.isOwner} />
        </div>
      </header>

      <main className="mx-auto max-w-3xl space-y-6 px-4 py-8">
        <section className="rounded-2xl border border-white/10 bg-white/5 p-5 sm:p-6">
          <div className="text-[11px] font-bold uppercase tracking-[0.18em] text-brand-300">
            Founder test environment
          </div>
          <h1 className="mt-1 text-2xl font-black sm:text-3xl">{meta.name}&rsquo;s Watch DNA lab</h1>
          <p className="mt-2 text-sm text-slate-300">
            This is a private, isolated founder identity. Everything you rate here builds{' '}
            <span className="font-semibold text-white">{meta.name}&rsquo;s own Watch DNA</span> — separate from every
            other founder and excluded from customer analytics.
          </p>

          <dl className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Field label="Signed in as" value={email ?? '—'} />
            <Field label="Founder profile" value={meta.name} />
            <Field label="Access" value={access.isOwner ? 'Owner / admin (support access)' : `${meta.name} (founder)`} />
            <Field label="Data scope" value="Isolated · test-only · not in analytics" />
          </dl>

          {access.isOwner && (
            <p className="mt-4 rounded-lg border border-amber-400/30 bg-amber-400/10 px-3 py-2 text-xs text-amber-200">
              You are viewing <span className="font-semibold">{meta.name}</span>&rsquo;s environment as owner/admin for
              support. Ratings you make here are recorded against this founder account.
            </p>
          )}
        </section>

        {/* Two SEPARATE metrics for the active session — never mirror each other. */}
        <section className="grid grid-cols-2 gap-3">
          <div className="rounded-2xl border border-white/10 bg-black/25 p-4" data-testid="founder-quiz-progress">
            <div className="text-[10px] font-bold uppercase tracking-wide text-slate-400">Quiz Progress</div>
            <div className="mt-1 text-3xl font-black tabular-nums text-brand-200">{quizProgress.percent}%</div>
            <div className="text-[11px] text-slate-500">{Math.min(calAnswered, quizProgress.size)} of {quizProgress.size} · onboarding</div>
          </div>
          <div className="rounded-2xl border border-emerald-400/20 bg-emerald-500/5 p-4" data-testid="founder-dna-confidence">
            <div className="text-[10px] font-bold uppercase tracking-wide text-emerald-300/90">Watch DNA Confidence</div>
            <div className="mt-1 text-3xl font-black tabular-nums text-emerald-300">{confResult?.percent ?? 0}%</div>
            <div className="text-[11px] text-slate-500">how well we know {active?.name ?? meta.name}</div>
          </div>
        </section>

        {confResult && <DnaConfidencePanel result={confResult} />}

        {/* What this founder's DNA has learned so far — the before/after signal. */}
        <section className="rounded-2xl border border-white/10 bg-white/5 p-5 sm:p-6">
          <div className="flex items-center justify-between gap-3">
            <h2 className="text-lg font-bold text-white">Learned Watch DNA</h2>
            <Link href="/app/dna" className="text-sm font-semibold text-brand-300 hover:text-brand-200">
              Full DNA →
            </Link>
          </div>
          {dnaReady && persona ? (
            <div className="mt-3">
              <div className="flex flex-wrap items-center gap-2">
                <span className="rounded-full border border-brand-400/40 bg-brand-500/15 px-3 py-1 text-sm font-bold text-brand-100">
                  {persona.title}
                </span>
                <span className="text-xs text-slate-400">
                  {rated} rated · DNA strength {strength}
                </span>
              </div>
              {dials.length > 0 && (
                <ul className="mt-3 flex flex-wrap gap-1.5">
                  {dials.map((d) => (
                    <li
                      key={d.dim.key}
                      className="rounded-full border border-white/10 bg-white/5 px-2.5 py-1 text-[11px] text-slate-200"
                    >
                      {d.lean}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          ) : (
            <p className="mt-3 rounded-xl border border-white/10 bg-black/20 px-3 py-3 text-sm text-slate-300">
              No DNA yet for {meta.name}. Rate a few titles below and a learned profile appears here — the &ldquo;before&rdquo;
              you can compare future sessions against.
            </p>
          )}
        </section>

        <FounderSessions
          founder={founder}
          founderName={meta.name}
          sessions={sessions.map(toView)}
          migrationReady={migrationReady}
        />

        {/* Refresh Recommendations — preserves DNA, new slate, validated + logged. */}
        <section className="rounded-2xl border border-white/10 bg-white/5 p-5 sm:p-6">
          <RecommendationSlate surface="founder" sessionId={sessionId} />
        </section>

        <section className="rounded-2xl border border-white/10 bg-white/5 p-5 sm:p-6">
          <h2 className="text-lg font-bold">Enter the product as {meta.name}</h2>
          <p className="mt-1 text-sm text-slate-400">
            Use the real WatchVerd1ct experience — your ratings and recommendations here belong to this founder identity
            {active ? <> · session <span className="font-semibold text-white">{active.name}</span></> : null}.
          </p>
          <div className="mt-4 flex flex-wrap gap-2">
            <Link href={quizHref} className="btn-primary">
              Build Watch DNA
            </Link>
            <Link href="/app/dna" className="btn-secondary">
              View learned DNA
            </Link>
            <Link href="/app" className="btn-secondary">
              Recommendations
            </Link>
          </div>
        </section>

        <p className="text-center text-[11px] text-slate-500">
          Test mode · not indexed · {meta.name} founder identity
        </p>
      </main>
    </div>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-white/10 bg-black/20 px-3 py-2">
      <dt className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">{label}</dt>
      <dd className="mt-0.5 truncate text-sm font-medium text-white" title={value}>
        {value}
      </dd>
    </div>
  );
}

function TestModeBadge({ label, owner }: { label: string; owner: boolean }) {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full border border-fuchsia-400/40 bg-fuchsia-500/15 px-3 py-1 text-[11px] font-black uppercase tracking-[0.14em] text-fuchsia-200">
      <span aria-hidden className="inline-block h-1.5 w-1.5 rounded-full bg-fuchsia-400" />
      {label}
      {owner && <span className="text-amber-300">· OWNER</span>}
    </span>
  );
}

function AccessDenied({ founderName, access }: { founderName: string; access: AccessResult }) {
  return (
    <div className="flex min-h-dvh items-center justify-center bg-slate-950 px-4 text-white">
      <div className="w-full max-w-md rounded-2xl border border-white/10 bg-white/5 p-6 text-center">
        <div className="text-3xl" aria-hidden>
          🔒
        </div>
        <h1 className="mt-2 text-xl font-bold">{founderName} test environment</h1>
        <p className="mt-2 text-sm text-slate-300">{denyMessage(access)}</p>

        {access.reason === 'not_signed_in' && (
          <Link
            href={`/login?next=${encodeURIComponent(founderByKey(access.founder).route)}`}
            className="btn-primary mt-4 inline-flex"
          >
            Sign in
          </Link>
        )}
        {access.reason === 'wrong_founder' && access.authorizedRoute && (
          <Link href={access.authorizedRoute} className="btn-primary mt-4 inline-flex">
            Go to your environment
          </Link>
        )}
      </div>
    </div>
  );
}
