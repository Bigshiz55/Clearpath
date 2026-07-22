'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Poster } from './PosterCard';
import { recordAnalyticsEvent } from '@/lib/actions/passFeedback';

interface Dial { key: string; label: string; lean: string; tier: string }
interface Pick { id: number; mediaType: 'movie' | 'tv'; title: string; year: number | null; posterUrl: string | null; personalScore: number; tier: string; reason: string | null }
interface Mirror {
  ready: boolean;
  samples: number;
  strength: number;
  persona: { title: string; blurb: string; traits: string[] };
  dials: Dial[];
  picks: Pick[];
}

/**
 * The DNA Mirror — shown at the taste-building payoff (quiz / State Your Case).
 * It reflects the user back to themselves (personality + leans) and proves it
 * with picks that follow from that read, then asks the one question that matters
 * for trust: "does this feel like you?" The answer is logged so we can measure —
 * across testers — how often the engine actually earns a "yes".
 */
export function DnaMirror({ onReplay }: { onReplay?: () => void }) {
  const [m, setM] = useState<Mirror | null>(null);
  const [failed, setFailed] = useState(false);
  const [vote, setVote] = useState<'yes' | 'not_quite' | null>(null);

  useEffect(() => {
    let active = true;
    fetch('/api/dna-mirror', { cache: 'no-store' })
      .then((r) => r.json())
      .then((d) => { if (active) setM(d as Mirror); })
      .catch(() => { if (active) setFailed(true); });
    return () => { active = false; };
  }, []);

  function say(v: 'yes' | 'not_quite') {
    setVote(v);
    void recordAnalyticsEvent('dna_mirror_feedback', { verdict: v, samples: m?.samples ?? 0, strength: m?.strength ?? null }).catch(() => {});
  }

  if (failed) {
    return (
      <div className="mt-8 card p-8 text-center">
        <div className="text-4xl">🧬</div>
        <h2 className="mt-3 text-xl font-bold text-white">Your DNA is building.</h2>
        <Link href="/app" className="btn-primary mt-5 inline-flex">See my recommendations →</Link>
      </div>
    );
  }
  if (!m) {
    return (
      <div className="mt-8 flex flex-col items-center gap-3 text-slate-400">
        <span className="h-8 w-8 animate-spin rounded-full border-2 border-white/20 border-t-brand-400" />
        <span className="text-sm">Reading your taste…</span>
      </div>
    );
  }

  const pct = `${m.strength.toFixed(0)}%`;

  return (
    <div className="mt-6 space-y-5">
      {/* The reflection */}
      <section className="card overflow-hidden p-0">
        <div className="bg-gradient-to-br from-brand-500/20 via-fuchsia-500/10 to-transparent p-5 sm:p-6">
          <div className="text-xs font-bold uppercase tracking-[0.15em] text-brand-300">Here’s what we read in your taste</div>
          <h2 className="mt-1 text-2xl font-extrabold text-white sm:text-3xl">🧬 {m.persona.title}</h2>
          <p className="mt-1.5 text-sm text-slate-200">{m.persona.blurb}</p>

          {/* The leans, in plain words */}
          {m.dials.length > 0 && (
            <div className="mt-3 flex flex-wrap gap-1.5">
              {m.dials.map((d) => (
                <span key={d.key} className="rounded-full border border-white/15 bg-white/10 px-3 py-1 text-xs font-semibold text-white">{d.lean}</span>
              ))}
            </div>
          )}

          {/* Honest about how sure we are. */}
          <div className="mt-3 text-xs font-semibold">
            {m.ready ? (
              <span className="text-emerald-200">Strong read · your DNA is {pct} formed — it sharpens every time you rate.</span>
            ) : (
              <span className="text-amber-200">Still getting to know you — rate a few more and this gets sharper fast.</span>
            )}
          </div>
        </div>
      </section>

      {/* The proof — picks that follow from that read */}
      {m.picks.length > 0 && (
        <section>
          <h3 className="mb-2 text-sm font-bold text-white">{m.ready ? 'Picks that follow from your DNA' : 'Starting points while we learn'}</h3>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
            {m.picks.map((p) => (
              <Link key={`${p.mediaType}-${p.id}`} href={`/app/title/${p.mediaType}/${p.id}`} className="card group flex flex-col overflow-hidden transition hover:border-white/25">
                <div className="relative aspect-[2/3] overflow-hidden bg-ink-800">
                  <Poster posterUrl={p.posterUrl} title={p.title} />
                  <span className="absolute right-1.5 top-1.5 rounded-md bg-black/70 px-1.5 py-0.5 text-xs font-black tabular-nums text-white ring-1 ring-white/20">{p.personalScore}</span>
                </div>
                <div className="flex flex-1 flex-col p-2">
                  <div className="line-clamp-1 text-xs font-bold text-white">{p.title}</div>
                  {p.reason && <div className="mt-0.5 line-clamp-2 text-[11px] leading-tight text-slate-400">{p.reason}</div>}
                </div>
              </Link>
            ))}
          </div>
        </section>
      )}

      {/* The trust question — the one metric that matters. */}
      <section className="card p-4 text-center">
        {vote == null ? (
          <>
            <div className="text-sm font-bold text-white">Does this feel like you?</div>
            <div className="mt-3 flex items-center justify-center gap-2">
              <button onClick={() => say('yes')} className="rounded-full border border-emerald-400/50 bg-emerald-500/15 px-4 py-2 text-sm font-bold text-emerald-100 transition hover:bg-emerald-500/25">👍 Nailed it</button>
              <button onClick={() => say('not_quite')} className="rounded-full border border-white/20 bg-white/5 px-4 py-2 text-sm font-bold text-slate-200 transition hover:bg-white/10">🤔 Not quite</button>
            </div>
          </>
        ) : vote === 'yes' ? (
          <div className="text-sm font-semibold text-emerald-200">Love it. The more you rate, the sharper it gets. 🧬</div>
        ) : (
          <div className="text-sm text-slate-200">
            Fair — rate a few more titles and it&apos;ll lock in tighter. You can also fine-tune any axis on your{' '}
            <Link href="/app/dna" className="font-bold text-brand-300 underline">Watch DNA page</Link>.
          </div>
        )}
      </section>

      <div className="flex flex-wrap justify-center gap-3">
        {onReplay && <button onClick={onReplay} className="btn-secondary">🔁 Rate another round</button>}
        <Link href="/app/watch" className="btn-primary">See all my recommendations →</Link>
      </div>
    </div>
  );
}
