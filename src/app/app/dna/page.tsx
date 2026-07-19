import Link from 'next/link';
import type { Metadata } from 'next';
import { createClient } from '@/lib/supabase/server';
import { getUserDimensionProfile } from '@/lib/titleDimensions';
import { getWatchStats } from '@/lib/watchStats';
import { topDials } from '@/lib/scoring/dimensions';
import { describePersonality } from '@/lib/scoring/personality';
import { ShareCard, WatchDnaCardArt } from '@/components/ShareCards';

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
  const profile = await getUserDimensionProfile(supabase, uid, stats.rated);
  const dials = topDials(profile, 8);
  const persona = describePersonality(profile);

  const ready = profile.samples >= 3;

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div>
        <h1 className="flex items-center gap-2 text-2xl font-bold text-white sm:text-3xl">🧬 Your Watch DNA</h1>
        <p className="mt-1 text-sm text-slate-400">Your taste, learned from what you rate — the axes you lean on and how you watch.</p>
      </div>

      {/* Personality */}
      <section className="card overflow-hidden p-0">
        <div className="bg-gradient-to-br from-brand-500/20 via-fuchsia-500/10 to-transparent p-5 sm:p-6">
          <div className="text-xs font-bold uppercase tracking-[0.15em] text-brand-300">Your watch personality</div>
          <h2 className="mt-1 text-2xl font-extrabold text-white sm:text-3xl">{persona.title}</h2>
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

      {/* Behavioral stats */}
      <section className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat label="Rated" value={String(stats.rated)} />
        <Stat label="Finish rate" value={pct(stats.finishRate)} hint={stats.finishRate != null ? `${stats.finished} of ${stats.finished + stats.abandoned}` : 'watch a few'} />
        <Stat label="⭐ Favourites" value={String(stats.favourites)} />
        <Stat label="Avg. days to watch" value={stats.avgDaysToWatch == null ? '—' : stats.avgDaysToWatch < 1 ? 'same day' : String(Math.round(stats.avgDaysToWatch))} />
      </section>

      {/* Taste dials */}
      <section className="card p-5 sm:p-6">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-bold text-white">Your taste dials</h2>
          <Link href="/app/quiz" className="text-sm font-semibold text-brand-300 hover:text-brand-200">Rate more →</Link>
        </div>
        {ready && dials.length > 0 ? (
          <div className="mt-4 space-y-3.5">
            {dials.map((d) => {
              const strong = Math.abs(d.pref - 50) >= 25;
              return (
                <div key={d.dim.key}>
                  <div className="mb-1 flex items-center justify-between text-xs">
                    <span className="text-slate-400">{d.dim.low}</span>
                    <span className={`font-bold ${strong ? 'text-brand-200' : 'text-slate-200'}`}>{d.lean}</span>
                    <span className="text-slate-400">{d.dim.high}</span>
                  </div>
                  <div className="relative h-2 rounded-full bg-white/10">
                    <span className="absolute left-1/2 top-1/2 h-3 w-px -translate-y-1/2 bg-white/25" />
                    <span
                      className="absolute top-1/2 h-4 w-4 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white bg-brand-500 shadow"
                      style={{ left: `${d.pref}%` }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <div className="mt-4 rounded-xl border border-white/10 bg-white/5 p-5 text-center">
            <div className="text-3xl">🍿</div>
            <p className="mt-2 text-sm text-slate-300">Rate a few titles and your dials will appear here.</p>
            <Link href="/app/quiz" className="btn-primary mt-3 inline-flex">Play the Taste Quiz →</Link>
          </div>
        )}
        {ready && <p className="mt-4 text-[11px] text-slate-500">Learned from {profile.samples} rated titles. The more you rate, the sharper it gets.</p>}
      </section>

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
              />
            </ShareCard>
          </div>
        </section>
      )}
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
