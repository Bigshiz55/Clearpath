'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';
import {
  RoomPanel,
  RoomShell,
  type RoomPerson,
  type RoomStageKey,
} from '@/components/court/RoomShell';
import { CourtSizePicker } from '@/components/court/CourtSizePicker';
import { COURT_SIZES, DEFAULT_COURT_SIZE, type CourtSize } from '@/lib/court/pool';
import { asCourtSize } from '@/lib/court/roomSettings';
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
import { formatNames } from '@/lib/court/shareCard';
import { useVerdictReveal } from '@/components/court/useVerdictReveal';
import { ShareVerdictCard } from '@/components/court/ShareVerdictCard';

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
interface Participant { id: string; name: string; host?: boolean; ready?: boolean; pickCount?: number; reactionCount?: number; reactions?: Record<string, { r: Reaction; reason?: string }> }
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
  /** Room-level court size, written only by the host. */
  courtSize?: CourtSize;
  hostName?: string | null;
  sizeLocked?: boolean;
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
  // Court size is a ROOM setting owned by the host. The server row is the
  // authority; this is only the optimistic echo while a write is in flight, so
  // two devices can never end up believing different sizes.
  const [pendingSize, setPendingSize] = useState<CourtSize | null>(null);
  const [sizeBusy, setSizeBusy] = useState(false);
  // The Advanced disclosure (type / runtime / court size) — collapsed by
  // default; the defaults are what almost every room wants.
  const [advOpen, setAdvOpen] = useState(false);

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
        if (legacy.error.code === '42P01') {
          console.warn('[court] state RPC missing (42P01: court_state/court_state_v2 — migrations 0004/0014/0026 not applied)');
          setErr('This room isn’t available right now. Try again in a moment.');
        }
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

  /** Once the host has joined, link them to the room so every member can be
   *  shown WHO set the size, and so the roster can label them Host. */
  useEffect(() => {
    if (!hostToken || !participantId) return;
    if (state?.participants.some((p) => p.id === participantId && p.host)) return;
    // Older schema (pre-0030) simply has no Host badge — never a hard failure.
    void (async () => {
      const { error } = await supabase.rpc('court_claim_host', {
        p_code: code, p_host_token: hostToken, p_participant: participantId,
      });
      if (!error) void refresh();
    })();
  }, [hostToken, participantId, state?.participants, code, supabase, refresh]);

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

  /** HOST ONLY. Writes to the room, then tells everyone to re-read. The RPC
   *  returns the size actually in force, so a refused write (locked, or not the
   *  host) corrects this client instead of leaving it lying to its user. */
  async function changeCourtSize(next: CourtSize) {
    if (!hostToken || sizeLocked || next === courtSize) return;
    setPendingSize(next);
    setSizeBusy(true);
    const { data, error } = await supabase.rpc('court_set_size', {
      p_code: code, p_host_token: hostToken, p_size: next,
    });
    setSizeBusy(false);
    setPendingSize(null);
    if (error) {
      setErr('Could not change the court size. Everyone still sees the current setting.');
      void refresh();
      return;
    }
    if (typeof data === 'string' && data !== next) {
      setErr('The court is already being built, so the size stayed as it was.');
    }
    announce('state');
    void refresh();
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
      // No size in the body: the ROOM is the authority, so the server reads it
      // from the row the host wrote.
      body: JSON.stringify({ code, hostToken }),
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
  // HOISTED ABOVE THE STAGE BRANCHES — winner/vetoedList feed the reveal
  // sequence's hook, and hooks cannot be called conditionally inside a
  // stage's early return. Cheap and pure before Stage 5 (ranked is simply
  // empty), so computing it unconditionally costs nothing.
  const winner = useMemo(
    () => (appealed.length > 0 ? appealNext(candidates, appealed) : winnerOf(ranked)),
    [ranked, candidates, appealed],
  );
  const vetoedList = useMemo(() => ranked.filter((r) => r.vetoed), [ranked]);
  const reveal = useVerdictReveal(winner?.perMember.length ?? 0, vetoedList.length);
  const reactedCount = participants.filter((p) => (p.reactionCount ?? 0) > 0 || (p.id === participantId && Object.keys(myReactions).length > 0)).length;
  const snapshot = {
    participantCount: participants.length,
    candidateCount: candidates.length || participants.reduce((s, p) => s + (p.pickCount ?? 0), 0),
    reactedCount,
    stage: (state?.status === 'verdict' ? 'verdict' : state?.status === 'veto' ? 'reacting' : 'open') as 'open' | 'reacting' | 'verdict',
  };

  /**
   * WHERE THE ROOM IS, FOR THE RAIL.
   *
   * DERIVED FROM ROOM STATE, NEVER COUNTED. A step counter kept in this
   * component would drift the moment anyone else moved the room, and a late
   * joiner arriving during REACT would be shown the beginning. The rail says
   * where the ROOM is, which is the only thing worth showing several people at
   * once.
   *
   * The lobby is one screen carrying three of the five stages, so its position
   * comes from what the room has actually accumulated: nobody has nominated
   * anything yet means the room is still setting tonight, whatever the screen
   * happens to be scrolled to.
   */
  const roomStage: RoomStageKey = !participantId
    ? 'join'
    : state?.status === 'verdict'
      ? 'verdict'
      : state?.status === 'veto'
        ? 'react'
        : snapshot.candidateCount > 0
          ? 'shortlist'
          : 'tonight';

  /** Presence for the header — the room's own participants, never a stand-in. */
  const roomPeople: readonly RoomPerson[] = participants.map((p) => ({
    id: p.id,
    name: p.name,
    host: p.host,
    ready: p.ready,
  }));

  // ---- Invite (a SUMMONS, not just a link) ----
  async function shareInvite() {
    if (!shareUrl) return;
    const share = (navigator as Navigator & { share?: (d: ShareData) => Promise<void> }).share;
    if (share) {
      try {
        await share({
          title: '⚖️ You are summoned to WatchVerd1ct Court',
          text: 'Official summons — appear before the Court and help decide what we watch tonight:',
          url: shareUrl,
        });
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
      <Shell sync={sync} stage="join">
        {/* THE ROOM IS GONE, AND THE ROOM SAYS SO. Still inside the room's own
            shell rather than dumped onto a bare page: an error that throws away
            the surrounding place reads as the app breaking, when what actually
            happened is that a session ended, which is normal. */}
        <RoomPanel tone="warn" data-testid="court-not-found" className="wv-room-enter p-8 text-center">
          <p className="text-base font-bold text-white">This room has closed</p>
          <p className="mx-auto mt-1.5 max-w-sm text-sm text-amber-100/80">
            The Verdict Room you were sent to has ended, or the link is no longer valid. Any room
            you start yourself will still be here.
          </p>
          <Link href="/app/together" className="btn-secondary mt-5 inline-flex">Open the Verdict Room</Link>
        </RoomPanel>
      </Shell>
    );
  }
  if (!state) {
    /* LOADING IS A ROOM WITH THE LIGHTS ON AND NOBODY IN IT YET, not a spinner
       on a black page. The shell, the rail and the floor are all already known;
       the only thing being waited for is the room's contents, so only that part
       is allowed to be absent. */
    return (
      <Shell sync={sync} stage="join">
        <RoomPanel data-testid="court-connecting" className="wv-room-enter p-8 text-center">
          <p className="text-sm font-semibold text-slate-300">Connecting to your group…</p>
          <div aria-hidden className="mx-auto mt-4 flex max-w-xs flex-col gap-2.5">
            {[0, 1, 2].map((i) => (
              <span
                key={i}
                className="h-3 rounded-full bg-white/[0.06]"
                style={{ width: `${100 - i * 18}%` }}
              />
            ))}
          </div>
        </RoomPanel>
      </Shell>
    );
  }

  const isHost = !!hostToken;
  // The room's value wins; `pendingSize` only covers the round-trip so the
  // host's own tap feels instant without ever becoming a competing source.
  const roomSize = asCourtSize(state?.courtSize);
  const courtSize: CourtSize = pendingSize ?? roomSize;
  const hostName = state?.hostName ?? null;
  const sizeLocked = state?.sizeLocked ?? (state != null && state.status !== 'lobby');

  // =========================== STAGE 1 — JOIN ===============================
  // Shown whenever this device has no identity in the room — including a LATE
  // join while the group is already reacting, and a refresh that lost local
  // storage. Without this, an unjoined visitor saw reaction controls that
  // silently did nothing.
  if (!participantId && state.status !== 'verdict') {
    return (
      <Shell sync={sync} stage="join" people={roomPeople} code={code}>
        <RoomPanel
          tone="decisive"
          data-testid="court-join"
          className="wv-room-enter mx-auto max-w-xl p-5 sm:p-6"
        >
          <p className="text-[11px] font-black uppercase tracking-widest text-gold-300">⚖️ Official summons</p>
          <h1 className="mt-1 text-lg font-bold text-white">
            {hostName ? `${hostName} summoned you` : 'You’ve been summoned to Court'}
          </h1>
          <p className="mt-1 text-sm text-slate-400">
            Appear before the Court and help decide what to watch. Add your name to answer the summons — no account needed.
          </p>
          {/* WHO'S ALREADY IN THE ROOM — the social proof that makes a bare
              name field feel like a party instead of a form. Everything here
              is the room state we already poll: the host's name above, and
              each joined member as an initial-chip. Nothing new is fetched. */}
          {participants.length > 0 && (
            <div className="mt-3 flex items-center gap-2" data-testid="join-roster">
              <div className="flex -space-x-2" aria-hidden>
                {participants.slice(0, 6).map((p) => (
                  <span
                    key={p.id}
                    title={p.name}
                    className={`grid h-8 w-8 place-items-center rounded-full border-2 border-ink-950 text-xs font-black uppercase ${
                      p.host ? 'bg-gold-500/80 text-ink-950' : 'bg-brand-500/70 text-white'
                    }`}
                  >
                    {p.name.trim().charAt(0) || '?'}
                  </span>
                ))}
              </div>
              <span className="text-xs text-slate-300">
                {participants.length === 1
                  ? `${participants[0]!.name} is already in the room`
                  : `${participants.length} already in the room`}
              </span>
            </div>
          )}
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
          {/* CONTRAST, AND AN HONEST DISABLED STATE. `btn-primary`'s white on
              brand-500 sits at ~4.5:1 — borderline — and its disabled state
              was the same blue at reduced opacity, so the button looked
              broken-grey-on-blue while waiting for a name. Enabled is white
              on brand-600 (≈6.4:1); disabled is a plainly different control:
              flat dark fill, muted text, no glow. */}
          <button
            onClick={join}
            disabled={joining || !name.trim()}
            data-testid="join-court"
            className="mt-4 w-full rounded-xl bg-brand-600 py-3 text-base font-bold text-white shadow-glow transition hover:bg-brand-500 disabled:bg-white/10 disabled:text-slate-500 disabled:shadow-none"
          >
            {joining ? 'Joining…' : 'Join Court'}
          </button>
        </RoomPanel>
      </Shell>
    );
  }

  // ===================== STAGE 5 — FINAL VERD1CT ============================
  // §4 REVEAL SEQUENCE. `winner`/`vetoedList`/`reveal` are computed above the
  // branches (hooks can't be conditional). Nothing about the DATA changes
  // here — scoring, veto rules and room state are all untouched — only WHEN
  // the client shows what it already fully holds: jurors' scores flip in one
  // at a time, then the vetoed titles cross out with who struck them, then
  // the winning title itself resolves last. `reveal.winnerRevealed` starts
  // true under prefers-reduced-motion (see useVerdictReveal), so that path
  // renders the final state on the very first frame — sequence honoured,
  // wait removed.
  if (state.status === 'verdict' && ranked.length > 0) {
    const backup = winnerOf(groupRank(candidates.filter((c) => c.key !== winner?.key && !appealed.includes(c.key))));
    const note = partialNote(snapshot);
    if (!winner) {
      return (
        <Shell sync={sync} stage="verdict" people={roomPeople} code={code}>
          <RoomPanel tone="warn" data-testid="court-verdict-empty" className="wv-room-enter mx-auto max-w-xl p-5 sm:p-6">
            <h1 className="text-lg font-bold text-white">No option survived</h1>
            <p className="mt-1 text-sm text-amber-100">Every title was vetoed or appealed. Remove a veto or add more possibilities to get a Verd1ct.</p>
            <button onClick={() => setAppealed([])} className="btn-secondary mt-4">Reconsider all titles</button>
          </RoomPanel>
        </Shell>
      );
    }
    const f = (state.finalists ?? []).find((x) => keyOf(x) === winner.key);
    return (
      <Shell onChat={() => setChatOpen(true)} unread={unread} sync={sync} stage="verdict" people={roomPeople} code={code}>
        <section data-testid="court-verdict" className="wv-room-enter relative">
          {/* THE ONE FLOURISH THE ROOM GETS, AND IT LANDS ONCE.
              A single slow bloom behind the title at the moment it resolves —
              no loop, nothing that keeps moving afterwards. It is keyed to
              `winnerRevealed` so it cannot fire while the room is still
              tallying, and under reduced motion the global rule collapses it to
              a still glow, which is the correct end state rather than nothing. */}
          {reveal.winnerRevealed && (
            <span
              aria-hidden
              data-testid="verdict-bloom"
              className="wv-room-verdict pointer-events-none absolute left-1/2 top-[-12%] -ml-[42%] h-[46vh] w-[84%] rounded-full bg-[radial-gradient(ellipse_at_top,rgba(120,160,255,0.3),rgba(255,20,147,0.1)_46%,transparent_72%)] blur-3xl"
            />
          )}
          <div className="relative">
            <p className="text-[10px] font-black uppercase tracking-[0.24em] text-brand-300/80">
              Your group’s Verd1ct
            </p>
            <h1
              className="mt-1.5 text-[clamp(1.9rem,7.5vw,3.25rem)] font-black leading-[0.98] tracking-[-0.02em] text-white"
              data-testid="verdict-headline"
            >
              {reveal.winnerRevealed ? (
                <>{winner.title}{f?.year ? <span className="font-bold text-slate-400"> ({f.year})</span> : null}</>
              ) : (
                <span className="text-slate-400">Tallying the votes…</span>
              )}
            </h1>
          </div>

          {/* JURORS' SCORES FLIP IN FIRST — for the title the room is about to
              name, before it's named. Named again on the reveal (the title
              text above), so nothing here spoils it early or leaves it
              unexplained. */}
          <div className="mt-4" data-testid="verdict-jury-reveal">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">Everyone’s score for tonight’s winner</p>
            {/* A HISTOGRAM, BECAUSE THE SHAPE IS THE STORY.
                Three chips reading 88 / 74 / 91 are three numbers to compare in
                your head; three bars are one picture of whether the room agreed
                or merely out-voted somebody. Every value is the engine's own
                per-member score, unchanged — this gives it a length. The
                reveal order is untouched: a bar that has not flipped yet shows
                its track and no fill, so nothing is spoiled early. */}
            <div className="mt-2 space-y-1.5">
              {winner.perMember.map((m, i) => {
                const shown = i < reveal.revealedJurors;
                return (
                  <span
                    key={m.name}
                    data-testid="verdict-juror"
                    data-revealed={shown ? 'true' : 'false'}
                    className="flex items-center gap-2.5"
                  >
                    <span className="w-[5.5rem] shrink-0 truncate text-[13px] font-semibold text-slate-300">{m.name}</span>
                    <span className="h-2 min-w-0 flex-1 overflow-hidden rounded-full bg-white/10">
                      <span
                        aria-hidden
                        className="block h-full rounded-full bg-gradient-to-r from-brand-300 to-fuchsia-300 transition-[width] duration-700"
                        style={{ width: shown ? `${Math.max(0, Math.min(100, m.score))}%` : '0%' }}
                      />
                    </span>
                    {shown ? (
                      <b className="wv-flip-in w-8 shrink-0 text-right tabular-nums text-white">{m.score}</b>
                    ) : (
                      <b aria-hidden className="w-8 shrink-0 text-right tabular-nums text-slate-600">···</b>
                    )}
                  </span>
                );
              })}
            </div>
          </div>

          {/* THEN THE VETOED TITLES — struck through, naming who struck them. */}
          {vetoedList.length > 0 && (
            <div className="mt-4 space-y-1.5" data-testid="verdict-veto-reveal">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">Titles the room vetoed</p>
              {vetoedList.slice(0, reveal.revealedVetoes).map((v) => (
                <p key={v.key} data-testid="verdict-veto-row" className="wv-reveal-in text-sm">
                  <span className="text-slate-500 line-through">{v.title}</span>{' '}
                  <span className="text-red-300">— vetoed by {formatNames(v.vetoedBy)}</span>
                </p>
              ))}
            </div>
          )}

          {/* THE WINNER RESOLVES LAST — poster, group match, why it won,
              availability and the action row all arrive together, once the
              evidence above has finished making its case. A fixed-height
              skeleton holds the space so nothing jumps when it does. */}
          <div className={`mt-5 ${reveal.winnerRevealed ? 'wv-verdict-in' : ''}`} data-testid="verdict-winner">
            {!reveal.winnerRevealed ? (
              <div aria-hidden className="animate-pulse space-y-3" data-testid="verdict-winner-pending">
                <div className="flex flex-col gap-4 sm:flex-row">
                  <div className="h-48 w-32 flex-none rounded-xl bg-white/5" />
                  <div className="min-w-0 flex-1 space-y-3">
                    <div className="h-10 w-24 rounded bg-white/5" />
                    <div className="h-4 w-48 rounded bg-white/5" />
                    <div className="h-4 w-64 rounded bg-white/5" />
                  </div>
                </div>
              </div>
            ) : (
              <>
                {note && <p data-testid="partial-note" className="mb-3 text-xs text-amber-200">{note}</p>}
                <div className="flex flex-col gap-4 sm:flex-row">
                  {f?.posterUrl && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={f.posterUrl} alt={`Poster for ${winner.title}`} className="h-48 w-32 flex-none rounded-xl border border-white/10 object-cover" />
                  )}
                  <div className="min-w-0 flex-1 space-y-3">
                    <div>
                      <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">Group match</div>
                      <div data-testid="group-match" className="text-4xl font-black tabular-nums text-white">{winner.groupScore}</div>
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
                    className="min-h-[44px] rounded-xl border border-white/12 px-3 py-2 text-sm font-semibold text-slate-300 transition hover:bg-white/5"
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

                {/* §1–§3 THE SHAREABLE VERD1CT CARD. Only once the winner has
                    actually resolved — sharing an image before the room's own
                    reveal has finished would spoil it for the room itself. */}
                <div className="mt-5">
                  <ShareVerdictCard
                    data={{
                      title: winner.title,
                      year: f?.year ?? null,
                      posterUrl: f?.posterUrl ?? null,
                      groupScore: winner.groupScore,
                      joinUrl: shareUrl,
                      jurors: winner.perMember,
                      vetoed: vetoedList.map((v) => ({ title: v.title, byNames: v.vetoedBy })),
                    }}
                  />
                </div>

                {/* WHERE THE EVENING GOES NEXT.
                    The room had two continuations and neither was reachable
                    from the screen you actually end on. "Appeal" above is the
                    another-round path INSIDE this room — strike the winner and
                    let the next candidate stand — and it is the right default,
                    because the shortlist everyone built is still good. A fresh
                    room is a different act: new night, new shortlist, and it
                    lived only back at `/app/together` with nothing pointing at
                    it. Quiet, and below the share card, because most rooms end
                    here. */}
                <div
                  data-testid="verdict-continue"
                  className="mt-6 flex flex-wrap items-center gap-x-4 gap-y-2 border-t border-white/[0.07] pt-4 text-[13px]"
                >
                  <span className="text-slate-500">Not this one?</span>
                  <span className="text-slate-400">
                    Appeal it above to hand the night to {backup ? backup.title : 'the next title'}.
                  </span>
                  <Link
                    href="/app/together"
                    data-testid="verdict-new-room"
                    className="inline-flex min-h-[44px] items-center font-semibold text-brand-200 underline decoration-dotted underline-offset-4 transition hover:text-white"
                  >
                    Start a new room
                  </Link>
                </div>
              </>
            )}
          </div>
        </section>
        {chatOpen && <ChatPanel messages={messages} me={myName} draft={draft} setDraft={setDraft} onSend={sendChat} onClose={() => setChatOpen(false)} failed={sendFailed} onRetry={() => sendFailed && sendChat(sendFailed)} />}
      </Shell>
    );
  }

  // ==================== STAGE 4 — REACT TOGETHER ============================
  if (state.status === 'veto' && ranked.length > 0) {
    return (
      <Shell onChat={() => setChatOpen(true)} unread={unread} sync={sync} stage="react" people={roomPeople} code={code}>
        <section data-testid="court-react" className="wv-room-enter">
          <StageHeading
            eyebrow="Stage four"
            title="React together"
            note={nextActionLabel(snapshot)}
            noteTestId="react-status"
          />
          <div className="mt-4 space-y-3">
            {ranked.map((r, i) => {
              const f = (state.finalists ?? []).find((x) => keyOf(x) === r.key);
              const mineR = myReactions[r.key];
              const leading = i === 0 && !r.vetoed;
              return (
                <article
                  key={r.key}
                  data-testid="react-card"
                  data-key={r.key}
                  data-leading={leading ? '1' : '0'}
                  /* THE STAGGER IS CAPPED. A Deep court carries sixteen
                     candidates, and an uncapped 70ms step would leave the last
                     one arriving 1.1 seconds after the first — which stops
                     being a deal and becomes a wait. Six steps is the whole
                     effect; everything past that lands with the sixth. */
                  style={{ '--wv-room-step': Math.min(i, 5) } as React.CSSProperties}
                  /* A CANDIDATE IS A PLATE ON A STAGE, NOT A ROW IN A TABLE.
                     The leading title is lit and the vetoed one is struck —
                     both states drawn from the engine's own verdict, so the
                     lighting is never decoration. */
                  className={`wv-room-enter relative overflow-hidden rounded-2xl border p-3 transition ${
                    r.vetoed
                      ? 'border-red-400/35 bg-[linear-gradient(160deg,rgba(255,80,80,0.09),rgba(8,10,18,0.66))]'
                      : leading
                        ? 'border-brand-400/35 bg-[linear-gradient(160deg,rgba(79,134,255,0.13),rgba(8,10,18,0.68))] shadow-[0_26px_60px_-42px_rgba(79,134,255,0.7)]'
                        : 'border-white/10 bg-[linear-gradient(160deg,rgba(255,255,255,0.05),rgba(8,10,18,0.62))]'
                  }`}
                >
                  <span
                    aria-hidden
                    className="pointer-events-none absolute inset-x-0 top-0 h-px bg-[linear-gradient(to_right,transparent,rgba(255,255,255,0.2),transparent)]"
                  />
                  <div className="flex gap-3">
                    <PosterFrame url={f?.posterUrl ?? null} title={r.title} vetoed={r.vetoed} />
                    <div className="min-w-0 flex-1">
                      <h2 className="line-clamp-2 text-[15px] font-black leading-tight text-white">{r.title}{f?.year ? <span className="font-bold text-slate-400"> ({f.year})</span> : null}</h2>
                      <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] text-slate-400">
                        <span className="rounded bg-white/10 px-1.5 py-0.5 font-bold uppercase tracking-wide text-slate-300">{f?.mediaType === 'tv' ? 'Show' : 'Movie'}</span>
                        {f && f.streaming.length > 0 && <span className="truncate">{f.streaming[0]}</span>}
                      </div>
                      {/* THE GROUP'S FIT, AS A LENGTH RATHER THAN A NUMBER TO
                          PARSE. Same figure the engine computed; a bar is what
                          makes three candidates comparable at a glance. */}
                      <GroupMatchMeter score={r.groupScore} leading={leading} />
                      {r.reasons[0] && <p className="mt-1.5 text-[11px] leading-snug text-slate-400">{r.reasons[0]}</p>}
                      {f && f.pickedBy.length > 0 && <p className="mt-0.5 text-[11px] text-emerald-200">Added by {f.pickedBy.join(', ')}</p>}
                      {r.vetoed && <p data-testid="vetoed-flag" className="mt-1 text-[11px] font-bold text-red-200">Removed by veto — {r.vetoedBy.join(', ')}</p>}
                    </div>
                  </div>
                  <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
                    {/* THREE KEYS, AND THEY LOOK LIKE THREE DIFFERENT ANSWERS.
                        Unselected, they were three identical grey rectangles, so
                        the difference between "watch it" and "pass" existed only
                        in the word — and this is the control the whole room
                        spends its time on. Each now carries a hint of its own
                        colour before it is pressed and the full weight after, so
                        the row reads as a ballot rather than a segmented
                        control. The pressed state is unchanged in meaning and
                        still carries `aria-pressed`. */}
                    {(['for', 'maybe', 'pass'] as const).map((r2) => (
                      <button
                        key={r2}
                        data-testid={`react-${r2}`}
                        aria-pressed={mineR === r2}
                        onClick={() => void react(r.key, r2)}
                        disabled={busy}
                        className={`min-h-[44px] flex-1 rounded-xl border px-3 text-xs font-bold uppercase tracking-wide transition ${
                          mineR === r2
                            ? r2 === 'for' ? 'border-emerald-400/70 bg-emerald-500/25 text-emerald-100 shadow-[0_10px_26px_-14px_rgba(52,211,153,0.9)]'
                              : r2 === 'maybe' ? 'border-gold-400/70 bg-gold-500/20 text-gold-200 shadow-[0_10px_26px_-14px_rgba(230,173,51,0.9)]'
                              : 'border-slate-300/50 bg-white/12 text-slate-100'
                            : r2 === 'for' ? 'border-emerald-400/20 bg-emerald-500/[0.06] text-emerald-200/75 hover:border-emerald-400/45 hover:bg-emerald-500/15'
                              : r2 === 'maybe' ? 'border-gold-400/20 bg-gold-500/[0.06] text-gold-200/75 hover:border-gold-400/45 hover:bg-gold-500/15'
                              : 'border-white/12 bg-white/[0.04] text-slate-400 hover:bg-white/10 hover:text-slate-200'
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
            // THE ONE GATE THAT REMAINS. Everything before this point works
            // solo; a Verd1ct for a jury of one is not a group decision, so
            // the reveal — and only the reveal — waits for a second juror.
            <button
              onClick={revealVerdict}
              disabled={busy || !roomReady(snapshot)}
              data-testid="reveal"
              className="btn-primary mt-4 w-full py-3 disabled:bg-white/10 disabled:text-slate-500 disabled:shadow-none"
            >
              {nextActionLabel(snapshot)}
            </button>
          )}
        </section>
        {chatOpen && <ChatPanel messages={messages} me={myName} draft={draft} setDraft={setDraft} onSend={sendChat} onClose={() => setChatOpen(false)} failed={sendFailed} onRetry={() => sendFailed && sendChat(sendFailed)} />}
      </Shell>
    );
  }

  // ============ STAGES 2 + 3 — SET TONIGHT · BUILD THE SHORTLIST ============
  // THREE COLUMNS FROM `xl` (1280): jury roster + room controls on the left,
  // the court itself in the middle, the live activity feed on the right.
  // A single column below 1280 — the phone flow is untouched.
  return (
    <Shell wide onChat={() => setChatOpen(true)} unread={unread} sync={sync} stage={roomStage} people={roomPeople} code={code}>
      <div className="xl:grid xl:grid-cols-3 xl:items-start xl:gap-5" data-testid="lobby-grid">
      {/* Your group */}
      <RoomPanel data-testid="court-group" className="wv-room-enter p-4" style={{ '--wv-room-step': 0 } as React.CSSProperties}>
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h1 className="text-base font-black tracking-tight text-white">Your group</h1>
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
              <span className="min-w-0 flex-1 truncate text-sm text-white">
                {p.name}
                {p.host && (
                  <span data-testid="host-badge" className="ml-1.5 rounded-md border border-brand-400/40 bg-brand-500/15 px-1.5 py-0.5 align-middle text-[10px] font-black uppercase tracking-wide text-brand-200">
                    Host
                  </span>
                )}
              </span>
              <span data-testid="participant-status" className={`flex-none text-[11px] ${p.ready ? 'text-emerald-300' : 'text-slate-400'}`}>
                {participantStatus(p)}
              </span>
            </li>
          ))}
        </ul>

        {/* Invite — compact, no raw URL */}
        <div className="mt-4 border-t border-white/10 pt-3">
          <div className="flex flex-wrap items-center gap-2">
            <button onClick={shareInvite} data-testid="share-invite" className="btn-primary text-sm">📜 Send summons</button>
            <button onClick={toggleQr} data-testid="show-qr" className="btn-secondary text-sm">{qr ? 'Hide QR code' : 'Show QR code'}</button>
            <button onClick={copyLink} data-testid="copy-link" className="min-h-[44px] rounded-xl border border-white/12 px-3 py-2 text-sm text-slate-300 transition hover:bg-white/5">Copy link</button>
            <span className="ml-auto font-mono text-xs tracking-widest text-slate-400">{code}</span>
          </div>
          {(copied || shared) && <p role="status" data-testid="invite-feedback" className="mt-2 text-xs text-emerald-300">{copied ? 'Link copied' : 'Summons ready to send'}</p>}
          {qr && <div data-testid="qr" className="mx-auto mt-3 h-40 w-40 rounded-lg bg-white p-2" dangerouslySetInnerHTML={{ __html: qr }} />}
        </div>
      </RoomPanel>

      {/* CENTER COLUMN — the court itself. */}
      <div>
      {/* Stage 2 — Set tonight. TWO QUESTIONS BY DEFAULT: what sounds good and
          what to avoid. Content type and runtime are real controls but their
          DEFAULTS ("Either", "No limit") are what almost every room wants, so
          they live behind Advanced with the room-size setting instead of
          costing every juror two more decisions. The whole default form fits a
          900px viewport without scrolling. */}
      <RoomPanel data-testid="court-tonight" className="wv-room-enter mt-4 p-4 xl:mt-0" style={{ '--wv-room-step': 1 } as React.CSSProperties}>
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="text-base font-black tracking-tight text-white">Tonight’s preferences</h2>
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
          </p>
        ) : (
          <div className="mt-3 space-y-3">
            <Field label="What sounds good? (up to 3)">
              {MOODS.map((m) => (
                <Chip
                  key={m}
                  context="Sounds good"
                  on={tonight.moods.includes(m)}
                  // A GENRE CANNOT BE WANTED AND AVOIDED AT ONCE. Horror sits in
                  // both lists; picking it in one disables it in the other, and
                  // toggling it on scrubs it from the other side defensively.
                  disabled={tonight.avoid.includes(m)}
                  disabledReason="in your avoid list"
                  onClick={() => setTonight({ ...tonight, moods: toggleIn(tonight.moods, m, 3), avoid: tonight.avoid.filter((x) => x !== m) })}
                >
                  {m}
                </Chip>
              ))}
            </Field>
            <Field label="Anything to avoid?">
              {AVOIDS.map((a) => (
                <Chip
                  key={a}
                  context="Avoid"
                  on={tonight.avoid.includes(a)}
                  disabled={tonight.moods.includes(a)}
                  disabledReason="in your sounds-good list"
                  onClick={() => setTonight({ ...tonight, avoid: toggleIn(tonight.avoid, a), moods: tonight.moods.filter((x) => x !== a) })}
                >
                  {a}
                </Chip>
              ))}
            </Field>

            {/* ADVANCED — everything with a good default. Content type
                ("Either") and runtime ("No limit") for everyone; the room-size
                setting rides along here too (the host's selector, a member's
                read-only note), collapsed until asked for. */}
            <div className="border-t border-white/10 pt-3">
              <button
                type="button"
                data-testid="advanced-toggle"
                aria-expanded={advOpen}
                onClick={() => setAdvOpen((o) => !o)}
                /* A 16px tap target on a phone. It stays a text control — it is
                   a disclosure, not an action, and making it a button would give
                   it weight it should not have — but the box it lives in is now
                   thumb-sized. Inline padding only, so the underline still hugs
                   the words. */
                className="inline-flex min-h-[44px] items-center text-xs font-semibold text-slate-400 underline decoration-dotted underline-offset-2 hover:text-white"
              >
                {advOpen ? 'Hide advanced' : 'Advanced — type, runtime & court size'}
              </button>
              {advOpen && (
                <div className="mt-3 space-y-3" data-testid="advanced-panel">
                  <Field label="What are we watching?">
                    {KINDS.map((k) => (
                      <Chip key={k.k} on={tonight.kind === k.k} onClick={() => setTonight({ ...tonight, kind: k.k })}>{k.label}</Chip>
                    ))}
                  </Field>
                  <Field label="How much time do we have?">
                    {TIMES.map((t) => (
                      <Chip key={t.k} on={tonight.time === t.k} onClick={() => setTonight({ ...tonight, time: t.k })}>{t.label}</Chip>
                    ))}
                  </Field>
                  <CourtSizePicker
                    value={courtSize}
                    onChange={changeCourtSize}
                    isHost={isHost}
                    hostName={hostName}
                    locked={sizeLocked}
                    busy={sizeBusy}
                  />
                </div>
              )}
            </div>

            <p className="text-[11px] text-slate-500">These apply to tonight only — your saved DNA is untouched.</p>
            <div className="flex flex-wrap gap-2">
              <button data-testid="tonight-ready" onClick={() => { setTonightDone(true); void saveTonight(tonight, true); }} className="btn-primary text-sm">I’m ready</button>
              <button data-testid="tonight-skip" onClick={() => { setTonightDone(true); void saveTonight(EMPTY_TONIGHT, true); }} className="btn-secondary text-sm">Skip for now</button>
            </div>
          </div>
        )}
      </RoomPanel>

      {/* Stage 3 — Build the shortlist */}
      <RoomPanel data-testid="court-shortlist" className="wv-room-enter mt-4 p-4" style={{ '--wv-room-step': 2 } as React.CSSProperties}>
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="text-base font-black tracking-tight text-white">Add a possibility</h2>
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
          <>
            {/* SOLO IS A REAL STATE, NOT A LOCKED DOOR. The host can build and
                preview the whole court alone — the only thing a second juror
                unlocks is the final Verd1ct, and THAT gate lives on the reveal
                button, where it belongs. */}
            <button
              data-testid="build-shortlist"
              onClick={buildShortlist}
              disabled={building}
              className="btn-primary mt-4 w-full py-3"
            >
              {building ? 'Building our shortlist…' : 'Build our shortlist'}
            </button>
            {!roomReady(snapshot) && (
              <p className="mt-2 text-[11px] text-slate-500" data-testid="solo-note">
                You can build and preview the court solo — the final Verd1ct unlocks when one more person joins.
              </p>
            )}
          </>
        ) : (
          <p className="mt-4 text-sm text-slate-400" data-testid="guest-wait">{nextActionLabel(snapshot)}</p>
        )}
        <p className="mt-2 text-[11px] text-slate-500">
          Nobody has to search — WatchVerd1ct builds the shortlist from everyone’s DNA, tonight’s preferences and what you can actually watch.
        </p>
        {!shortlistReady(snapshot) && participants.length >= 2 && (
          <p className="mt-1 text-[11px] text-slate-500">Fewer than 3 possibilities so far. Building the shortlist will fill in verified options.</p>
        )}
      </RoomPanel>
      </div>

      {/* RIGHT COLUMN — the live activity feed, desktop only. Below `xl` the
          floating Group chat panel carries the same conversation. */}
      <ActivityFeed
        participants={participants}
        messages={messages}
        me={myName}
        draft={draft}
        setDraft={setDraft}
        onSend={sendChat}
      />
      </div>

      {chatOpen && <ChatPanel messages={messages} me={myName} draft={draft} setDraft={setDraft} onSend={sendChat} onClose={() => setChatOpen(false)} failed={sendFailed} onRetry={() => sendFailed && sendChat(sendFailed)} />}
    </Shell>
  );
}

/**
 * THE LIVE ACTIVITY FEED — the lobby's right column from `xl`. Joins and
 * ready-states from the roster the room already polls, then the group chat
 * inline (same messages, same send RPC as the floating panel — one
 * conversation, two viewports). Nothing here is a new data source.
 */
function ActivityFeed({
  participants,
  messages,
  me,
  draft,
  setDraft,
  onSend,
}: {
  participants: Participant[];
  messages: ChatMessage[];
  me: string;
  draft: string;
  setDraft: (v: string) => void;
  onSend: (body: string) => void;
}) {
  return (
    <aside className="hidden xl:flex xl:max-h-[80vh] xl:flex-col xl:rounded-2xl xl:border xl:border-white/10 xl:bg-white/[0.03] xl:p-4" data-testid="activity-feed">
      <h2 className="text-base font-bold text-white">Live activity</h2>
      <ul className="mt-2 space-y-1 text-xs text-slate-400">
        {participants.map((p) => (
          <li key={p.id} data-testid="activity-event">
            <span className="font-semibold text-slate-300">{p.name}</span>
            {p.host ? ' opened the court' : ' joined'}
            {p.ready ? ' · ready' : ''}
          </li>
        ))}
      </ul>
      <div className="mt-3 min-h-0 flex-1 space-y-2 overflow-y-auto border-t border-white/10 pt-3">
        {messages.length === 0 ? (
          <p className="text-xs text-slate-500">No messages yet — say hi while everyone assembles.</p>
        ) : (
          messages.map((m) => (
            <p key={m.id} className="text-sm leading-snug">
              <span className={`font-bold ${m.sender === me ? 'text-brand-200' : 'text-white'}`}>{m.sender}</span>{' '}
              <span className="text-slate-300">{m.body}</span>
            </p>
          ))
        )}
      </div>
      <form
        className="mt-3 flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          if (draft.trim()) onSend(draft.trim());
        }}
      >
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder="Message the room…"
          aria-label="Message the room"
          className="input min-w-0 flex-1"
        />
        <button type="submit" className="btn-secondary flex-none text-sm">Send</button>
      </form>
    </aside>
  );
}

/**
 * A STAGE'S OWN TITLE.
 *
 * Every stage used to open with `<h1 className="text-lg font-bold">`, which is
 * the same weight the app gives a settings section. A room that runs five acts
 * should say which act you are in, and the eyebrow is what makes the rail above
 * mean something rather than being a decoration nobody maps to the screen.
 */
function StageHeading({
  eyebrow,
  title,
  note,
  noteTestId,
}: {
  eyebrow: string;
  title: string;
  note?: string;
  noteTestId?: string;
}) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-x-3 gap-y-1">
      <div className="min-w-0">
        <p className="text-[10px] font-black uppercase tracking-[0.24em] text-brand-300/80">{eyebrow}</p>
        <h1 className="mt-0.5 text-[22px] font-black leading-tight tracking-tight text-white sm:text-[26px]">
          {title}
        </h1>
      </div>
      {note && (
        <span data-testid={noteTestId} className="shrink-0 text-xs text-slate-400">
          {note}
        </span>
      )}
    </div>
  );
}

/**
 * A candidate's artwork, or the absence of it treated as a designed state.
 *
 * "No art" in a grey box was the honest answer and looked like a broken image.
 * A poster-shaped frame with the room's own light in it reads as a plate on a
 * stage that happens to carry no image — which is what it is. Nothing here
 * invents artwork; the frame is empty when the title has none.
 */
function PosterFrame({ url, title, vetoed = false }: { url: string | null; title: string; vetoed?: boolean }) {
  return (
    <div
      className={`relative h-[104px] w-[70px] flex-none overflow-hidden rounded-lg border ${
        vetoed ? 'border-red-400/25' : 'border-white/12'
      }`}
    >
      {url ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={url} alt={`Poster for ${title}`} className={`h-full w-full object-cover ${vetoed ? 'opacity-45 saturate-0' : ''}`} />
      ) : (
        <>
          <span
            aria-hidden
            className="absolute inset-0 bg-[linear-gradient(160deg,rgba(120,150,220,0.16),rgba(10,12,22,0.9))]"
          />
          <span
            aria-hidden
            className="absolute inset-x-0 bottom-0 h-1/2 bg-[radial-gradient(ellipse_at_bottom,rgba(140,170,255,0.16),transparent_70%)]"
          />
          {/* NO TITLE PRINTED IN THE FRAME. The first pass put it here and it
              was wrong twice over: the heading sits two centimetres to the
              right, so the name was on screen twice, and it gave a screen
              reader the same words back to back. An empty plate that is LIT
              reads as artwork we do not have; a plate with a label on it reads
              as a broken image with alt text. */}
        </>
      )}
      {vetoed && (
        <span aria-hidden className="absolute inset-0 grid place-items-center">
          <span className="h-px w-[130%] rotate-[-32deg] bg-red-300/70" />
        </span>
      )}
    </div>
  );
}

/**
 * How well the room as a whole fits this title.
 *
 * The number is the engine's `groupScore` unchanged — this only gives it a
 * length, because "79" and "42" side by side are two facts to compare and two
 * bars are one glance. The leading candidate's bar carries the room's accent so
 * the ranking is legible without reading any digits at all.
 */
function GroupMatchMeter({ score, leading }: { score: number; leading: boolean }) {
  const pct = Math.max(0, Math.min(100, score));
  return (
    <div className="mt-1.5 flex items-center gap-2">
      <span className="h-1.5 min-w-0 flex-1 overflow-hidden rounded-full bg-white/10">
        <span
          data-testid="group-match-bar"
          data-score={score}
          className={`block h-full rounded-full transition-[width] duration-700 ${
            leading ? 'bg-gradient-to-r from-brand-300 to-fuchsia-300' : 'bg-white/35'
          }`}
          style={{ width: `${pct}%` }}
        />
      </span>
      <span className={`shrink-0 text-[11px] font-black tabular-nums ${leading ? 'text-brand-100' : 'text-slate-400'}`}>
        {score}
      </span>
    </div>
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

function Chip({
  on,
  onClick,
  children,
  context,
  disabled = false,
  disabledReason,
}: {
  on: boolean;
  onClick: () => void;
  children: React.ReactNode;
  context?: string;
  /** A chip selected in the OPPOSITE list — you can't want and avoid it. */
  disabled?: boolean;
  disabledReason?: string;
}) {
  return (
    <button
      type="button"
      // Several options appear in more than one list (Horror is both something
      // you might want and something you might avoid). Without the context the
      // two buttons are indistinguishable to a screen reader.
      aria-label={context ? `${context}: ${String(children)}` : undefined}
      aria-pressed={on}
      aria-disabled={disabled || undefined}
      disabled={disabled}
      title={disabled && disabledReason ? `Already ${disabledReason}` : undefined}
      onClick={onClick}
      /* 44px, NOT 36. Measured on a 390px phone: every mood and avoid chip
         rendered 36px tall, under the touch minimum this project holds
         everything else to — and these are the most-tapped controls in the
         room. The text size is unchanged; only the box grew. */
      className={`min-h-[44px] rounded-full border px-3.5 text-xs font-semibold transition ${
        disabled
          ? 'cursor-not-allowed border-white/5 bg-transparent text-slate-600 line-through'
          : on
            ? 'border-brand-400/60 bg-brand-500/20 text-brand-100'
            : 'border-white/12 bg-white/[0.04] text-slate-300 hover:bg-white/10'
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
        {/* THE SAME 44px THE SEND BUTTON BESIDE THEM ALREADY USES. These were
            27px tall — the one place a juror types on a phone, at half the
            room's own touch standard. The pill stays compact: the height comes
            from padding, not from a bigger typeface, so the strip reads the
            same and is merely hittable. `court-geometry.spec.ts` measures it. */}
        <div className="mb-2 flex items-center gap-1.5 overflow-x-auto">
          {QUICK_REPLIES.map((qr) => (
            <button
              key={qr}
              onClick={() => onSend(qr)}
              data-testid="chat-quick-reply"
              className="inline-flex min-h-[44px] flex-none items-center rounded-full border border-white/12 px-3 py-2 text-[11px] text-slate-300 hover:bg-white/10"
            >
              {qr}
            </button>
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

/**
 * The room's chrome, now delegated to `RoomShell`.
 *
 * KEPT AS AN ADAPTER RATHER THAN REPLACED AT TWELVE CALL SITES. Every branch in
 * this file already renders `<Shell sync={sync} …>`, and the smallest change
 * that carries the redesign through the whole room is to change what `Shell`
 * IS. That also keeps the diff on the engine at zero: nothing below this line
 * knows the room grew a floor.
 *
 * The sync chip stays here because it is this component's vocabulary — `live`
 * versus `reconnecting` is a fact about the polling loop, and `RoomShell` has
 * no business having an opinion about how it is worded.
 */
function Shell({
  children,
  onChat,
  unread = 0,
  sync,
  wide = false,
  stage = 'join',
  people = [],
  code,
}: {
  children: React.ReactNode;
  onChat?: () => void;
  unread?: number;
  sync?: SyncStatus;
  /** The lobby's three-column desktop mode: the shell widens to 1720px from
   *  `xl` so a 1920 screen carries three ≤640px columns with ≤120px gutters,
   *  and the floating chat button stands down where the feed is inline. */
  wide?: boolean;
  /** Which of the five stages the room is standing in. Lights the rail. */
  stage?: RoomStageKey;
  people?: readonly RoomPerson[];
  code?: string;
}) {
  return (
    <RoomShell
      stage={stage}
      people={people}
      code={code}
      onChat={onChat}
      unread={unread}
      wide={wide}
      status={
        sync ? (
          /* COMPACT, BECAUSE IT SHARES A LINE WITH THE ROOM'S IDENTITY.
             "Reconnecting — still updating" is the right sentence and it wrapped
             to two lines at 390px, pushing the chat button onto a third. The
             full wording survives as the accessible name and the tooltip; the
             chip itself carries a dot and one word, which is all a glance needs.
             `sr-only` keeps the whole sentence for a screen reader, where there
             is no width to run out of. */
          <span
            data-testid="sync-status"
            data-sync={sync}
            title={syncLabel(sync)}
            className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded-lg border px-2 py-1 text-[11px] font-semibold ${
              sync === 'live'
                ? 'border-emerald-400/40 bg-emerald-500/10 text-emerald-200'
                : 'border-amber-400/40 bg-amber-500/10 text-amber-100'
            }`}
          >
            <span aria-hidden className={`h-1.5 w-1.5 rounded-full ${sync === 'live' ? 'bg-emerald-400' : 'bg-amber-400'}`} />
            {(() => {
              const short = sync === 'live' ? 'Live' : sync === 'connecting' ? 'Connecting' : 'Reconnecting';
              const full = syncLabel(sync);
              /* The long form is only added when it SAYS SOMETHING MORE. For
                 `live` the two are identical, and rendering both gave the chip
                 the text "LiveLive" — read out twice by a screen reader, and
                 caught by the live-sync test asserting the chip's text. */
              return (
                <>
                  <span>{short}</span>
                  {full !== short && <span className="sr-only">{full}</span>}
                </>
              );
            })()}
          </span>
        ) : null
      }
    >
      {children}
    </RoomShell>
  );
}
