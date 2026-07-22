'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';
import { qrForUrl } from '@/lib/actions/qr';
import { getMyTaste, type MyTaste } from '@/lib/actions/profile';

const MOODS = [
  { key: 'any', label: 'Anything', emoji: '🎬' }, { key: 'light', label: 'Light', emoji: '🌤️' },
  { key: 'intense', label: 'Intense', emoji: '🔥' }, { key: 'funny', label: 'Funny', emoji: '😂' },
  { key: 'cinematic', label: 'Cinematic', emoji: '🎥' }, { key: 'short', label: 'Short', emoji: '⏱️' },
];

interface Pick { id: number; mediaType: 'movie' | 'tv'; title: string; year: number | null; posterPath: string | null }
interface SearchHit extends Pick { posterUrl: string | null; overview: string }
interface Participant { id: string; name: string; pickCount?: number }
interface PerMember { name: string; score: number; picked: boolean }
interface Finalist {
  rank: number; id: number; mediaType: 'movie' | 'tv'; title: string; year: number | null; posterUrl: string | null;
  attributes: string[]; genres: string[]; perMember: PerMember[]; pickedBy: string[]; fit: number; minScore: number; avgScore: number; streaming: string[];
}
interface State { status: 'lobby' | 'veto' | 'verdict'; mediaType: string; finalists: Finalist[] | null; participants: Participant[] }

const keyOf = (p: { mediaType: string; id: number }) => `${p.mediaType}-${p.id}`;

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
  const [joining, setJoining] = useState(false);
  const [mine, setMine] = useState<MyTaste | null>(null);

  // My wishlist (source of truth for me; DB stores it via court_set_picks).
  const [picks, setPicks] = useState<Pick[]>([]);
  const [q, setQ] = useState('');
  const [hits, setHits] = useState<SearchHit[]>([]);
  const [searching, setSearching] = useState(false);

  const [starting, setStarting] = useState(false);
  const [busy, setBusy] = useState(false);
  const [qr, setQr] = useState<string | null>(null);
  const [gaveled, setGaveled] = useState(false);
  const poll = useRef<ReturnType<typeof setInterval> | null>(null);

  const shareUrl = typeof window !== 'undefined' ? `${window.location.origin}/court/${code}` : '';
  async function showQr() {
    if (!shareUrl) return;
    setQr(await qrForUrl(shareUrl));
  }
  async function invite() {
    if (!shareUrl) return;
    const share = (navigator as Navigator & { share?: (d: ShareData) => Promise<void> }).share;
    if (share) {
      try { await share({ title: 'Join my WatchVerdict Court', text: 'Help us pick what to watch — tap to join:', url: shareUrl }); return; } catch { /* cancelled */ }
    }
    try { await navigator.clipboard?.writeText(shareUrl); setErr(null); } catch { /* ignore */ }
  }

  useEffect(() => {
    try {
      setHostToken(localStorage.getItem(`court_host_${code}`));
      setParticipantId(localStorage.getItem(`court_part_${code}`));
      const saved = localStorage.getItem(`court_picks_${code}`);
      if (saved) setPicks(JSON.parse(saved) as Pick[]);
    } catch { /* ignore */ }
    getMyTaste().then(setMine).catch(() => {});
  }, [code]);

  async function refresh() {
    const { data, error } = await supabase.rpc('court_state', { p_code: code });
    if (error) { if (error.code === '42P01') setErr('Live Court isn’t set up yet — run the latest Supabase migrations (0004 + 0014).'); return; }
    if (data == null) { setNotFound(true); return; }
    setState(data as State);
  }

  useEffect(() => {
    void refresh();
    poll.current = setInterval(refresh, 1500);
    return () => { if (poll.current) clearInterval(poll.current); };
  }, [code]); // eslint-disable-line react-hooks/exhaustive-deps

  // Play the gavel-strike once when the ruling first lands.
  useEffect(() => {
    if (state?.status === 'verdict' && !gaveled) {
      const t = setTimeout(() => setGaveled(true), 1500);
      return () => clearTimeout(t);
    }
  }, [state?.status, gaveled]);

  async function join() {
    if (!name.trim()) return;
    setJoining(true);
    const { data, error } = await supabase.rpc('court_join', { p_code: code, p_name: name.trim(), p_love: [], p_avoid: [], p_mood: mood });
    setJoining(false);
    if (error) { setErr(error.message); return; }
    const row = Array.isArray(data) ? data[0] : data;
    const pid = row?.participant_id as string;
    if (pid) {
      try { localStorage.setItem(`court_part_${code}`, pid); } catch { /* ignore */ }
      setParticipantId(pid);
      if (picks.length) void savePicks(picks, pid);
      void refresh();
    }
  }

  // ---- Wishlist search ----
  useEffect(() => {
    const term = q.trim();
    if (term.length < 2) { setHits([]); return; }
    setSearching(true);
    const id = setTimeout(async () => {
      try {
        const res = await fetch(`/api/search?q=${encodeURIComponent(term)}`);
        const d = await res.json();
        setHits((d.results ?? []) as SearchHit[]);
      } catch { setHits([]); } finally { setSearching(false); }
    }, 300);
    return () => clearTimeout(id);
  }, [q]);

  async function savePicks(next: Pick[], pid = participantId) {
    try { localStorage.setItem(`court_picks_${code}`, JSON.stringify(next)); } catch { /* ignore */ }
    if (!pid) return;
    try {
      await supabase.rpc('court_set_picks', { p_code: code, p_participant: pid, p_picks: next });
      refresh();
    } catch {
      /* the local copy is already saved; a sync retry happens on the next change */
    }
  }
  function addPick(h: SearchHit) {
    if (picks.length >= 8 || picks.some((p) => keyOf(p) === keyOf(h))) return;
    const next = [...picks, { id: h.id, mediaType: h.mediaType, title: h.title, year: h.year, posterPath: h.posterPath }];
    setPicks(next); setQ(''); setHits([]); void savePicks(next);
  }
  function removePick(k: string) {
    const next = picks.filter((p) => keyOf(p) !== k);
    setPicks(next); void savePicks(next);
  }

  async function startCourt() {
    if (!hostToken) return;
    setStarting(true);
    const res = await fetch('/api/court/start', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ code, hostToken }) });
    const d = await res.json();
    setStarting(false);
    if (!res.ok || d.error) setErr(d.error ?? 'Could not start.');
    else void refresh();
  }

  async function repick(action: 'veto' | 'more', index?: number) {
    setBusy(true);
    setErr(null);
    const res = await fetch('/api/court/repick', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code, action, index, hostToken: hostToken ?? undefined, participantId: participantId ?? undefined }),
    });
    const d = await res.json();
    setBusy(false);
    if (!res.ok || d.error) setErr(d.error ?? 'Could not update the ruling.');
    else void refresh();
  }

  if (notFound) {
    return <Shell><div className="card p-8 text-center"><div className="text-3xl">🔗</div><p className="mt-3 text-sm text-slate-400">This Court room doesn’t exist or has ended.</p><Link href="/app" className="btn-secondary mt-4 inline-flex">Open WatchVerdict →</Link></div></Shell>;
  }
  if (!state) return <Shell><div className="text-sm text-slate-400">Connecting to the room…</div></Shell>;

  const isHost = !!hostToken;
  const anyPicks = (state.participants ?? []).some((p) => (p.pickCount ?? 0) > 0);

  // ---- JOIN ----
  if (!participantId && state.status === 'lobby') {
    return (
      <Shell>
        <div className="card p-5">
          <div className="text-sm font-semibold text-white">Join the Court</div>
          <p className="mt-1 text-xs text-slate-400">Add your name, then search for what <span className="font-semibold text-slate-200">you</span> want to watch. The judge weighs everyone’s picks together.</p>
          {mine?.signedIn && mine.name && (
            <button onClick={() => setName(mine.name!)} className="mt-3 w-full rounded-xl border border-brand-400/40 bg-brand-500/15 px-3 py-2 text-sm font-semibold text-brand-100">✨ I’m {mine.name}</button>
          )}
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Your name" className="input mt-3" maxLength={40} />
          <div className="mt-3 text-xs font-semibold text-slate-300">Your mood tonight</div>
          <div className="mt-1 grid grid-cols-3 gap-2">
            {MOODS.map((m) => <button key={m.key} onClick={() => setMood(m.key)} className={`rounded-xl border py-2 text-xs font-semibold ${mood === m.key ? 'border-brand-400/50 bg-brand-500/20 text-brand-100' : 'border-white/15 bg-white/5 text-slate-300'}`}>{m.emoji} {m.label}</button>)}
          </div>
          {err && <p className="mt-3 text-xs text-red-300">{err}</p>}
          <button onClick={join} disabled={joining || !name.trim()} className="btn-primary mt-4 w-full py-3">{joining ? 'Joining…' : 'Join the Court →'}</button>
        </div>
      </Shell>
    );
  }

  // ---- LOBBY (join done → build your wishlist) ----
  if (state.status === 'lobby') {
    return (
      <Shell>
        {/* Your wishlist */}
        <div className="card p-5">
          <div className="flex items-center justify-between">
            <div className="text-sm font-semibold text-white">What do you want to watch?</div>
            <span className="text-xs text-slate-400">{picks.length}/8</span>
          </div>
          <p className="mt-1 text-xs text-slate-400">Search real movies & shows and add the ones you’re into. The judge blends them with everyone else’s.</p>

          <div className="relative mt-3">
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="🔎 Search a movie or show…" className="input" />
            {(hits.length > 0 || searching) && (
              <div className="absolute z-10 mt-1 max-h-72 w-full overflow-auto rounded-xl border border-white/10 bg-ink-900 shadow-xl">
                {searching && hits.length === 0 && <div className="p-3 text-xs text-slate-500">Searching…</div>}
                {hits.map((h) => {
                  const already = picks.some((p) => keyOf(p) === keyOf(h));
                  return (
                    <button key={keyOf(h)} onClick={() => addPick(h)} disabled={already || picks.length >= 8} className="flex w-full items-center gap-3 border-b border-white/5 p-2 text-left hover:bg-white/5 disabled:opacity-40">
                      <span className="h-14 w-10 flex-none overflow-hidden rounded bg-ink-800">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        {h.posterUrl ? <img src={h.posterUrl} alt="" className="h-full w-full object-cover" /> : null}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-semibold text-white">{h.title} {h.year ? <span className="text-slate-500">({h.year})</span> : null}</span>
                        <span className="block text-[11px] uppercase tracking-wide text-slate-500">{h.mediaType === 'tv' ? 'TV series' : 'Movie'}</span>
                      </span>
                      <span className="flex-none text-brand-300">{already ? '✓' : '＋'}</span>
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          {picks.length > 0 && (
            <div className="mt-3 flex flex-wrap gap-2">
              {picks.map((p) => (
                <span key={keyOf(p)} className="inline-flex items-center gap-1.5 rounded-full border border-brand-400/40 bg-brand-500/15 py-1 pl-3 pr-1.5 text-xs font-semibold text-brand-100">
                  {p.title}
                  <button onClick={() => removePick(keyOf(p))} aria-label={`Remove ${p.title}`} className="grid h-4 w-4 place-items-center rounded-full bg-white/15 text-[10px] leading-none hover:bg-white/30">×</button>
                </span>
              ))}
            </div>
          )}
        </div>

        {/* Room + invite */}
        <div className="card mt-4 p-5 text-center">
          <div className="text-xs uppercase tracking-widest text-brand-300">Waiting room · {state.participants.length} in</div>
          <div className="mt-3 flex flex-wrap justify-center gap-2">
            {state.participants.map((p) => (
              <span key={p.id} className="inline-flex items-center gap-1.5 rounded-full bg-white/10 px-3 py-1 text-sm text-white">
                {p.name}
                <span className={`rounded-full px-1.5 text-[10px] font-bold ${(p.pickCount ?? 0) > 0 ? 'bg-emerald-500/25 text-emerald-200' : 'bg-white/10 text-slate-400'}`}>{p.pickCount ?? 0}</span>
              </span>
            ))}
          </div>

          <div className="mt-4 rounded-xl border border-white/10 bg-white/5 p-3">
            <div className="text-xs font-semibold text-slate-300">Invite the others</div>
            <div className="mt-2 flex items-center justify-center gap-2">
              <button onClick={invite} className="btn-primary text-sm">📨 Send invite</button>
              <button onClick={showQr} className="btn-secondary text-sm">{qr ? 'Hide QR' : 'QR code'}</button>
            </div>
            {qr && <div className="mx-auto mt-3 h-44 w-44 rounded-lg bg-white p-2" dangerouslySetInnerHTML={{ __html: qr }} />}
            <p className="mt-2 break-all text-[11px] text-slate-400">{shareUrl}</p>
          </div>

          {err && <p className="mt-3 text-xs text-red-300">{err}</p>}

          {isHost ? (
            <button onClick={startCourt} disabled={starting || state.participants.length < 2 || !anyPicks} className="btn-primary mt-5 w-full py-3">
              {starting ? 'Deliberating…' : state.participants.length < 2 ? 'Need 2+ to start' : !anyPicks ? 'Add some titles first' : '⚖️ Deliver the ruling'}
            </button>
          ) : (
            <div className="mt-5 text-sm text-slate-400">Waiting for the host to start…</div>
          )}
        </div>
      </Shell>
    );
  }

  // ---- RULING (ranked 3 + controls) ----
  if ((state.status === 'verdict' || state.status === 'veto') && state.finalists) {
    const finalists = [...state.finalists].sort((a, b) => a.rank - b.rank);
    if (!gaveled) {
      return (
        <Shell>
          <div className="grid min-h-[60vh] place-items-center text-center">
            <div>
              <div className="wv-gavel text-7xl" aria-hidden>⚖️</div>
              <div className="wv-order mt-4 text-2xl font-black uppercase tracking-[0.2em] text-gold-300">Order in the court</div>
              <div className="mt-2 text-sm text-slate-400">Ranking everyone’s picks…</div>
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
              <span aria-hidden>🔨</span> The ruling
            </div>
            <p className="mt-2 text-sm text-slate-300">Ranked by best fit for all {finalists[0]?.perMember.length ?? state.participants.length} of you. Veto any pick and the judge swaps in the next best.</p>
          </div>

          <div className="mt-4 space-y-3">
            {finalists.map((f, i) => (
              <FinalistCard key={keyOf(f)} f={f} onVeto={() => repick('veto', i)} busy={busy} />
            ))}
          </div>

          {err && <p className="mt-3 text-center text-xs text-red-300">{err}</p>}

          <div className="mt-5 grid gap-2 sm:grid-cols-2">
            <button onClick={() => repick('more')} disabled={busy} className="btn-secondary inline-flex justify-center disabled:opacity-50">🔄 Show 3 more</button>
            <Link href={`/app/title/${finalists[0]!.mediaType}/${finalists[0]!.id}`} className="btn-primary inline-flex justify-center">▶ Open #1 →</Link>
          </div>
          <div className="mt-3 text-center">
            <Link href="/app/together" className="text-xs font-semibold text-slate-400 hover:text-slate-200">Start a new round</Link>
          </div>
        </div>
      </Shell>
    );
  }

  return <Shell><div className="text-sm text-slate-400">Loading…</div></Shell>;
}

function FinalistCard({ f, onVeto, busy }: { f: Finalist; onVeto: () => void; busy: boolean }) {
  const medal = f.rank === 1 ? '🥇' : f.rank === 2 ? '🥈' : '🥉';
  return (
    <div className={`rounded-2xl border p-3 ${f.rank === 1 ? 'border-gold-400/50 bg-gold-500/[0.07]' : 'border-white/10 bg-white/[0.04]'}`}>
      <div className="flex gap-3">
        <div className="relative h-32 w-[86px] flex-none overflow-hidden rounded-xl border border-white/10 bg-ink-800">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          {f.posterUrl ? <img src={f.posterUrl} alt="" className="h-full w-full object-cover" /> : <div className="grid h-full w-full place-items-center text-xs text-slate-500">No art</div>}
          <span className="absolute left-1 top-1 rounded-md bg-black/70 px-1.5 py-0.5 text-xs font-black text-white">{medal} #{f.rank}</span>
        </div>
        <div className="flex min-w-0 flex-1 flex-col">
          <Link href={`/app/title/${f.mediaType}/${f.id}`} className="line-clamp-2 text-lg font-black leading-tight text-white hover:text-brand-200">
            {f.title}{f.year ? <span className="font-semibold text-slate-400"> ({f.year})</span> : null}
          </Link>
          <div className="mt-1 flex flex-wrap gap-1.5">
            <span className="rounded-full border border-brand-400/40 bg-brand-500/15 px-2 py-0.5 text-[11px] font-bold text-brand-100">Group fit {f.fit}</span>
            {f.attributes.slice(0, 2).map((a, j) => <span key={j} className="rounded-full bg-white/10 px-2 py-0.5 text-[11px] text-slate-200">{a}</span>)}
          </div>
          {f.pickedBy.length > 0 && (
            <div className="mt-1.5 text-[11px] text-emerald-200">⭐ Picked by {f.pickedBy.join(', ')}</div>
          )}
          <div className="mt-1.5 flex flex-wrap gap-x-2 gap-y-1 text-[11px] text-slate-300">
            {f.perMember.map((m) => (
              <span key={m.name} className="inline-flex items-center gap-1">
                <span className="text-slate-400">{m.name}</span>
                <span className={`font-bold tabular-nums ${m.score >= 75 ? 'text-emerald-300' : m.score >= 55 ? 'text-gold-300' : 'text-red-300'}`}>{m.score}</span>
              </span>
            ))}
          </div>
          {f.streaming.length > 0 && <div className="mt-1.5 line-clamp-1 text-[11px] text-slate-400">📺 {f.streaming.join(', ')}</div>}
        </div>
      </div>
      <button onClick={onVeto} disabled={busy} className="mt-2 w-full rounded-xl border border-red-400/40 bg-red-500/10 py-2 text-xs font-bold text-red-100 transition hover:bg-red-500/20 disabled:opacity-40">
        🚫 Veto — swap this one out
      </button>
    </div>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-dvh">
      <header className="container-page flex h-16 items-center">
        <span className="whitespace-nowrap text-lg font-bold tracking-tight text-white">Watch<span className="text-[#ff1493]" aria-hidden>VERD<span className="wv-iflip"><span className="wv-iflip-inner"><span className="wv-iflip-face">I</span><span className="wv-iflip-face wv-iflip-back">1</span></span></span>CT</span><span className="sr-only">Verdict</span> · ⚖️ Court</span>
      </header>
      <main className="container-page mx-auto max-w-md py-4">{children}</main>
    </div>
  );
}
