'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';
import { qrForUrl } from '@/lib/actions/qr';
import { getMyTaste, type MyTaste } from '@/lib/actions/profile';
import type { PreferenceTrait } from '@/lib/types';
import { humanTrait } from '@/lib/scoring/traits';

const AVOIDABLE: PreferenceTrait[] = ['supernatural', 'paranormal', 'science_fiction', 'fantasy', 'noir', 'slow_burn'];
const LOVABLE: PreferenceTrait[] = ['grounded_crime', 'psychological_thriller', 'detective_mystery', 'domestic_thriller', 'serial_killer'];
const MOODS = [
  { key: 'any', label: 'Anything', emoji: '🎬' }, { key: 'light', label: 'Light', emoji: '🌤️' },
  { key: 'intense', label: 'Intense', emoji: '🔥' }, { key: 'funny', label: 'Funny', emoji: '😂' },
  { key: 'cinematic', label: 'Cinematic', emoji: '🎥' }, { key: 'short', label: 'Short', emoji: '⏱️' },
];
const REASONS = ['Too intense', 'Too long', 'Not in the mood', 'Seen it', 'Just no'];

interface Participant { id: string; name: string; voted: boolean; vetoIndex: number | null; vetoReason: string | null }
interface Finalist {
  id: number; mediaType: 'movie' | 'tv'; title: string; year: number | null; posterUrl: string | null;
  attributes: string[]; perMember: { name: string; score: number }[]; minScore: number; avgScore: number; streaming: string[];
}
interface State { status: 'lobby' | 'veto' | 'verdict'; mediaType: string; finalists: Finalist[] | null; participants: Participant[] }

export function LiveCourt({ code }: { code: string }) {
  const supabase = createClient();
  const [hostToken, setHostToken] = useState<string | null>(null);
  const [participantId, setParticipantId] = useState<string | null>(null);
  const [state, setState] = useState<State | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  // Join form
  const [name, setName] = useState('');
  const [mood, setMood] = useState('any');
  const [love, setLove] = useState<PreferenceTrait[]>([]);
  const [avoid, setAvoid] = useState<PreferenceTrait[]>([]);
  const [joining, setJoining] = useState(false);
  const [mine, setMine] = useState<MyTaste | null>(null);
  const [prefilled, setPrefilled] = useState(false);

  // Veto
  const [pendingVeto, setPendingVeto] = useState<number | null>(null);
  const [starting, setStarting] = useState(false);
  const [qr, setQr] = useState<string | null>(null);
  const [gaveled, setGaveled] = useState(false); // played the gavel-strike reveal
  const poll = useRef<ReturnType<typeof setInterval> | null>(null);

  const shareUrl = typeof window !== 'undefined' ? `${window.location.origin}/court/${code}` : '';
  async function showQr() {
    if (!shareUrl) return;
    const svg = await qrForUrl(shareUrl);
    setQr(svg);
  }

  useEffect(() => {
    try {
      setHostToken(localStorage.getItem(`court_host_${code}`));
      setParticipantId(localStorage.getItem(`court_part_${code}`));
    } catch { /* ignore */ }
    getMyTaste().then(setMine).catch(() => {});
  }, [code]);

  function useMyTaste() {
    if (!mine) return;
    if (mine.name) setName(mine.name);
    setLove(mine.love as PreferenceTrait[]);
    setAvoid(mine.avoid as PreferenceTrait[]);
    setPrefilled(true);
  }

  async function refresh() {
    const { data, error } = await supabase.rpc('court_state', { p_code: code });
    if (error) { if (error.code === '42P01') setErr('Live Court isn’t set up yet (run migration 0004).'); return; }
    if (data == null) { setNotFound(true); return; }
    setState(data as State);
  }

  useEffect(() => {
    void refresh();
    poll.current = setInterval(refresh, 1500);
    return () => { if (poll.current) clearInterval(poll.current); };
  }, [code]); // eslint-disable-line react-hooks/exhaustive-deps

  // Play the gavel-strike once when the verdict lands, then reveal the winner.
  useEffect(() => {
    if (state?.status === 'verdict' && !gaveled) {
      const t = setTimeout(() => setGaveled(true), 1650);
      return () => clearTimeout(t);
    }
  }, [state?.status, gaveled]);

  async function join() {
    if (!name.trim()) return;
    setJoining(true);
    const { data, error } = await supabase.rpc('court_join', { p_code: code, p_name: name.trim(), p_love: love, p_avoid: avoid, p_mood: mood });
    setJoining(false);
    if (error) { setErr(error.message); return; }
    const row = Array.isArray(data) ? data[0] : data;
    const pid = row?.participant_id as string;
    if (pid) { localStorage.setItem(`court_part_${code}`, pid); setParticipantId(pid); void refresh(); }
  }

  async function startCourt() {
    if (!hostToken) return;
    setStarting(true);
    const res = await fetch('/api/court/start', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ code, hostToken }) });
    const d = await res.json();
    setStarting(false);
    if (!res.ok) setErr(d.error ?? 'Could not start.');
    else void refresh();
  }

  async function castVeto(index: number | null, reason: string) {
    if (!participantId) return;
    await supabase.rpc('court_vote', { p_code: code, p_participant: participantId, p_index: index, p_reason: reason });
    setPendingVeto(null);
    void refresh();
  }
  async function reveal() {
    if (!hostToken) return;
    await supabase.rpc('court_reveal', { p_code: code, p_host_token: hostToken });
    void refresh();
  }

  if (notFound) {
    return <Shell><div className="card p-8 text-center"><div className="text-3xl">🔗</div><p className="mt-3 text-sm text-slate-400">This Court room doesn’t exist or has ended.</p><Link href="/app" className="btn-secondary mt-4 inline-flex">Open WatchVerdict →</Link></div></Shell>;
  }
  if (err) return <Shell><p className="card p-4 text-sm text-red-200">{err}</p></Shell>;
  if (!state) return <Shell><div className="text-sm text-slate-400">Connecting to the room…</div></Shell>;

  const me = state.participants.find((p) => p.id === participantId) ?? null;
  const toggle = (list: PreferenceTrait[], set: (v: PreferenceTrait[]) => void, t: PreferenceTrait) => set(list.includes(t) ? list.filter((x) => x !== t) : [...list, t]);
  const isHost = !!hostToken;

  // ---- JOIN ----
  if (!participantId && state.status === 'lobby') {
    return (
      <Shell>
        <div className="card p-5">
          <div className="text-sm font-semibold text-white">Join the Court — quick taste calibration</div>
          {mine?.signedIn && !prefilled && (mine.name || mine.love.length > 0 || mine.avoid.length > 0) && (
            <button onClick={useMyTaste} className="mt-3 w-full rounded-xl border border-brand-400/40 bg-brand-500/15 px-3 py-2 text-sm font-semibold text-brand-100">
              ✨ Use my WatchVerdict taste{mine.name ? ` (${mine.name})` : ''}
            </button>
          )}
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Your name" className="input mt-3" maxLength={40} />
          <div className="mt-3 text-xs font-semibold text-slate-300">Your mood tonight</div>
          <div className="mt-1 grid grid-cols-3 gap-2">
            {MOODS.map((m) => <button key={m.key} onClick={() => setMood(m.key)} className={`rounded-xl border py-2 text-xs font-semibold ${mood === m.key ? 'border-brand-400/50 bg-brand-500/20 text-brand-100' : 'border-white/15 bg-white/5 text-slate-300'}`}>{m.emoji} {m.label}</button>)}
          </div>
          <div className="mt-3 text-xs font-semibold text-emerald-200">Loves</div>
          <div className="mt-1 flex flex-wrap gap-1.5">{LOVABLE.map((t) => <TChip key={t} t={t} active={love.includes(t)} tone="love" onClick={() => toggle(love, setLove, t)} />)}</div>
          <div className="mt-3 text-xs font-semibold text-red-200">Hard no’s</div>
          <div className="mt-1 flex flex-wrap gap-1.5">{AVOIDABLE.map((t) => <TChip key={t} t={t} active={avoid.includes(t)} tone="avoid" onClick={() => toggle(avoid, setAvoid, t)} />)}</div>
          <button onClick={join} disabled={joining || !name.trim()} className="btn-primary mt-4 w-full py-3">{joining ? 'Joining…' : 'Join the Court'}</button>
        </div>
      </Shell>
    );
  }

  // ---- LOBBY ----
  if (state.status === 'lobby') {
    return (
      <Shell>
        <div className="card p-5 text-center">
          <div className="text-xs uppercase tracking-widest text-brand-300">Waiting room</div>
          <div className="mt-2 text-sm text-slate-300">{state.participants.length} in the room</div>
          <div className="mt-3 flex flex-wrap justify-center gap-2">
            {state.participants.map((p) => <span key={p.id} className="rounded-full bg-white/10 px-3 py-1 text-sm text-white">{p.name}</span>)}
          </div>

          <div className="mt-4 rounded-xl border border-white/10 bg-white/5 p-3">
            <div className="text-xs font-semibold text-slate-300">Invite the others</div>
            {qr ? (
              <div className="mx-auto mt-2 h-44 w-44 rounded-lg bg-white p-2" dangerouslySetInnerHTML={{ __html: qr }} />
            ) : (
              <button onClick={showQr} className="btn-secondary mt-2 text-sm">Show QR code</button>
            )}
            <p className="mt-2 break-all text-[11px] text-slate-400">{shareUrl}</p>
            <button onClick={() => navigator.clipboard?.writeText(shareUrl)} className="btn-ghost mt-1 text-xs">Copy link</button>
          </div>

          {isHost ? (
            <button onClick={startCourt} disabled={starting || state.participants.length < 2} className="btn-primary mt-5 w-full py-3">
              {starting ? 'Deliberating…' : state.participants.length < 2 ? 'Need 2+ to start' : '⚖️ Start the Court'}
            </button>
          ) : (
            <div className="mt-5 text-sm text-slate-400">Waiting for the host to start…</div>
          )}
        </div>
      </Shell>
    );
  }

  // ---- VETO ----
  if (state.status === 'veto' && state.finalists) {
    const votedCount = state.participants.filter((p) => p.voted).length;
    return (
      <Shell>
        <div className="mb-3 flex items-center justify-between text-sm text-slate-300">
          <span>Blind vote — judge the vibe, not the poster</span>
          <span className="rounded-full bg-white/10 px-2.5 py-1 text-xs font-bold">{votedCount}/{state.participants.length} voted</span>
        </div>
        {me?.voted ? (
          <div className="card p-6 text-center text-sm text-slate-300">
            <div className="text-3xl" aria-hidden>⚖️</div>
            <p className="mt-2">Your veto is in. Waiting for the others…</p>
            <div className="mx-auto mt-3 h-2 w-40 overflow-hidden rounded-full bg-white/10">
              <div className="h-full rounded-full bg-brand-500 transition-all" style={{ width: `${(votedCount / Math.max(1, state.participants.length)) * 100}%` }} />
            </div>
            <div className="mt-1 text-xs text-slate-400">{votedCount} of {state.participants.length} have ruled</div>
            {isHost && <button onClick={reveal} className="btn-secondary mt-4">Reveal the verdict now</button>}
          </div>
        ) : pendingVeto === null ? (
          <>
            <div className="space-y-2">
              {state.finalists.map((f, i) => (
                <button key={i} onClick={() => setPendingVeto(i)} className="flex w-full items-center gap-3 rounded-xl border border-white/10 bg-white/5 p-3 text-left hover:border-red-400/40 hover:bg-red-500/10">
                  <span className="grid h-8 w-8 flex-shrink-0 place-items-center rounded-lg bg-white/10 font-bold text-white">{String.fromCharCode(65 + i)}</span>
                  <span className="flex flex-wrap gap-1.5">{f.attributes.map((a, j) => <span key={j} className="rounded-full bg-white/10 px-2 py-0.5 text-[11px] text-slate-200">{a}</span>)}</span>
                </button>
              ))}
            </div>
            <button onClick={() => castVeto(null, '')} className="btn-secondary mt-3 w-full">I’m good with all three — no veto</button>
          </>
        ) : (
          <div className="card p-4">
            <div className="text-sm text-white">Veto <span className="font-bold">Option {String.fromCharCode(65 + pendingVeto)}</span> — why?</div>
            <div className="mt-3 flex flex-wrap gap-2">{REASONS.map((r) => <button key={r} onClick={() => castVeto(pendingVeto, r)} className="rounded-full border border-red-400/40 bg-red-500/15 px-3 py-1.5 text-xs font-semibold text-red-100">{r}</button>)}</div>
            <button onClick={() => setPendingVeto(null)} className="btn-ghost mt-3 text-xs">Back</button>
          </div>
        )}
      </Shell>
    );
  }

  // ---- VERDICT ----
  if (state.status === 'verdict' && state.finalists) {
    const finalists = state.finalists;
    const vetoCount = finalists.map((_, i) => state.participants.filter((p) => p.vetoIndex === i).length);
    const nonVetoed = finalists.map((f, i) => ({ f, i })).filter((x) => vetoCount[x.i] === 0);
    const pool = nonVetoed.length ? nonVetoed : finalists.map((f, i) => ({ f, i }));
    const winner = pool.reduce((a, b) => (nonVetoed.length ? (b.f.minScore > a.f.minScore ? b : a) : (vetoCount[b.i]! < vetoCount[a.i]! ? b : a)));
    const w = winner.f;
    const lines: string[] = [];
    const above85 = finalists.filter((f) => f.minScore >= 85);
    lines.push(w.minScore >= 85 && above85.length === 1 ? `The only finalist above 85 for all ${w.perMember.length}.` : `Highest floor — nobody scored it below ${w.minScore}.`);
    finalists.forEach((f, i) => {
      if (i === winner.i) return;
      const vs = state.participants.filter((p) => p.vetoIndex === i);
      const bestAvg = f.avgScore >= Math.max(...finalists.map((x) => x.avgScore));
      if (vs.length) lines.push(`${f.title}${bestAvg ? ` had the highest average (${f.avgScore}) but` : ' —'} took a “${vs[0]!.vetoReason ?? 'no'}” veto${vs.length > 1 ? ` from ${vs.length} people` : ` from ${vs[0]!.name}`}.`);
      else { const low = f.perMember.reduce((a, b) => (b.score < a.score ? b : a)); lines.push(`${f.title} fell short — ${low.name} only gave it ${low.score}.`); }
    });
    // The gavel-strike moment — a brief "ORDER!" reveal before the winner shows.
    if (!gaveled) {
      return (
        <Shell>
          <div className="grid min-h-[60vh] place-items-center text-center">
            <div>
              <div className="wv-gavel text-7xl" aria-hidden>⚖️</div>
              <div className="wv-order mt-4 text-2xl font-black uppercase tracking-[0.2em] text-gold-300">Order in the court</div>
              <div className="mt-2 text-sm text-slate-400">The judge is handing down the verdict…</div>
            </div>
          </div>
        </Shell>
      );
    }
    return (
      <Shell>
        <div className="wv-verdict-in">
          <div className="text-center">
            <div className="inline-flex items-center gap-1.5 rounded-full border border-gold-400/40 bg-gold-500/15 px-3 py-1 text-[11px] font-black uppercase tracking-[0.15em] text-gold-200">
              <span aria-hidden>🔨</span> The verdict is in
            </div>
            <p className="mt-3 text-sm text-slate-300">The court hereby rules in favor of…</p>
            <h2 className="mt-1 text-3xl font-extrabold text-white sm:text-4xl">{w.title}</h2>
            {w.year && <div className="text-slate-400">({w.year})</div>}
          </div>
          <div className="mt-4 flex justify-center">
            <Link href={`/app/title/${w.mediaType}/${w.id}`} className="h-52 w-36 overflow-hidden rounded-xl border border-gold-400/50 shadow-glow ring-2 ring-gold-300/40">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              {w.posterUrl ? <img src={w.posterUrl} alt="" className="h-full w-full object-cover" /> : null}
            </Link>
          </div>
          {w.streaming.length > 0 && <div className="mt-2 text-center text-xs text-slate-400">📺 {w.streaming.join(', ')}</div>}
          <div className="mt-5 card p-4">
            <div className="text-xs font-bold uppercase tracking-wide text-slate-400">The Judge’s reasoning</div>
            <ul className="mt-2 space-y-1.5 text-sm text-slate-200">{lines.map((l, i) => <li key={i} className="flex gap-2"><span className="text-brand-300">•</span>{l}</li>)}</ul>
            <p className="mt-2 text-[11px] text-slate-500">From the real per-person scores and vetoes — no guessing.</p>
          </div>
          <div className="mt-5 grid gap-2 sm:grid-cols-2">
            <Link href={`/app/title/${w.mediaType}/${w.id}`} className="btn-primary inline-flex justify-center">
              ▶ Open {w.title.length > 18 ? 'the winner' : w.title} →
            </Link>
            <Link href="/app/together" className="btn-secondary inline-flex justify-center">⚖️ New round</Link>
          </div>
        </div>
      </Shell>
    );
  }

  return <Shell><div className="text-sm text-slate-400">Loading…</div></Shell>;
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-dvh">
      <header className="container-page flex h-16 items-center">
        <span className="text-lg font-bold tracking-tight text-white">Watch<span className="text-brand-300">Verdict</span> · ⚖️ Court</span>
      </header>
      <main className="container-page mx-auto max-w-md py-4">{children}</main>
    </div>
  );
}

function TChip({ t, active, tone, onClick }: { t: PreferenceTrait; active: boolean; tone: 'love' | 'avoid'; onClick: () => void }) {
  const on = tone === 'love' ? 'border-emerald-400/50 bg-emerald-500/20 text-emerald-100' : 'border-red-400/50 bg-red-500/20 text-red-100';
  return <button type="button" onClick={onClick} className={`rounded-full border px-3 py-1 text-xs font-medium transition ${active ? on : 'border-white/15 bg-white/5 text-slate-300'}`}>{humanTrait(t)}</button>;
}
