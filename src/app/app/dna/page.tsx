import Link from 'next/link';
import type { Metadata } from 'next';
import { createClient } from '@/lib/supabase/server';
import { getUserDimensionProfile } from '@/lib/titleDimensions';
import { getWatchStats } from '@/lib/watchStats';
import { tasteDials, dnaStrength } from '@/lib/scoring/dimensions';
import { describePersonality } from '@/lib/scoring/personality';
import { ShareCard, WatchDnaCardArt } from '@/components/ShareCards';
import { TasteDials } from '@/components/TasteDials';
import { DnaConfidencePanel } from '@/components/DnaConfidencePanel';
import { RecommendationSlate } from '@/components/RecommendationSlate';
import { Top10Slate } from '@/components/Top10Slate';
import { loadDnaConfidence } from '@/lib/preference/dnaSignals';
import { RetiredInterviewNotice } from '@/components/RetiredInterviewNotice';
import { getPackActivitySummary } from '@/lib/packs/profileSummary';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Your Watch DNA' };

function pct(n: number | null): string {
  return n == null ? '—' : `${Math.round(n * 100)}%`;
}

export default async function WatchDnaPage() {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  const uid = user?.id ?? '';

  const stats = await getWatchStats(supabase, uid);
  const { confidence: dnaConfidence } = await loadDnaConfidence(supabase, uid);
  // Fail-open: Pack tables may not exist yet on an environment that hasn't
  // applied the Packs migrations, and this summary should never block the
  // rest of the DNA page over that.
  const packActivity = await getPackActivitySummary(supabase, uid).catch(() => ({ seenCount: 0, followingCount: 0 }));
  const profile = await getUserDimensionProfile(supabase, uid, stats.rated);
  const dials = tasteDials(profile, 8);
  const persona = describePersonality(profile);
  const dnaScore = dnaStrength(profile);

  const ready = profile.samples >= 3;

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div>
        <h1 className="flex items-center gap-2 text-2xl font-bold text-white sm:text-3xl">🧬 Your Watch DNA</h1>
        <p className="mt-1 text-sm text-slate-400">Your taste, learned from what you rate — the axes you lean on and how you watch.</p>
      </div>

      <RetiredInterviewNotice />

      {/* Three ways in, in the order of what they cost you. Your DNA also keeps
          growing on its own from what you do across the app — rating, saving,
          passing — so none of these is a gate you have to pass before
          WatchVerd1ct is useful. */}
      <section data-testid="dna-build">
        <h2 className="text-sm font-bold uppercase tracking-wide text-slate-400">Build your Watch DNA</h2>
        <div className="mt-2 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <Link href="/app/taste-quiz" className="card p-4 transition hover:bg-white/10" data-testid="link-taste-quiz">
            <div className="flex items-center gap-2 text-base font-bold text-white">
              <span aria-hidden>🎬</span> Taste Quiz
            </div>
            <p className="mt-1 text-sm text-slate-400">
              Tap the real titles you recognise — good or not — and say what you thought of the ones
              you have already seen. Ignoring one costs nothing.
            </p>
          </Link>
          <Link href="/app/rapid-fire" className="card p-4 transition hover:bg-white/10" data-testid="link-rapid-fire">
            <div className="flex items-center gap-2 text-base font-bold text-white">
              <span aria-hidden>⚡️</span> Rapid Fire
            </div>
            <p className="mt-1 text-sm text-slate-400">
              Import your history, then rate it at a tap a title. Turns &ldquo;you pressed play&rdquo; into
              something worth ranking on. Try it on sample data first.
            </p>
          </Link>
          <Link href="/import-taste" className="card p-4 transition hover:bg-white/10" data-testid="link-import-taste">
            <div className="flex items-center gap-2 text-base font-bold text-white">
              <span aria-hidden>📄</span> Import your history
            </div>
            <p className="mt-1 text-sm text-slate-400">
              Bring in titles you have watched, rated, saved or abandoned. You review everything
              first — watched is never read as liked.
            </p>
          </Link>
        </div>
        <p className="mt-2 text-xs text-slate-500" data-testid="dna-grows">
          Your DNA also keeps learning from what you do — ratings, saves, passes and the titles you
          finish or give up on.
        </p>
        {/* Kept visibly apart: a permanent profile and tonight's request are not
            the same function, and merging them is how both get worse. */}
        <p className="mt-3 text-xs text-slate-500" data-testid="tonight-separate">
          Looking for something to watch <em>right now</em> instead?{' '}
          <Link href="/app" className="font-semibold text-brand-300 underline underline-offset-2" data-testid="link-tonight">
            Describe exactly what you want tonight
          </Link>{' '}
          — that is a one-off brief, and it does not change your DNA.
        </p>
      </section>

      {/* Personality */}
      <section className="card overflow-hidden p-0">
        <div className="bg-gradient-to-br from-brand-500/20 via-fuchsia-500/10 to-transparent p-5 sm:p-6">
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0">
              <div className="text-xs font-bold uppercase tracking-[0.15em] text-brand-300">Your watch personality</div>
              <h2 className="mt-1 text-2xl font-extrabold text-white sm:text-3xl">{persona.title}</h2>
            </div>
            <DnaScoreBadge score={dnaScore} />
          </div>
          <p className="mt-1.5 text-sm text-slate-200">{persona.blurb}</p>
          {persona.traits.length > 0 && (
            <div className="mt-3 flex flex-wrap gap-1.5">
              {persona.traits.map((t) => (
                <span key={t} className="rounded-full border border-white/15 bg-white/10 px-3 py-1 text-xs font-semibold text-white">{t}</span>
              ))}
            </div>
          )}
        </div>
      </section>

      {/* DNA Confidence — separate from onboarding progress, with its evidence */}
      <DnaConfidencePanel result={dnaConfidence} />

      {/* Behavioral stats */}
      <section className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat label="Rated" value={String(stats.rated)} />
        <Stat label="Finish rate" value={pct(stats.finishRate)} hint={stats.finishRate != null ? `${stats.finished} of ${stats.finished + stats.abandoned}` : 'watch a few'} />
        <Stat label="⭐ Favorites" value={String(stats.favorites)} />
        <Stat label="Avg. days to watch" value={stats.avgDaysToWatch == null ? '—' : stats.avgDaysToWatch < 1 ? 'same day' : String(Math.round(stats.avgDaysToWatch))} />
      </section>

      {/* Pack activity — a separate, honest count (not merged into the stats
          above): Pack content has no reliable id bridge to the main TMDB-keyed
          watchlist, so this stays its own number rather than a forced join. */}
      <Link href="/packs" className="card flex items-center justify-between p-4 transition hover:bg-white/10" data-testid="pack-activity-link">
        <div>
          <div className="text-xs font-semibold uppercase tracking-wide text-slate-400">Packs</div>
          <div className="mt-1 text-sm text-slate-300">
            {packActivity.seenCount > 0 || packActivity.followingCount > 0
              ? `${packActivity.seenCount} marked seen · following ${packActivity.followingCount}`
              : 'Hallmark Universe, Lifetime Movie Vault, Crime Case Files'}
          </div>
        </div>
        <span aria-hidden className="text-slate-500">→</span>
      </Link>

      {/* Taste dials */}
      <section className="card p-5 sm:p-6">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-bold text-white">Your taste dials</h2>
          <div className="flex items-center gap-3">
            <Link href="/app/dna/packs" className="text-sm font-semibold text-emerald-300 hover:text-emerald-200">🎯 Boosters</Link>
            <Link href="/app/taste-quiz" className="text-sm font-semibold text-brand-300 hover:text-brand-200">Rate more →</Link>
          </div>
        </div>
        {ready && dials.length > 0 ? (
          <TasteDials
            dials={dials.map((d) => ({
              key: d.dim.key,
              label: d.dim.label,
              low: d.dim.low,
              high: d.dim.high,
              pref: d.pref,
              lean: d.lean,
              tier: d.tier,
              confidence: d.confidence,
              samples: d.samples,
              pinned: d.pinned,
              isLimit: d.isLimit,
            }))}
          />
        ) : (
          <div className="mt-4 rounded-xl border border-white/10 bg-white/5 p-5 text-center">
            <div className="text-3xl">🍿</div>
            <p className="mt-2 text-sm text-slate-300">Rate a few titles and your dials will appear here.</p>
            <div className="mt-3 flex flex-wrap justify-center gap-2">
              <Link href="/app/taste-quiz" className="btn-primary inline-flex">Take the Quick Taste Quiz →</Link>
              <Link
                href="/import-taste"
                className="inline-flex items-center rounded-lg border border-white/15 px-4 py-2 text-sm font-semibold text-slate-200 transition hover:bg-white/10"
              >
                Or import your history →
              </Link>
            </div>
          </div>
        )}
        {ready && (
          <p className="mt-4 text-[11px] text-slate-500">
            Learned from {profile.samples} rated titles — the more you rate, the sharper it gets. Tap{' '}
            <span className="font-semibold text-slate-400">Adjust</span> on any dial to correct it yourself; a dealbreaker
            steers your recommendations hard away (and becomes a hard filter as content-advisory data lands).
          </p>
        )}
      </section>

      {/* The Top 10, with the arithmetic behind every number one tap away. */}
      {ready && (
        <section>
          <Top10Slate />
        </section>
      )}

      {/* Fresh, refreshable, validated recommendations — refresh preserves DNA */}
      {ready && (
        <section className="card p-5 sm:p-6">
          <RecommendationSlate surface="dna" />
        </section>
      )}

      {/* Shareable card */}
      {ready && (
        <section className="card p-5 sm:p-6">
          <h2 className="text-lg font-bold text-white">Share your Watch DNA</h2>
          <p className="mt-0.5 text-sm text-slate-400">Save the card or share it — see who matches your taste.</p>
          <div className="mt-4">
            <ShareCard filename="my-watch-dna">
              <WatchDnaCardArt
                title={persona.title}
                blurb={persona.blurb}
                traits={persona.traits}
                dials={dials.slice(0, 5).map((d) => ({ label: d.dim.label, low: d.dim.low, high: d.dim.high, pref: d.pref, lean: d.lean }))}
                finishRate={stats.finishRate}
                rated={stats.rated}
                dnaScore={dnaScore}
              />
            </ShareCard>
          </div>
        </section>
      )}
    </div>
  );
}

/** A cool circular "Watch DNA score" gauge — how developed the taste profile is. */
function DnaScoreBadge({ score }: { score: number }) {
  const r = 26;
  const c = 2 * Math.PI * r;
  const dash = (Math.max(0, Math.min(100, score)) / 100) * c;
  const tier = score >= 75 ? 'Elite' : score >= 50 ? 'Sharp' : score >= 25 ? 'Forming' : 'New';
  return (
    <div className="flex flex-none flex-col items-center">
      <div className="relative h-[68px] w-[68px]">
        <svg viewBox="0 0 68 68" className="h-full w-full -rotate-90">
          <circle cx="34" cy="34" r={r} fill="none" stroke="rgba(255,255,255,0.12)" strokeWidth="6" />
          <circle
            cx="34"
            cy="34"
            r={r}
            fill="none"
            stroke="url(#dnaGauge)"
            strokeWidth="6"
            strokeLinecap="round"
            strokeDasharray={`${dash} ${c}`}
          />
          <defs>
            <linearGradient id="dnaGauge" x1="0" y1="0" x2="1" y2="1">
              <stop offset="0%" stopColor="#a855f7" />
              <stop offset="100%" stopColor="#ff1493" />
            </linearGradient>
          </defs>
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className="text-xl font-black tabular-nums leading-none text-white">{score}</span>
        </div>
      </div>
      <div className="mt-1 text-[10px] font-bold uppercase tracking-wide text-brand-300">DNA · {tier}</div>
    </div>
  );
}

function Stat({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="card p-4">
      <div className="text-xs font-semibold uppercase tracking-wide text-slate-400">{label}</div>
      <div className="mt-1 text-2xl font-black tabular-nums text-white">{value}</div>
      {hint && <div className="mt-0.5 text-[11px] text-slate-500">{hint}</div>}
    </div>
  );
}
