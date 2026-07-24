'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';
import { qrForUrl } from '@/lib/actions/qr';
import { getMyTaste, type MyTaste } from '@/lib/actions/profile';
import { CourtInviteBox } from '@/components/court/CourtInviteBox';
import { courtInviteUrlFromEnv } from '@/lib/court/inviteUrl';
import { getGuestId } from '@/lib/court/guestId';
import { classifyRpcError, classifyRoomStatus, stateInfo, type ClassifiedError } from '@/lib/court/joinState';

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
interface State { status: 'lobby' | 'veto' | 'verdict' | 'closed' | 'expired'; mediaType: string; finalists: Finalist[] | null; participants: Participant[]; expiresAt?: string | null }

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
  // A terminal error (room gone/closed/expired/full/started/config/migration) that
  // stops polling and shows a recovery screen — never an infinite spinner.
  const [fatal, setFatal] = useState<ClassifiedError | null>(null);
  const [reconnecting, setReconnecting] = useState(false);
  const [loadTimedOut, setLoadTimedOut] = useState(false);
  const pollTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const stopped = useRef(false);
  const fails = useRef(0);
  const firstLoaded = useRef(false);

  // The invite link is built by the ONE authoritative URL service. Default base is
  // the host's own origin (guarantees the recipient hits the same deployment/DB); a
  // dedicated NEXT_PUBLIC_COURT_ORIGIN can pin a canonical custom domain.
  const invite = courtInviteUrlFromEnv(code);
  const shareUrl = invite.url ?? '';
  async function showQr() {
    if (!shareUrl) return;
    if (qr) { setQr(null); return; } // toggle off
    setQr(await qrForUrl(shareUrl));
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

  // One authoritative fetch of room state. Classifies every failure into a precise
  // state; terminal states stop the loop, transient ones drive a bounded retry.
  async function refresh(): Promise<void> {
    const { data, error } = await supabase.rpc('court_state', { p_code: code });
    if (error) {
      const c = classifyRpcError(error);
      if (!c.transient) { setFatal(c); stopped.current = true; return; }
      fails.current += 1;
      if (fails.current >= 2) setReconnecting(true);
      return;
    }
    if (data == null) { setFatal(stateInfo('room-not-found')); setNotFound(true); stopped.current = true; return; }
    const st = data as State;
    const cls = classifyRoomStatus(st.status);
    if (cls.state !== 'ok') { setState(st); setFatal(cls); stopped.current = true; return; }
    firstLoaded.current = true;
    fails.current = 0;
    setReconnecting(false);
    setErr(null);
    setState(st);
  }

  // Bounded, visibility-aware polling loop with exponential backoff (no fixed
  // high-frequency interval, no infinite retries). Pauses when backgrounded and
  // resumes on foreground; never spins forever.
  useEffect(() => {
    stopped.current = false;
    fails.current = 0;
    firstLoaded.current = false;
    setLoadTimedOut(false);

    async function loop() {
      if (stopped.current) return;
      if (typeof document !== 'undefined' && document.hidden) { schedule(2500); return; }
      await refresh();
      const delay = fails.current > 0 ? Math.min(8000, 1500 * 2 ** Math.min(fails.current, 3)) : 1500;
      schedule(delay);
    }
    function schedule(ms: number) {
      if (stopped.current) return;
      if (pollTimer.current) clearTimeout(pollTimer.current);
      pollTimer.current = setTimeout(loop, ms);
    }
    void loop();

    // No infinite "Connecting…": if the first load hasn't landed in 10s, offer a retry.
    const loadTimer = setTimeout(() => { if (!firstLoaded.current && !stopped.current) setLoadTimedOut(true); }, 10_000);
    const onVis = () => { if (typeof document !== 'undefined' && !document.hidden && !stopped.current) { if (pollTimer.current) clearTimeout(pollTimer.current); void loop(); } };
    if (typeof document !== 'undefined') document.addEventListener('visibilitychange', onVis);

    return () => {
      stopped.current = true;
      if (pollTimer.current) clearTimeout(pollTimer.current);
      clearTimeout(loadTimer);
      if (typeof document !== 'undefined') document.removeEventListener('visibilitychange', onVis);
    };
  }, [code]); // eslint-disable-line react-hooks/exhaustive-deps

  function retryConnection() {
    setFatal(null);
    setLoadTimedOut(false);
    setReconnecting(false);
    fails.current = 0;
    stopped.current = false;
    void refresh();
  }

  // Play the gavel-strike once when the ruling first lands.
  useEffect(() => {
    if (state?.status === 'verdict' && !gaveled) {
      const t = setTimeout(() => setGaveled(true), 1500);
      return () => clearTimeout(t);
    }
  }, [state?.status, gaveled]);

  async function join() {
    const nm = name.trim();
    if (!nm) { setErr('Enter a display name to join.'); return; }
    setJoining(true);
    setErr(null);
    // A STABLE device guest id makes the join idempotent server-side: refreshing,
    // reconnecting, or re-opening the link re-uses the same seat (no ghost rows).
    const guestId = getGuestId();
    let { data, error } = await supabase.rpc('court_join', {
      p_code: code, p_name: nm, p_love: [], p_avoid: [], p_mood: mood, p_guest_id: guestId,
    });
    // Backward-compat: a deployment that hasn't applied 0023 only has the legacy
    // 5-arg court_join. If the 6-arg signature isn't found, retry without guest_id
    // so joining still works (idempotency arrives once the migration is applied).
    if (error && (error.code === 'PGRST202' || /could not find the function|function .*court_join.* does not exist/i.test(error.message ?? ''))) {
      ({ data, error } = await supabase.rpc('court_join', { p_code: code, p_name: nm, p_love: [], p_avoid: [], p_mood: mood }));
    }
    setJoining(false);
    if (error) {
      const c = classifyRpcError(error);
      // Recoverable-in-place errors stay inline; terminal room states show the
      // full recovery screen.
      if (c.state === 'name-required' || c.state === 'connection-failed' || c.state === 'unexpected') setErr(c.message);
      else setFatal(c);
      return;
    }
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

  // Terminal, classified error → a clear recovery screen (never an endless spinner).
  if (fatal) {
    return <Shell><FatalCard err={fatal} onRetry={retryConnection} /></Shell>;
  }
  if (notFound) {
    return <Shell><div className="card p-8 text-center"><div className="text-3xl">🔗</div><p className="mt-3 text-sm text-slate-400">This Court room doesn’t exist or has ended.</p><Link href="/app" className="btn-secondary mt-4 inline-flex">Open WatchVerdict →</Link></div></Shell>;
  }
  if (!state) return (
    <Shell>
      {loadTimedOut
        ? <div className="card p-6 text-center"><div className="text-3xl">🔌</div><p className="mt-3 text-sm text-slate-300">This is taking longer than usual to connect.</p><p className="mt-1 text-xs text-slate-500">Check your connection, or make sure you opened the invite on the same site as the host.</p><button onClick={retryConnection} className="btn-primary mt-4">Try again</button></div>
        : <div className="text-center"><div className="text-sm text-slate-400">Connecting to the room…</div>{reconnecting && <div className="mt-2 text-xs text-amber-300">Reconnecting…</div>}</div>}
    </Shell>
  );

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
        {/* Host can invite the others straight away — before entering their own name —
            so the Send invite + QR are on the very first screen. */}
        {isHost && <CourtInviteBox url={shareUrl} qr={qr} onToggleQr={showQr} />}
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

          <CourtInviteBox url={shareUrl} qr={qr} onToggleQr={showQr} />

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

/** A precise, recoverable error screen — one per classified Court state. */
function FatalCard({ err, onRetry }: { err: ClassifiedError; onRetry: () => void }) {
  return (
    <div className="card p-6 text-center">
      <div className="text-3xl">{err.state === 'room-full' ? '🚪' : err.state === 'connection-failed' ? '🔌' : err.transient ? '⏳' : '⚖️'}</div>
      <p className="mt-3 text-sm text-slate-200">{err.message}</p>
      <div className="mt-4 flex flex-wrap items-center justify-center gap-2">
        {(err.recovery === 'try-again' || err.recovery === 'reconnect' || err.transient) && (
          <button onClick={onRetry} className="btn-primary text-sm">{err.recovery === 'reconnect' ? 'Reconnect' : 'Try again'}</button>
        )}
        {err.recovery === 'open-correct-site' && (
          <p className="text-xs text-slate-500">Open the invite link the host sent — make sure it’s the same site.</p>
        )}
        <Link href="/app" className="btn-secondary text-sm">Return home</Link>
      </div>
      {err.state === 'migration-missing' && (
        <p className="mt-3 text-[11px] text-slate-500">Site owner: apply the Court database update (migrations 0004 + 0014 + 0023).</p>
      )}
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
