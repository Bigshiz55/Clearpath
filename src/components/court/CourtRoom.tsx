'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';
import { WatchVerdictWordmark } from '@/components/WatchVerdictWordmark';
import { CourtSizePicker } from '@/components/court/CourtSizePicker';
import { COURT_SIZES, DEFAULT_COURT_SIZE, type CourtSize } from '@/lib/court/pool';
import {
  channelName, pollIntervalMs, statusFromChannel, syncLabel, REFRESH_COALESCE_MS,
  type SyncEvent, type SyncStatus,
} from '@/lib/court/liveSync';
import { qrForUrl } from '@/lib/actions/qr';
import { getMyTaste, type MyTaste } from '@/lib/actions/profile';
import {
  groupRank, winnerOf, appeal as appealNext, nextActionLabel, participantStatus, partialNote,
  roomReady, shortlistReady, type Reaction, type CandidateInput, type RankedCandidate,
} from '@/lib/courtRoom';

/**
 * THE COURT — a modern group decision room. Five stages: JOIN → SET TONIGHT →
 * BUILD THE SHORTLIST → REACT TOGETHER → FINAL VERD1CT, plus live GROUP CHAT.
 *
 * WatchVerd1ct itself is the intelligence: there is no judge character, no
 * deliberation theatre, and no waiting on an artificial persona. All ranking
 * runs through the pure `courtRoom` engine (floor-weighted, veto-protected).
 */

interface Pick { id: number; mediaType: 'movie' | 'tv'; title: string; year: number | null; posterPath: string | null; posterUrl?: string | null }
interface SearchHit extends Pick { posterUrl: string | null; overview: string }
interface Participant { id: string; name: string; ready?: boolean; pickCount?: number; reactionCount?: number; reactions?: Record<string, { r: Reaction; reason?: string }> }
interface Finalist {
  rank: number; id: number; mediaType: 'movie' | 'tv'; title: string; year: number | null; posterUrl: string | null;
  attributes: string[]; genres: string[]; perMember: { name: string; score: number; picked: boolean }[];
  pickedBy: string[]; fit: number; minScore: number; avgScore: number; streaming: string[];
}
interface ChatMessage { id: string; sender: string; body: string; at: string }
interface State {
  status: 'lobby' | 'veto' | 'verdict';
  mediaType: string;
  finalists: Finalist[] | null;
  participants: Participant[];
  messages?: ChatMessage[];
}

const keyOf = (p: { mediaType: string; id: number }) => `${p.mediaType}-${p.id}`;

const KINDS = [
  { k: 'movie', label: 'Movie' },
  { k: 'tv', label: 'Show' },
  { k: 'any', label: 'Either' },
] as const;
const MOODS = ['Mystery', 'Thriller', 'Comedy', 'Drama', 'Action', 'Romance', 'Family', 'Documentary', 'Sci-fi', 'Horror', 'Surprise us'];
const AVOIDS = ['Horror', 'Supernatural', 'Slow', 'Very violent', 'Sad', 'Subtitles', 'Long', 'Explicit', 'Already watched'];
const TIMES = [
  { k: 'u90', label: 'Under 90 min' },
  { k: 'u120', label: 'Under 2 hours' },
  { k: 'any', label: 'No limit' },
] as const;
const QUICK_REPLIES = ['I’ve seen it', 'Too long', 'I’m good with this', 'Save it for later', 'Something lighter?', 'I’ll go with the group'];

interface Tonight { kind: 'movie' | 'tv' | 'any'; moods: string[]; avoid: string[]; time: 'u90' | 'u120' | 'any' }
const EMPTY_TONIGHT: Tonight = { kind: 'any', moods: [], avoid: [], time: 'any' };

export function CourtRoom({ code }: { code: string }) {
  const supabase = createClient();
  const [hostToken, setHostToken] = useState<string | null>(null);
  const [participantId, setParticipantId] = useState<string | null>(null);
  const [myName, setMyName] = useState<string>('');
  const [state, setState] = useState<State | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  // Stage 1 — join
  const [name, setName] = useState('');
  const [joining, setJoining] = useState(false);
  const [mine, setMine] = useState<MyTaste | null>(null);

  // Stage 2 — tonight (TEMPORARY; never written to permanent DNA)
  const [tonight, setTonight] = useState<Tonight>(EMPTY_TONIGHT);
  const [tonightDone, setTonightDone] = useState(false);
  // Court size is the HOST's setting for the whole room, so it lives beside
  // tonight's preferences rather than inside them (guests never send it).
  const [courtSize, setCourtSize] = useState<CourtSize>(DEFAULT_COURT_SIZE);

  // Stage 3 — shortlist
  const [picks, setPicks] = useState<Pick[]>([]);
  const [q, setQ] = useState('');
  const [hits, setHits] = useState<SearchHit[]>([]);
  const [searching, setSearching] = useState(false);
  const [building, setBuilding] = useState(false);

  // Stage 4/5
  const [myReactions, setMyReactions] = useState<Record<string, Reaction>>({});
  const [busy, setBusy] = useState(false);
  const [appealed, setAppealed] = useState<string[]>([]);

  // Chat
  const [chatOpen, setChatOpen] = useState(false);
  const [draft, setDraft] = useState('');
  const [seenCount, setSeenCount] = useState(0);
  const [sendFailed, setSendFailed] = useState<string | null>(null);

  // Live sync — Realtime carries the signal, the RPC still carries the data.
  const [sync, setSync] = useState<SyncStatus>('connecting');

  const [qr, setQr] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [shared, setShared] = useState(false);
  const poll = useRef<ReturnType<typeof setInterval> | null>(null);
  const coalesce = useRef<ReturnType<typeof setTimeout> | null>(null);
  const channel = useRef<ReturnType<typeof supabase.channel> | null>(null);

  const shareUrl = typeof window !== 'undefined' ? `${window.location.origin}/court/${code}` : '';

  useEffect(() => {
    try {
      setHostToken(localStorage.getItem(`court_host_${code}`));
      setParticipantId(localStorage.getItem(`court_part_${code}`));
      setMyName(localStorage.getItem(`court_name_${code}`) ?? '');
      const savedPicks = localStorage.getItem(`court_picks_${code}`);
      if (savedPicks) setPicks(JSON.parse(savedPicks) as Pick[]);
      const savedTonight = localStorage.getItem(`court_tonight_${code}`);
      if (savedTonight) { setTonight(JSON.parse(savedTonight) as Tonight); setTonightDone(true); }
      const savedSize = localStorage.getItem(`court_size_${code}`);
      if (savedSize === 'quick' || savedSize === 'standard' || savedSize === 'deep') setCourtSize(savedSize);
      const savedReactions = localStorage.getItem(`court_react_${code}`);
      if (savedReactions) setMyReactions(JSON.parse(savedReactions) as Record<string, Reaction>);
    } catch { /* ignore */ }
    getMyTaste().then(setMine).catch(() => {});
  }, [code]);

  const refresh = useCallback(async () => {
    const { data, error } = await supabase.rpc('court_state_v2', { p_code: code });
    if (error) {
      // Fall back to the v1 snapshot when 0026 hasn't been applied yet.
      const legacy = await supabase.rpc('court_state', { p_code: code });
      if (legacy.error) {
        if (legacy.error.code === '42P01') setErr('The Court needs the latest database migrations (0004, 0014, 0026).');
        return;
      }
      if (legacy.data == null) { setNotFound(true); return; }
      setState(legacy.data as State);
      return;
    }
    if (data == null) { setNotFound(true); return; }
    setState(data as State);
  }, [code, supabase]);

  /** Coalesce a burst of broadcasts into a single re-read. */
  const nudge = useCallback(() => {
    if (coalesce.current) return;
    coalesce.current = setTimeout(() => {
      coalesce.current = null;
      void refresh();
    }, REFRESH_COALESCE_MS);
  }, [refresh]);

  // Realtime: subscribe to the room's channel. The payload is never trusted as
  // data — it only tells us to re-read through the access-checked RPC.
  useEffect(() => {
    const ch = supabase
      .channel(channelName(code), { config: { broadcast: { self: false } } })
      .on('broadcast', { event: 'chat' }, () => nudge())
      .on('broadcast', { event: 'state' }, () => nudge())
      .subscribe((status) => setSync(statusFromChannel(status)));
    channel.current = ch;
    return () => {
      channel.current = null;
      if (coalesce.current) { clearTimeout(coalesce.current); coalesce.current = null; }
      void supabase.removeChannel(ch);
    };
  }, [code, supabase, nudge]);

  // Polling is the floor, not the mechanism: fast while the socket is down,
  // a slow heartbeat once it is up so a dropped broadcast can't strand a room.
  useEffect(() => {
    void refresh();
    poll.current = setInterval(() => void refresh(), pollIntervalMs(sync));
    return () => { if (poll.current) clearInterval(poll.current); };
  }, [refresh, sync]);

  /** Tell the room something changed. Best effort: a failed broadcast just
   *  means the others fall back to their poll. */
  const announce = useCallback((event: SyncEvent) => {
    void channel.current?.send({ type: 'broadcast', event, payload: {} }).catch(() => {});
  }, []);

  // ---- Stage 1: join ----
  async function join() {
    if (!name.trim()) return;
    setJoining(true);
    const { data, error } = await supabase.rpc('court_join', {
      p_code: code, p_name: name.trim(), p_love: [], p_avoid: [], p_mood: 'any',
    });
    setJoining(false);
    if (error) { setErr(error.message); return; }
    const row = Array.isArray(data) ? data[0] : data;
    const pid = row?.participant_id as string | undefined;
    if (!pid) return;
    try {
      localStorage.setItem(`court_part_${code}`, pid);
      localStorage.setItem(`court_name_${code}`, name.trim());
    } catch { /* ignore */ }
    setParticipantId(pid);
    setMyName(name.trim());
    if (picks.length) void savePicks(picks, pid);
    announce('state');
    void refresh();
  }

  // ---- Stage 2: tonight (temporary only) ----
  async function saveTonight(next: Tonight, ready: boolean) {
    setTonight(next);
    try { localStorage.setItem(`court_tonight_${code}`, JSON.stringify(next)); } catch { /* ignore */ }
    if (!participantId) return;
    try { await supabase.rpc('court_set_tonight', { p_code: code, p_participant: participantId, p_tonight: next, p_ready: ready }); } catch { /* best effort */ }
    announce('state');
    void refresh();
  }
  function toggleIn(list: string[], v: string, max = 99) {
    return list.includes(v) ? list.filter((x) => x !== v) : list.length >= max ? list : [...list, v];
  }

  // ---- Stage 3: shortlist ----
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
    try { await supabase.rpc('court_set_picks', { p_code: code, p_participant: pid, p_picks: next }); } catch { /* retry on next change */ }
    announce('state');
    void refresh();
  }
  function addPick(h: SearchHit) {
    if (picks.length >= 3 || picks.some((p) => keyOf(p) === keyOf(h))) return;
    const next = [...picks, { id: h.id, mediaType: h.mediaType, title: h.title, year: h.year, posterPath: h.posterPath, posterUrl: h.posterUrl }];
    setPicks(next); setQ(''); setHits([]); void savePicks(next);
  }
  function removePick(k: string) {
    const next = picks.filter((p) => keyOf(p) !== k);
    setPicks(next); void savePicks(next);
  }

  /** BUILD OUR SHORTLIST — WatchVerd1ct fills the room's candidates. Replaces
   *  every "ask the judge" flow: nobody has to search, and nothing waits on a
   *  persona. */
  async function buildShortlist() {
    if (!hostToken) return;
    setBuilding(true); setErr(null);
    const res = await fetch('/api/court/start', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code, hostToken, size: courtSize }),
    });
    const d = await res.json().catch(() => ({}));
    setBuilding(false);
    if (!res.ok || d.error) setErr(d.error ?? 'Could not build the shortlist.');
    else { announce('state'); void refresh(); }
  }

  // ---- Stage 4: reactions ----
  async function react(k: string, r: Reaction, reason?: string) {
    const next = { ...myReactions, [k]: r };
    setMyReactions(next);
    try { localStorage.setItem(`court_react_${code}`, JSON.stringify(next)); } catch { /* ignore */ }
    if (!participantId) return;
    setBusy(true);
    try { await supabase.rpc('court_react', { p_code: code, p_participant: participantId, p_key: k, p_reaction: r, p_reason: reason ?? '' }); } catch { /* ignore */ }
    setBusy(false);
    announce('state');
    void refresh();
  }

  async function revealVerdict() {
    if (!hostToken) return;
    setBusy(true);
    try { await supabase.rpc('court_reveal', { p_code: code, p_host_token: hostToken }); } catch { /* ignore */ }
    setBusy(false);
    announce('state');
    void refresh();
  }

  // ---- Chat ----
  const messages = state?.messages ?? [];
  const unread = Math.max(0, messages.length - seenCount);
  useEffect(() => { if (chatOpen) setSeenCount(messages.length); }, [chatOpen, messages.length]);

  async function sendChat(body: string) {
    const text = body.trim();
    if (!text || !participantId) return;
    setDraft(''); setSendFailed(null);
    const { error } = await supabase.rpc('court_chat_send', { p_code: code, p_participant: participantId, p_body: text });
    if (error) setSendFailed(text);
    else { announce('chat'); void refresh(); }
  }

  // ---- Derived room model ----
  const participants = useMemo(() => state?.participants ?? [], [state?.participants]);
  const candidates: CandidateInput[] = useMemo(() => {
    const finalists = state?.finalists ?? [];
    return finalists.map((f) => {
      const k = keyOf(f);
      const reactions: { name: string; reaction: Reaction; reason?: string }[] = [];
      for (const p of participants) {
        const r = p.id === participantId ? myReactions[k] : p.reactions?.[k]?.r;
        if (r) reactions.push({ name: p.name, reaction: r, reason: p.reactions?.[k]?.reason });
      }
      return {
        key: k,
        title: f.title,
        fits: f.perMember.map((m) => ({ name: m.name, score: m.score })),
        reactions,
        available: f.streaming.length > 0,
      };
    });
  }, [state?.finalists, participants, participantId, myReactions]);

  const ranked = useMemo(() => groupRank(candidates), [candidates]);
  const reactedCount = participants.filter((p) => (p.reactionCount ?? 0) > 0 || (p.id === participantId && Object.keys(myReactions).length > 0)).length;
  const snapshot = {
    participantCount: participants.length,
    candidateCount: candidates.length || participants.reduce((s, p) => s + (p.pickCount ?? 0), 0),
    reactedCount,
    stage: (state?.status === 'verdict' ? 'verdict' : state?.status === 'veto' ? 'reacting' : 'open') as 'open' | 'reacting' | 'verdict',
  };

  // ---- Invite ----
  async function shareInvite() {
    if (!shareUrl) return;
    const share = (navigator as Navigator & { share?: (d: ShareData) => Promise<void> }).share;
    if (share) {
      try {
        await share({ title: 'Join our Court on WatchVerd1ct', text: 'Help us pick what to watch tonight:', url: shareUrl });
        setShared(true); setTimeout(() => setShared(false), 3000);
        return;
      } catch { /* cancelled → fall through to copy */ }
    }
    await copyLink();
  }
  async function copyLink() {
    try {
      await navigator.clipboard?.writeText(shareUrl);
      setCopied(true); setTimeout(() => setCopied(false), 3000);
    } catch { setErr('Couldn’t copy — long-press the room code to share it manually.'); }
  }
  async function toggleQr() {
    if (qr) { setQr(null); return; }
    if (shareUrl) setQr(await qrForUrl(shareUrl));
  }

  if (notFound) {
    return (
      <Shell sync={sync}>
        <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-8 text-center">
          <p className="text-sm text-slate-400">This Court has ended or the link is no longer valid.</p>
          <Link href="/app" className="btn-secondary mt-4 inline-flex">Open WatchVerd1ct</Link>
        </div>
      </Shell>
    );
  }
  if (!state) {
    return <Shell sync={sync}><p className="text-sm text-slate-400">Connecting to your group…</p></Shell>;
  }

  const isHost = !!hostToken;

  // =========================== STAGE 1 — JOIN ===============================
  // Shown whenever this device has no identity in the room — including a LATE
  // join while the group is already reacting, and a refresh that lost local
  // storage. Without this, an unjoined visitor saw reaction controls that
  // silently did nothing.
  if (!participantId && state.status !== 'verdict') {
    return (
      <Shell sync={sync}>
        <section data-testid="court-join" className="rounded-2xl border border-white/10 bg-white/[0.03] p-5">
          <h1 className="text-lg font-bold text-white">Join the group</h1>
          <p className="mt-1 text-sm text-slate-400">Add your name and you’re in. No account needed.</p>
          {mine?.signedIn && mine.name && (
            <button onClick={() => setName(mine.name!)} className="mt-3 w-full rounded-xl border border-brand-400/40 bg-brand-500/15 px-3 py-2.5 text-sm font-semibold text-brand-100">
              Continue as {mine.name} — uses your saved DNA
            </button>
          )}
          <label className="mt-3 block">
            <span className="sr-only">Your display name</span>
            <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Your name" className="input" maxLength={40} autoFocus />
          </label>
          {err && <p role="alert" className="mt-3 text-xs text-red-300">{err}</p>}
          <button onClick={join} disabled={joining || !name.trim()} data-testid="join-court" className="btn-primary mt-4 w-full py-3">
            {joining ? 'Joining…' : 'Join Court'}
          </button>
        </section>
      </Shell>
    );
  }

  // ===================== STAGE 5 — FINAL VERD1CT ============================
  if (state.status === 'verdict' && ranked.length > 0) {
    const winner = appealed.length > 0 ? appealNext(candidates, appealed) : winnerOf(ranked);
    const backup = winnerOf(groupRank(candidates.filter((c) => c.key !== winner?.key && !appealed.includes(c.key))));
    const note = partialNote(snapshot);
    if (!winner) {
      return (
        <Shell sync={sync}>
          <section data-testid="court-verdict-empty" className="rounded-2xl border border-amber-400/30 bg-amber-500/10 p-5">
            <h1 className="text-lg font-bold text-white">No option survived</h1>
            <p className="mt-1 text-sm text-amber-100">Every title was vetoed or appealed. Remove a veto or add more possibilities to get a Verd1ct.</p>
            <button onClick={() => setAppealed([])} className="btn-secondary mt-4">Reconsider all titles</button>
          </section>
        </Shell>
      );
    }
    const f = (state.finalists ?? []).find((x) => keyOf(x) === winner.key);
    return (
      <Shell onChat={() => setChatOpen(true)} unread={unread} sync={sync}>
        <section data-testid="court-verdict">
          <p className="text-xs font-semibold uppercase tracking-widest text-brand-300">Your group’s Verd1ct</p>
          <h1 className="mt-1 text-2xl font-black leading-tight text-white sm:text-3xl">
            {winner.title}{f?.year ? <span className="font-bold text-slate-400"> ({f.year})</span> : null}
          </h1>
          {note && <p data-testid="partial-note" className="mt-1 text-xs text-amber-200">{note}</p>}

          <div className="mt-4 flex flex-col gap-4 sm:flex-row">
            {f?.posterUrl && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={f.posterUrl} alt={`Poster for ${winner.title}`} className="h-48 w-32 flex-none rounded-xl border border-white/10 object-cover" />
            )}
            <div className="min-w-0 flex-1 space-y-3">
              <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1">
                <div>
                  <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">Group match</div>
                  <div data-testid="group-match" className="text-4xl font-black tabular-nums text-white">{winner.groupScore}</div>
                </div>
                <div className="flex flex-wrap gap-x-3 gap-y-0.5 text-sm tabular-nums text-slate-300">
                  {winner.perMember.map((m) => (
                    <span key={m.name}>{m.name} <b className="text-white">{m.score}</b></span>
                  ))}
                </div>
              </div>
              {winner.reasons.length > 0 && (
                <div>
                  <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">Why it won</div>
                  <ul className="mt-1 space-y-0.5 text-sm text-slate-300">
                    {winner.reasons.map((r) => <li key={r}>· {r}</li>)}
                  </ul>
                </div>
              )}
              {f && f.streaming.length > 0 ? (
                <p className="text-sm text-slate-300">
                  <span className="text-slate-400">Available on</span> {f.streaming.join(', ')}
                  <span className="ml-1 text-xs text-slate-500">· availability likely (listings source)</span>
                </p>
              ) : (
                <p className="text-sm text-amber-200">Availability unconfirmed for your group’s services.</p>
              )}
            </div>
          </div>

          <div className="mt-5 flex flex-wrap gap-2">
            <Link href={`/app/title/${f?.mediaType ?? 'movie'}/${f?.id ?? 0}`} className="btn-primary">Watch now</Link>
            <button onClick={() => void react(winner.key, 'maybe', 'save for later')} className="btn-secondary">Save for later</button>
            <button
              data-testid="appeal"
              onClick={() => setAppealed((prev) => [...prev, winner.key])}
              className="rounded-xl border border-white/12 px-3 py-2 text-sm font-semibold text-slate-300 transition hover:bg-white/5"
            >
              Appeal
            </button>
          </div>

          {backup && (
            <div data-testid="backup" className="mt-5 rounded-xl border border-white/10 bg-white/[0.03] p-3">
              <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">Backup option</div>
              <div className="mt-0.5 text-sm text-white">{backup.title} <span className="tabular-nums text-slate-400">· {backup.groupScore}</span></div>
            </div>
          )}
        </section>
        {chatOpen && <ChatPanel messages={messages} me={myName} draft={draft} setDraft={setDraft} onSend={sendChat} onClose={() => setChatOpen(false)} failed={sendFailed} onRetry={() => sendFailed && sendChat(sendFailed)} />}
      </Shell>
    );
  }

  // ==================== STAGE 4 — REACT TOGETHER ============================
  if (state.status === 'veto' && ranked.length > 0) {
    return (
      <Shell onChat={() => setChatOpen(true)} unread={unread} sync={sync}>
        <section data-testid="court-react">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h1 className="text-lg font-bold text-white">React together</h1>
            <span data-testid="react-status" className="text-xs text-slate-400">{nextActionLabel(snapshot)}</span>
          </div>
          <div className="mt-3 space-y-3">
            {ranked.map((r) => {
              const f = (state.finalists ?? []).find((x) => keyOf(x) === r.key);
              const mineR = myReactions[r.key];
              return (
                <article key={r.key} data-testid="react-card" data-key={r.key} className={`rounded-2xl border p-3 ${r.vetoed ? 'border-red-400/40 bg-red-500/[0.06]' : 'border-white/10 bg-white/[0.03]'}`}>
                  <div className="flex gap-3">
                    {f?.posterUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={f.posterUrl} alt={`Poster for ${r.title}`} className="h-24 w-16 flex-none rounded-lg border border-white/10 object-cover" />
                    ) : (
                      <div className="grid h-24 w-16 flex-none place-items-center rounded-lg border border-white/10 bg-white/5 text-[10px] text-slate-500">No art</div>
                    )}
                    <div className="min-w-0 flex-1">
                      <h2 className="line-clamp-2 text-sm font-bold text-white">{r.title}{f?.year ? <span className="font-semibold text-slate-400"> ({f.year})</span> : null}</h2>
                      <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] text-slate-400">
                        <span className="rounded bg-white/10 px-1.5 py-0.5 font-bold uppercase tracking-wide text-slate-300">{f?.mediaType === 'tv' ? 'Show' : 'Movie'}</span>
                        <span className="tabular-nums">Group {r.groupScore}</span>
                        {f && f.streaming.length > 0 && <span className="truncate">{f.streaming[0]}</span>}
                      </div>
                      {r.reasons[0] && <p className="mt-1 text-[11px] text-slate-400">{r.reasons[0]}</p>}
                      {f && f.pickedBy.length > 0 && <p className="mt-0.5 text-[11px] text-emerald-200">Added by {f.pickedBy.join(', ')}</p>}
                      {r.vetoed && <p data-testid="vetoed-flag" className="mt-1 text-[11px] font-bold text-red-200">Removed by veto — {r.vetoedBy.join(', ')}</p>}
                    </div>
                  </div>
                  <div className="mt-2 flex flex-wrap items-center gap-1.5">
                    {(['for', 'maybe', 'pass'] as const).map((r2) => (
                      <button
                        key={r2}
                        data-testid={`react-${r2}`}
                        aria-pressed={mineR === r2}
                        onClick={() => void react(r.key, r2)}
                        disabled={busy}
                        className={`min-h-[44px] flex-1 rounded-xl border px-3 text-xs font-bold uppercase tracking-wide transition ${
                          mineR === r2
                            ? r2 === 'for' ? 'border-emerald-400/60 bg-emerald-500/25 text-emerald-100'
                              : r2 === 'maybe' ? 'border-gold-400/60 bg-gold-500/20 text-gold-200'
                              : 'border-slate-400/50 bg-white/10 text-slate-200'
                            : 'border-white/12 bg-white/[0.04] text-slate-300 hover:bg-white/10'
                        }`}
                      >
                        {mineR === r2 ? '✓ ' : ''}{r2}
                      </button>
                    ))}
                    <button
                      data-testid="react-veto"
                      aria-pressed={mineR === 'veto'}
                      onClick={() => void react(r.key, 'veto')}
                      disabled={busy}
                      title="Strong objection — this can't win while your veto stands"
                      className={`min-h-[44px] rounded-xl border px-2.5 text-[11px] font-semibold transition ${
                        mineR === 'veto' ? 'border-red-400/60 bg-red-500/25 text-red-100' : 'border-white/10 text-slate-500 hover:text-red-200'
                      }`}
                    >
                      Veto
                    </button>
                  </div>
                </article>
              );
            })}
          </div>
          {isHost && (
            <button onClick={revealVerdict} disabled={busy} data-testid="reveal" className="btn-primary mt-4 w-full py-3">
              {nextActionLabel(snapshot)}
            </button>
          )}
        </section>
        {chatOpen && <ChatPanel messages={messages} me={myName} draft={draft} setDraft={setDraft} onSend={sendChat} onClose={() => setChatOpen(false)} failed={sendFailed} onRetry={() => sendFailed && sendChat(sendFailed)} />}
      </Shell>
    );
  }

  // ============ STAGES 2 + 3 — SET TONIGHT · BUILD THE SHORTLIST ============
  return (
    <Shell onChat={() => setChatOpen(true)} unread={unread} sync={sync}>
      {/* Your group */}
      <section data-testid="court-group" className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h1 className="text-base font-bold text-white">Your group</h1>
          <span data-testid="room-status" className="text-xs text-slate-400">
            {roomReady(snapshot) ? `${participants.length} people joined` : `Waiting for others · ${participants.length} of 2 minimum joined`}
          </span>
        </div>
        <ul className="mt-3 space-y-1.5">
          {participants.map((p) => (
            <li key={p.id} className="flex items-center gap-2.5">
              <span aria-hidden className="grid h-7 w-7 flex-none place-items-center rounded-full bg-brand-500/20 text-[11px] font-black text-brand-100">
                {p.name.slice(0, 2).toUpperCase()}
              </span>
              <span className="min-w-0 flex-1 truncate text-sm text-white">{p.name}</span>
              <span data-testid="participant-status" className={`flex-none text-[11px] ${p.ready ? 'text-emerald-300' : 'text-slate-400'}`}>
                {participantStatus(p)}
              </span>
            </li>
          ))}
        </ul>

        {/* Invite — compact, no raw URL */}
        <div className="mt-4 border-t border-white/10 pt-3">
          <div className="flex flex-wrap items-center gap-2">
            <button onClick={shareInvite} data-testid="share-invite" className="btn-primary text-sm">Share invite</button>
            <button onClick={toggleQr} data-testid="show-qr" className="btn-secondary text-sm">{qr ? 'Hide QR code' : 'Show QR code'}</button>
            <button onClick={copyLink} data-testid="copy-link" className="rounded-xl border border-white/12 px-3 py-2 text-sm text-slate-300 transition hover:bg-white/5">Copy link</button>
            <span className="ml-auto font-mono text-xs tracking-widest text-slate-400">{code}</span>
          </div>
          {(copied || shared) && <p role="status" data-testid="invite-feedback" className="mt-2 text-xs text-emerald-300">{copied ? 'Link copied' : 'Invite ready to send'}</p>}
          {qr && <div data-testid="qr" className="mx-auto mt-3 h-40 w-40 rounded-lg bg-white p-2" dangerouslySetInnerHTML={{ __html: qr }} />}
        </div>
      </section>

      {/* Stage 2 — Set tonight */}
      <section data-testid="court-tonight" className="mt-4 rounded-2xl border border-white/10 bg-white/[0.03] p-4">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="text-base font-bold text-white">Tonight’s preferences</h2>
          {tonightDone
            ? <button onClick={() => setTonightDone(false)} className="text-xs font-semibold text-brand-300">Edit</button>
            : <span className="text-xs text-slate-500">Takes ~20 seconds · tonight only</span>}
        </div>
        {tonightDone ? (
          <p className="mt-2 text-sm text-slate-300">
            {KINDS.find((k) => k.k === tonight.kind)?.label}
            {tonight.moods.length > 0 ? ` · ${tonight.moods.join(', ')}` : ''}
            {tonight.avoid.length > 0 ? ` · avoiding ${tonight.avoid.join(', ')}` : ''}
            {tonight.time !== 'any' ? ` · ${TIMES.find((t) => t.k === tonight.time)?.label}` : ''}
            {isHost ? ` · ${COURT_SIZES[courtSize].label} (${COURT_SIZES[courtSize].total} titles)` : ''}
          </p>
        ) : (
          <div className="mt-3 space-y-3">
            <Field label="What are we watching?">
              {KINDS.map((k) => (
                <Chip key={k.k} on={tonight.kind === k.k} onClick={() => setTonight({ ...tonight, kind: k.k })}>{k.label}</Chip>
              ))}
            </Field>
            <Field label="What sounds good? (up to 3)">
              {MOODS.map((m) => (
                <Chip key={m} on={tonight.moods.includes(m)} onClick={() => setTonight({ ...tonight, moods: toggleIn(tonight.moods, m, 3) })}>{m}</Chip>
              ))}
            </Field>
            <Field label="Anything to avoid?">
              {AVOIDS.map((a) => (
                <Chip key={a} on={tonight.avoid.includes(a)} onClick={() => setTonight({ ...tonight, avoid: toggleIn(tonight.avoid, a) })}>{a}</Chip>
              ))}
            </Field>
            <Field label="How much time do we have?">
              {TIMES.map((t) => (
                <Chip key={t.k} on={tonight.time === t.k} onClick={() => setTonight({ ...tonight, time: t.k })}>{t.label}</Chip>
              ))}
            </Field>
            {isHost && (
              <div className="rounded-xl border border-white/10 bg-white/[0.02] p-3">
                <CourtSizePicker
                  value={courtSize}
                  onChange={(next) => {
                    setCourtSize(next);
                    try { localStorage.setItem(`court_size_${code}`, next); } catch { /* ignore */ }
                  }}
                />
                <p className="mt-2 text-[11px] text-slate-500">Only you set this — it applies to the whole room.</p>
              </div>
            )}
            <p className="text-[11px] text-slate-500">These apply to tonight only — your saved DNA is untouched.</p>
            <div className="flex flex-wrap gap-2">
              <button data-testid="tonight-ready" onClick={() => { setTonightDone(true); void saveTonight(tonight, true); }} className="btn-primary text-sm">I’m ready</button>
              <button data-testid="tonight-skip" onClick={() => { setTonightDone(true); void saveTonight(EMPTY_TONIGHT, true); }} className="btn-secondary text-sm">Skip for now</button>
            </div>
          </div>
        )}
      </section>

      {/* Stage 3 — Build the shortlist */}
      <section data-testid="court-shortlist" className="mt-4 rounded-2xl border border-white/10 bg-white/[0.03] p-4">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="text-base font-bold text-white">Add a possibility</h2>
          <span className="text-xs text-slate-500">{picks.length}/3 · optional</span>
        </div>
        <div className="relative mt-3">
          <label className="sr-only" htmlFor="court-search">Search a movie or show</label>
          <input id="court-search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search a movie or show" className="input" />
          {(hits.length > 0 || searching) && (
            <div className="absolute z-10 mt-1 max-h-64 w-full overflow-auto rounded-xl border border-white/10 bg-ink-900 shadow-xl">
              {searching && hits.length === 0 && <p className="p-3 text-xs text-slate-500">Searching…</p>}
              {hits.map((h) => {
                const already = picks.some((p) => keyOf(p) === keyOf(h));
                return (
                  <button key={keyOf(h)} onClick={() => addPick(h)} disabled={already || picks.length >= 3} className="flex w-full items-center gap-3 border-b border-white/5 p-2 text-left hover:bg-white/5 disabled:opacity-40">
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-semibold text-white">{h.title} {h.year ? <span className="text-slate-500">({h.year})</span> : null}</span>
                      <span className="block text-[11px] uppercase tracking-wide text-slate-500">{h.mediaType === 'tv' ? 'Show' : 'Movie'}</span>
                    </span>
                    <span aria-hidden className="flex-none text-brand-300">{already ? '✓' : '+'}</span>
                  </button>
                );
              })}
            </div>
          )}
        </div>
        {picks.length > 0 && (
          <ul className="mt-3 flex flex-wrap gap-2">
            {picks.map((p) => (
              <li key={keyOf(p)} className="inline-flex items-center gap-1.5 rounded-full border border-brand-400/40 bg-brand-500/15 py-1 pl-3 pr-1.5 text-xs font-semibold text-brand-100">
                <span className="max-w-[12rem] truncate">{p.title}</span>
                <button onClick={() => removePick(keyOf(p))} aria-label={`Remove ${p.title}`} className="grid h-4 w-4 place-items-center rounded-full bg-white/15 text-[10px] leading-none hover:bg-white/30">×</button>
              </li>
            ))}
          </ul>
        )}

        {err && <p role="alert" className="mt-3 text-xs text-red-300">{err}</p>}

        {isHost ? (
          <button
            data-testid="build-shortlist"
            onClick={buildShortlist}
            disabled={building || !roomReady(snapshot)}
            className="btn-primary mt-4 w-full py-3"
          >
            {building ? 'Building our shortlist…' : roomReady(snapshot) ? 'Build our shortlist' : 'Invite at least one more person'}
          </button>
        ) : (
          <p className="mt-4 text-sm text-slate-400" data-testid="guest-wait">{nextActionLabel(snapshot)}</p>
        )}
        <p className="mt-2 text-[11px] text-slate-500">
          Nobody has to search — WatchVerd1ct builds the shortlist from everyone’s DNA, tonight’s preferences and what you can actually watch.
        </p>
        {!shortlistReady(snapshot) && participants.length >= 2 && (
          <p className="mt-1 text-[11px] text-slate-500">Fewer than 3 possibilities so far. Building the shortlist will fill in verified options.</p>
        )}
      </section>

      {chatOpen && <ChatPanel messages={messages} me={myName} draft={draft} setDraft={setDraft} onSend={sendChat} onClose={() => setChatOpen(false)} failed={sendFailed} onRetry={() => sendFailed && sendChat(sendFailed)} />}
    </Shell>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <fieldset>
      <legend className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">{label}</legend>
      <div className="mt-1.5 flex flex-wrap gap-1.5">{children}</div>
    </fieldset>
  );
}

function Chip({ on, onClick, children }: { on: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      aria-pressed={on}
      onClick={onClick}
      className={`min-h-[36px] rounded-full border px-3 text-xs font-semibold transition ${
        on ? 'border-brand-400/60 bg-brand-500/20 text-brand-100' : 'border-white/12 bg-white/[0.04] text-slate-300 hover:bg-white/10'
      }`}
    >
      {on ? '✓ ' : ''}{children}
    </button>
  );
}

/** GROUP CHAT — bottom sheet on mobile, side panel from `sm` up. */
function ChatPanel({
  messages, me, draft, setDraft, onSend, onClose, failed, onRetry,
}: {
  messages: ChatMessage[]; me: string; draft: string; setDraft: (v: string) => void;
  onSend: (body: string) => void; onClose: () => void; failed: string | null; onRetry: () => void;
}) {
  const endRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => { endRef.current?.scrollIntoView({ block: 'end' }); }, [messages.length]);
  return (
    <div
      role="dialog"
      aria-label="Group chat"
      data-testid="group-chat"
      className="fixed inset-x-0 bottom-0 z-40 flex max-h-[70dvh] flex-col rounded-t-2xl border border-white/10 bg-ink-900/98 backdrop-blur sm:inset-y-0 sm:left-auto sm:right-0 sm:max-h-none sm:w-80 sm:rounded-none sm:rounded-l-2xl"
    >
      <div className="flex items-center justify-between border-b border-white/10 px-4 py-3">
        <h2 className="text-sm font-bold text-white">Group chat</h2>
        <button onClick={onClose} aria-label="Close group chat" className="min-h-[44px] px-2 text-slate-400 hover:text-white">Close</button>
      </div>
      <div className="flex-1 space-y-2 overflow-y-auto px-4 py-3">
        {messages.length === 0 && <p className="text-xs text-slate-500">No messages yet — say hello.</p>}
        {messages.map((m) => (
          <div key={m.id} className={`text-sm ${m.sender === me ? 'text-right' : ''}`}>
            <span className="text-[11px] text-slate-500">{m.sender}</span>
            <p className={`inline-block max-w-[85%] rounded-2xl px-3 py-1.5 ${m.sender === me ? 'bg-brand-500/25 text-white' : 'bg-white/[0.06] text-slate-200'}`}>{m.body}</p>
          </div>
        ))}
        <div ref={endRef} />
      </div>
      {failed && (
        <div className="mx-4 mb-2 flex items-center justify-between gap-2 rounded-lg border border-amber-400/30 bg-amber-500/10 px-2 py-1.5 text-[11px] text-amber-100">
          <span className="truncate">Didn’t send: {failed}</span>
          <button onClick={onRetry} className="flex-none font-bold underline">Retry</button>
        </div>
      )}
      <div className="border-t border-white/10 px-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-2">
        <div className="mb-2 flex gap-1.5 overflow-x-auto">
          {QUICK_REPLIES.map((qr) => (
            <button key={qr} onClick={() => onSend(qr)} className="flex-none rounded-full border border-white/12 px-2.5 py-1 text-[11px] text-slate-300 hover:bg-white/10">{qr}</button>
          ))}
        </div>
        <form
          onSubmit={(e) => { e.preventDefault(); onSend(draft); }}
          className="flex items-center gap-2"
        >
          <label className="sr-only" htmlFor="chat-input">Message</label>
          <input id="chat-input" data-testid="chat-input" value={draft} onChange={(e) => setDraft(e.target.value)} placeholder="Message the group" className="input flex-1" maxLength={500} />
          <button type="submit" data-testid="chat-send" disabled={!draft.trim()} className="btn-primary min-h-[44px] px-4 text-sm">Send</button>
        </form>
      </div>
    </div>
  );
}

function Shell({ children, onChat, unread = 0, sync }: { children: React.ReactNode; onChat?: () => void; unread?: number; sync?: SyncStatus }) {
  return (
    <div className="min-h-dvh pb-24 sm:pb-8">
      {/* The global build badge floats across the top of every screen, so the
          header reserves clearance for it (same rule as the app shell) — without
          this the wordmark and Group chat button sat under the badge. */}
      <header className="container-page flex min-h-14 flex-wrap items-center justify-between gap-3 pt-[calc(env(safe-area-inset-top)+1.5rem)]">
        <span className="inline-flex min-w-0 items-baseline gap-1.5 text-base">
          <WatchVerdictWordmark />
          <span className="whitespace-nowrap font-semibold text-slate-400">Court</span>
        </span>
        <span className="flex items-center gap-2">
          {sync && (
            <span
              data-testid="sync-status"
              data-sync={sync}
              title={syncLabel(sync)}
              className={`inline-flex items-center gap-1.5 rounded-lg border px-2 py-1 text-[11px] font-semibold ${
                sync === 'live'
                  ? 'border-emerald-400/40 bg-emerald-500/10 text-emerald-200'
                  : 'border-amber-400/40 bg-amber-500/10 text-amber-100'
              }`}
            >
              <span aria-hidden className={`h-1.5 w-1.5 rounded-full ${sync === 'live' ? 'bg-emerald-400' : 'bg-amber-400'}`} />
              {syncLabel(sync)}
            </span>
          )}
        {onChat && (
          <button onClick={onChat} data-testid="open-chat" className="relative min-h-[44px] rounded-xl border border-white/12 px-3 text-sm font-semibold text-slate-200 transition hover:bg-white/5">
            Group chat
            {unread > 0 && (
              <span data-testid="chat-unread" className="absolute -right-1 -top-1 grid h-5 min-w-5 place-items-center rounded-full bg-brand-500 px-1 text-[10px] font-black text-white">{unread}</span>
            )}
          </button>
        )}
        </span>
      </header>
      <main className="container-page mx-auto max-w-2xl py-3">{children}</main>
    </div>
  );
}
