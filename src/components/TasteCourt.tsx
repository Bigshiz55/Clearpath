'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import type { PreferenceTrait } from '@/lib/types';
import { ShareCard, CourtCardArt } from './ShareCards';

export interface CourtMember {
  name: string;
  love: PreferenceTrait[] | string[];
  avoid: PreferenceTrait[] | string[];
}

interface PerMember { name: string; score: number; vetoed: boolean; mood: string }
interface Finalist {
  id: number; mediaType: 'movie' | 'tv'; title: string; year: number | null; posterUrl: string | null;
  attributes: string[]; genres: string[]; perMember: PerMember[]; minScore: number; avgScore: number; streaming: string[];
}
interface Veto { idx: number; by: string; reason: string }

const MOODS = [
  { key: 'any', label: 'Anything', emoji: '🎬' },
  { key: 'light', label: 'Light', emoji: '🌤️' },
  { key: 'intense', label: 'Intense', emoji: '🔥' },
  { key: 'funny', label: 'Funny', emoji: '😂' },
  { key: 'cinematic', label: 'Cinematic', emoji: '🎥' },
  { key: 'short', label: 'Short', emoji: '⏱️' },
];
const REASONS = ['Too intense', 'Too long', 'Not in the mood', 'Seen it', 'Just no'];
const CLOCK = 90;

export function TasteCourt({
  members, mediaType = 'any', boostGenres = [], excludeKeys = [], onClose, onWinnerLogged,
}: {
  members: CourtMember[];
  mediaType?: 'any' | 'movie' | 'tv';
  boostGenres?: string[];
  excludeKeys?: string[];
  onClose: () => void;
  onWinnerLogged?: (f: Finalist, outcome: 'loved' | 'fine' | 'nope') => void;
}) {
  const [phase, setPhase] = useState<'mood' | 'loading' | 'veto' | 'verdict'>('mood');
  const [moodIdx, setMoodIdx] = useState(0);
  const [moods, setMoods] = useState<string[]>(() => members.map(() => 'any'));
  const [finalists, setFinalists] = useState<Finalist[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [vetoIdx, setVetoIdx] = useState(0); // whose turn to veto
  const [vetoes, setVetoes] = useState<Veto[]>([]);
  const [pendingVeto, setPendingVeto] = useState<number | null>(null); // finalist index chosen, awaiting reason
  const [clock, setClock] = useState(CLOCK);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);
  const [logged, setLogged] = useState(false);
  const [showShare, setShowShare] = useState(false);

  async function deliberate(finalMoods: string[]) {
    setPhase('loading');
    try {
      const res = await fetch('/api/court', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          members: members.map((m, i) => ({ name: m.name, love: m.love, avoid: m.avoid, mood: finalMoods[i] ?? 'any' })),
          mediaType, boostGenres, excludeKeys,
        }),
      });
      const data = await res.json();
      if (!res.ok || data.error) { setError(data.error ?? 'The court could not convene.'); return; }
      const f = (data.finalists ?? []) as Finalist[];
      if (f.length === 0) { setError('No finalists survived the exclusions.'); return; }
      setFinalists(f);
      setVetoIdx(0);
      setPhase('veto');
    } catch {
      setError('Network error. Try again.');
    }
  }

  // 90-second clock during the veto phase.
  useEffect(() => {
    if (phase !== 'veto') return;
    timer.current = setInterval(() => {
      setClock((c) => {
        if (c <= 1) {
          if (timer.current) clearInterval(timer.current);
          setPhase('verdict');
          return 0;
        }
        return c - 1;
      });
    }, 1000);
    return () => { if (timer.current) clearInterval(timer.current); };
  }, [phase]);

  function pickMood(key: string) {
    const next = [...moods];
    next[moodIdx] = key;
    setMoods(next);
    if (moodIdx + 1 < members.length) setMoodIdx(moodIdx + 1);
    else void deliberate(next);
  }

  function castVeto(reason: string) {
    if (pendingVeto === null) return;
    setVetoes((v) => [...v, { idx: pendingVeto, by: members[vetoIdx]!.name, reason }]);
    setPendingVeto(null);
    advanceVeto();
  }
  function passVeto() {
    setPendingVeto(null);
    advanceVeto();
  }
  function advanceVeto() {
    if (vetoIdx + 1 < members.length) setVetoIdx(vetoIdx + 1);
    else { if (timer.current) clearInterval(timer.current); setPhase('verdict'); }
  }

  // ---- decide winner ----
  const vetoCount = finalists.map((_, i) => vetoes.filter((v) => v.idx === i).length);
  let winnerIdx = 0;
  if (finalists.length) {
    const nonVetoed = finalists.map((f, i) => ({ f, i })).filter((x) => vetoCount[x.i] === 0);
    const pool = nonVetoed.length ? nonVetoed : finalists.map((f, i) => ({ f, i }));
    winnerIdx = pool.reduce((a, b) => {
      if (nonVetoed.length) return b.f.minScore > a.f.minScore ? b : a;
      return vetoCount[b.i]! < vetoCount[a.i]! || (vetoCount[b.i] === vetoCount[a.i] && b.f.minScore > a.f.minScore) ? b : a;
    }).i;
  }

  function judgeLines(): string[] {
    const lines: string[] = [];
    const w = finalists[winnerIdx];
    if (!w) return lines;
    const above85 = finalists.filter((f) => f.minScore >= 85);
    if (w.minScore >= 85 && above85.length === 1) lines.push(`It’s the only finalist above 85 for all ${w.perMember.length}.`);
    else lines.push(`Highest floor of the three — nobody scored it below ${w.minScore}.`);
    finalists.forEach((f, i) => {
      if (i === winnerIdx) return;
      const vs = vetoes.filter((v) => v.idx === i);
      const bestAvg = f.avgScore >= Math.max(...finalists.map((x) => x.avgScore));
      if (vs.length) {
        lines.push(`${f.title}${bestAvg ? ` had the highest average (${f.avgScore}) but` : ' —'} took a “${vs[0]!.reason}” veto${vs.length > 1 ? ` from ${vs.length} people` : ` from ${vs[0]!.by}`}.`);
      } else {
        const low = f.perMember.reduce((a, b) => (b.score < a.score ? b : a));
        lines.push(`${f.title} fell short — ${low.name} only gave it ${low.score}.`);
      }
    });
    return lines;
  }

  const label = (i: number) => String.fromCharCode(65 + i); // A, B, C

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-ink-950/95 backdrop-blur">
      <div className="mx-auto max-w-lg px-4 py-6">
        <div className="mb-4 flex items-center justify-between">
          <div className="text-sm font-bold text-white">⚖️ The 90-Second Taste Court</div>
          <button onClick={onClose} className="btn-ghost text-xs">Close</button>
        </div>

        {error && (
          <div className="card p-6 text-center">
            <p className="text-sm text-red-200">{error}</p>
            <button onClick={onClose} className="btn-secondary mt-4">Back</button>
          </div>
        )}

        {/* Phase: mood (pass the phone) */}
        {!error && phase === 'mood' && (
          <div className="card p-6 text-center">
            <div className="text-xs uppercase tracking-wide text-slate-400">Pass the phone to</div>
            <div className="mt-1 text-2xl font-extrabold text-white">{members[moodIdx]?.name}</div>
            <p className="mt-1 text-sm text-slate-400">What’s your mood tonight? (private)</p>
            <div className="mt-4 grid grid-cols-3 gap-2">
              {MOODS.map((m) => (
                <button key={m.key} onClick={() => pickMood(m.key)} className="rounded-xl border border-white/15 bg-white/5 py-3 text-sm font-semibold text-slate-200 hover:bg-white/10">
                  <div className="text-xl">{m.emoji}</div>{m.label}
                </button>
              ))}
            </div>
            <div className="mt-4 text-xs text-slate-500">{moodIdx + 1} / {members.length}</div>
          </div>
        )}

        {!error && phase === 'loading' && (
          <div className="card flex flex-col items-center gap-3 p-10 text-center">
            <span className="h-8 w-8 animate-spin rounded-full border-2 border-white/20 border-t-brand-400" />
            <div className="text-sm text-slate-300">The court is deliberating…</div>
            <div className="text-xs text-slate-500">Weighing {members.length} tastes against the field</div>
          </div>
        )}

        {/* Phase: blind veto */}
        {!error && phase === 'veto' && (
          <div>
            <div className="mb-3 flex items-center justify-between">
              <div className="text-sm text-slate-300">Pass to <span className="font-bold text-white">{members[vetoIdx]?.name}</span> — one veto</div>
              <div className={`rounded-full px-2.5 py-1 text-xs font-bold tabular-nums ${clock <= 15 ? 'bg-red-500/20 text-red-200' : 'bg-white/10 text-slate-200'}`}>⏱ {clock}s</div>
            </div>
            <p className="mb-3 text-xs text-slate-500">Titles are hidden on purpose — judge them on the vibe, not the poster.</p>
            {pendingVeto === null ? (
              <>
                <div className="space-y-2">
                  {finalists.map((f, i) => (
                    <button key={i} onClick={() => setPendingVeto(i)} className="flex w-full items-center gap-3 rounded-xl border border-white/10 bg-white/5 p-3 text-left hover:border-red-400/40 hover:bg-red-500/10">
                      <span className="grid h-8 w-8 flex-shrink-0 place-items-center rounded-lg bg-white/10 font-bold text-white">{label(i)}</span>
                      <span className="flex flex-wrap gap-1.5">
                        {f.attributes.map((a, j) => (
                          <span key={j} className="rounded-full bg-white/10 px-2 py-0.5 text-[11px] text-slate-200">{a}</span>
                        ))}
                      </span>
                    </button>
                  ))}
                </div>
                <button onClick={passVeto} className="btn-secondary mt-3 w-full">I’m good with all three — no veto</button>
              </>
            ) : (
              <div className="card p-4">
                <div className="text-sm text-white">Veto <span className="font-bold">Option {label(pendingVeto)}</span> — why?</div>
                <div className="mt-3 flex flex-wrap gap-2">
                  {REASONS.map((r) => (
                    <button key={r} onClick={() => castVeto(r)} className="rounded-full border border-red-400/40 bg-red-500/15 px-3 py-1.5 text-xs font-semibold text-red-100">{r}</button>
                  ))}
                </div>
                <button onClick={() => setPendingVeto(null)} className="btn-ghost mt-3 text-xs">Back</button>
              </div>
            )}
            <div className="mt-3 text-center text-xs text-slate-500">{vetoIdx + 1} / {members.length} voting</div>
          </div>
        )}

        {/* Phase: verdict */}
        {!error && phase === 'verdict' && finalists[winnerIdx] && (
          <div>
            <div className="text-center">
              <div className="text-xs uppercase tracking-widest text-brand-300">The Verdict</div>
              <h2 className="mt-1 text-3xl font-extrabold text-white">{finalists[winnerIdx]!.title}</h2>
              {finalists[winnerIdx]!.year && <div className="text-slate-400">({finalists[winnerIdx]!.year})</div>}
            </div>
            <div className="mt-4 flex justify-center">
              <Link href={`/app/title/${finalists[winnerIdx]!.mediaType}/${finalists[winnerIdx]!.id}`} className="h-52 w-36 overflow-hidden rounded-xl border border-brand-400/40 shadow-glow">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                {finalists[winnerIdx]!.posterUrl ? <img src={finalists[winnerIdx]!.posterUrl!} alt="" className="h-full w-full object-cover" /> : null}
              </Link>
            </div>
            <div className="mt-3 flex flex-wrap justify-center gap-1.5">
              {finalists[winnerIdx]!.perMember.map((pm) => (
                <span key={pm.name} className="rounded-full bg-white/10 px-2 py-0.5 text-[11px] font-semibold text-slate-200">{pm.name} {pm.score}</span>
              ))}
            </div>
            {finalists[winnerIdx]!.streaming.length > 0 && (
              <div className="mt-2 text-center text-xs text-slate-400">📺 {finalists[winnerIdx]!.streaming.join(', ')}</div>
            )}

            <div className="mt-5 card p-4">
              <div className="text-xs font-bold uppercase tracking-wide text-slate-400">The Judge’s reasoning</div>
              <ul className="mt-2 space-y-1.5 text-sm text-slate-200">
                {judgeLines().map((l, i) => (
                  <li key={i} className="flex gap-2"><span className="text-brand-300">•</span>{l}</li>
                ))}
              </ul>
              <p className="mt-2 text-[11px] text-slate-500">Every line is from the real per-person scores and vetoes — no guessing.</p>
            </div>

            <div className="mt-5">
              {onWinnerLogged && !logged ? (
                <div className="flex items-center justify-center gap-2">
                  <span className="text-xs text-slate-400">How’d it go:</span>
                  <button onClick={() => { onWinnerLogged(finalists[winnerIdx]!, 'loved'); setLogged(true); }} className="rounded-lg border border-emerald-400/40 bg-emerald-500/15 px-2.5 py-1 text-xs text-emerald-100">👍 Loved</button>
                  <button onClick={() => { onWinnerLogged(finalists[winnerIdx]!, 'fine'); setLogged(true); }} className="rounded-lg border border-white/15 bg-white/5 px-2.5 py-1 text-xs text-slate-200">😐 Fine</button>
                  <button onClick={() => { onWinnerLogged(finalists[winnerIdx]!, 'nope'); setLogged(true); }} className="rounded-lg border border-red-400/40 bg-red-500/15 px-2.5 py-1 text-xs text-red-100">👎 Nope</button>
                </div>
              ) : logged ? (
                <div className="text-center text-xs text-slate-400">Logged to your crew’s DNA ✓</div>
              ) : null}
              <button onClick={() => setShowShare(true)} className="btn-secondary mt-3 w-full">📸 Share this verdict</button>
              <button onClick={onClose} className="btn-primary mt-2 w-full">Done — let’s watch</button>
            </div>

            {showShare && (
              <div className="fixed inset-0 z-50 grid place-items-center bg-black/80 p-4" onClick={() => setShowShare(false)}>
                <div onClick={(e) => e.stopPropagation()}>
                  <ShareCard filename="watchverdict-court">
                    <CourtCardArt
                      title={finalists[winnerIdx]!.title}
                      oneLiner={judgeLines()[0] ?? finalists[winnerIdx]!.attributes.slice(0, 3).join(' · ')}
                      members={finalists[winnerIdx]!.perMember.map((pm) => ({ name: pm.name, score: pm.score }))}
                    />
                  </ShareCard>
                  <button onClick={() => setShowShare(false)} className="btn-ghost mt-2 w-full text-sm">Close</button>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
