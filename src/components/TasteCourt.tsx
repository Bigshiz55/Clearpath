'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import type { PreferenceTrait } from '@/lib/types';
import { ShareCard, CourtCardArt } from './ShareCards';
import { useI18n } from '@/i18n/I18nProvider';

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
  { key: 'any', emoji: '🎬' },
  { key: 'light', emoji: '🌤️' },
  { key: 'intense', emoji: '🔥' },
  { key: 'funny', emoji: '😂' },
  { key: 'cinematic', emoji: '🎥' },
  { key: 'short', emoji: '⏱️' },
];
const REASON_KEYS = ['tooIntense', 'tooLong', 'notInMood', 'seenIt', 'justNo'];
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
  const { t, plural } = useI18n();
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
      if (!res.ok || data.error) { setError(data.error ?? t('together.courtCouldNotConvene')); return; }
      const f = (data.finalists ?? []) as Finalist[];
      if (f.length === 0) { setError(t('together.noFinalists')); return; }
      setFinalists(f);
      setVetoIdx(0);
      setPhase('veto');
    } catch {
      setError(t('together.networkErrorShort'));
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
    if (w.minScore >= 85 && above85.length === 1) lines.push(t('together.judgeOnlyAbove85', { count: w.perMember.length }));
    else lines.push(t('together.judgeHighestFloor', { score: w.minScore }));
    finalists.forEach((f, i) => {
      if (i === winnerIdx) return;
      const vs = vetoes.filter((v) => v.idx === i);
      const bestAvg = f.avgScore >= Math.max(...finalists.map((x) => x.avgScore));
      if (vs.length) {
        const avgClause = bestAvg ? t('together.judgeAvgClause', { avg: f.avgScore }) : t('together.judgeDash');
        const fromClause = vs.length > 1 ? t('together.judgeFromPeople', { count: vs.length }) : t('together.judgeFromPerson', { name: vs[0]!.by });
        lines.push(t('together.judgeVetoLine', { title: f.title, avgClause, reason: vs[0]!.reason, fromClause }));
      } else {
        const low = f.perMember.reduce((a, b) => (b.score < a.score ? b : a));
        lines.push(t('together.judgeFellShort', { title: f.title, name: low.name, score: low.score }));
      }
    });
    return lines;
  }

  const label = (i: number) => String.fromCharCode(65 + i); // A, B, C

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-ink-950/95 backdrop-blur">
      <div className="mx-auto max-w-lg px-4 py-6">
        <div className="mb-4 flex items-center justify-between">
          <div className="text-sm font-bold text-white">⚖️ {t('together.court90Title')}</div>
          <button onClick={onClose} className="btn-ghost text-xs">{t('together.close')}</button>
        </div>

        {error && (
          <div className="card p-6 text-center">
            <p className="text-sm text-red-200">{error}</p>
            <button onClick={onClose} className="btn-secondary mt-4">{t('together.back')}</button>
          </div>
        )}

        {/* Phase: mood (pass the phone) */}
        {!error && phase === 'mood' && (
          <div className="card p-6 text-center">
            <div className="text-xs uppercase tracking-wide text-slate-400">{t('together.passPhoneTo')}</div>
            <div className="mt-1 text-2xl font-extrabold text-white">{members[moodIdx]?.name}</div>
            <p className="mt-1 text-sm text-slate-400">{t('together.moodQuestion')}</p>
            <div className="mt-4 grid grid-cols-3 gap-2">
              {MOODS.map((m) => (
                <button key={m.key} onClick={() => pickMood(m.key)} className="rounded-xl border border-white/15 bg-white/5 py-3 text-sm font-semibold text-slate-200 hover:bg-white/10">
                  <div className="text-xl">{m.emoji}</div>{t(`together.mood.${m.key}`)}
                </button>
              ))}
            </div>
            <div className="mt-4 text-xs text-slate-500">{moodIdx + 1} / {members.length}</div>
          </div>
        )}

        {!error && phase === 'loading' && (
          <div className="card flex flex-col items-center gap-3 p-10 text-center">
            <span className="h-8 w-8 animate-spin rounded-full border-2 border-white/20 border-t-brand-400" />
            <div className="text-sm text-slate-300">{t('together.courtDeliberating')}</div>
            <div className="text-xs text-slate-500">{plural('together.weighingTastes', members.length, {})}</div>
          </div>
        )}

        {/* Phase: blind veto */}
        {!error && phase === 'veto' && (
          <div>
            <div className="mb-3 flex items-center justify-between">
              <div className="text-sm text-slate-300">{t('together.passTo')}<span className="font-bold text-white">{members[vetoIdx]?.name}</span>{t('together.oneVetoSuffix')}</div>
              <div className={`rounded-full px-2.5 py-1 text-xs font-bold tabular-nums ${clock <= 15 ? 'bg-red-500/20 text-red-200' : 'bg-white/10 text-slate-200'}`}>⏱ {clock}s</div>
            </div>
            <p className="mb-3 text-xs text-slate-500">{t('together.titlesHidden')}</p>
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
                <button onClick={passVeto} className="btn-secondary mt-3 w-full">{t('together.noVeto')}</button>
              </>
            ) : (
              <div className="card p-4">
                <div className="text-sm text-white">{t('together.vetoPrefix')}<span className="font-bold">{t('together.optionLabel', { label: label(pendingVeto) })}</span>{t('together.vetoWhy')}</div>
                <div className="mt-3 flex flex-wrap gap-2">
                  {REASON_KEYS.map((rk) => {
                    const rl = t(`together.reason.${rk}`);
                    return (
                      <button key={rk} onClick={() => castVeto(rl)} className="rounded-full border border-red-400/40 bg-red-500/15 px-3 py-1.5 text-xs font-semibold text-red-100">{rl}</button>
                    );
                  })}
                </div>
                <button onClick={() => setPendingVeto(null)} className="btn-ghost mt-3 text-xs">{t('together.back')}</button>
              </div>
            )}
            <div className="mt-3 text-center text-xs text-slate-500">{vetoIdx + 1} / {members.length} {t('together.voting')}</div>
          </div>
        )}

        {/* Phase: verdict */}
        {!error && phase === 'verdict' && finalists[winnerIdx] && (
          <div>
            <div className="text-center">
              <div className="text-xs uppercase tracking-widest text-brand-300">{t('together.theVerdict')}</div>
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
              <div className="text-xs font-bold uppercase tracking-wide text-slate-400">{t('together.judgesReasoning')}</div>
              <ul className="mt-2 space-y-1.5 text-sm text-slate-200">
                {judgeLines().map((l, i) => (
                  <li key={i} className="flex gap-2"><span className="text-brand-300">•</span>{l}</li>
                ))}
              </ul>
              <p className="mt-2 text-[11px] text-slate-500">{t('together.everyLineReal')}</p>
            </div>

            <div className="mt-5">
              {onWinnerLogged && !logged ? (
                <div className="flex items-center justify-center gap-2">
                  <span className="text-xs text-slate-400">{t('together.howdItGo')}</span>
                  <button onClick={() => { onWinnerLogged(finalists[winnerIdx]!, 'loved'); setLogged(true); }} className="rounded-lg border border-emerald-400/40 bg-emerald-500/15 px-2.5 py-1 text-xs text-emerald-100">👍 {t('together.loved')}</button>
                  <button onClick={() => { onWinnerLogged(finalists[winnerIdx]!, 'fine'); setLogged(true); }} className="rounded-lg border border-white/15 bg-white/5 px-2.5 py-1 text-xs text-slate-200">😐 {t('together.fine')}</button>
                  <button onClick={() => { onWinnerLogged(finalists[winnerIdx]!, 'nope'); setLogged(true); }} className="rounded-lg border border-red-400/40 bg-red-500/15 px-2.5 py-1 text-xs text-red-100">👎 {t('together.nope')}</button>
                </div>
              ) : logged ? (
                <div className="text-center text-xs text-slate-400">{t('together.loggedJuryDna')}</div>
              ) : null}
              <button onClick={() => setShowShare(true)} className="btn-secondary mt-3 w-full">📸 {t('together.shareVerdict')}</button>
              <button onClick={onClose} className="btn-primary mt-2 w-full">{t('together.doneWatch')}</button>
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
                  <button onClick={() => setShowShare(false)} className="btn-ghost mt-2 w-full text-sm">{t('together.close')}</button>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
