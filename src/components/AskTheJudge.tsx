'use client';

import { useEffect, useRef, useState } from 'react';
import { ReasonText } from '@/components/ReasonText';
import { PosterCard } from '@/components/PosterCard';
import { JudgeVerdictCard } from '@/components/JudgeVerdictCard';
import { AnchorClarify, type AnchorOptionView } from '@/components/critic/AnchorClarify';
import { classifyAskResponse } from '@/lib/critic/askResponseKind';
import type { TitleVerdict } from '@/lib/askTypes';
import { type TileRatings } from '@/lib/ratings';
import { naiveParseQuery, describeQuery, EMPTY_QUERY } from '@/lib/finderParse';
import type { FinderQuery } from '@/lib/finder';
import { fetchWithTimeout } from '@/lib/fetchWithTimeout';
import {
  EMPTY_REQUEST,
  removeChip,
  type CanonicalRequest,
  type Chip,
} from '@/lib/nlu/conversationState';
import { ProviderNameList } from '@/components/media/ProviderChip';

/** sessionStorage key for conversation persistence across rerenders/refreshes. */
const CONV_STORE_KEY = 'wv-judge-conversation-v1';

interface ResultItem {
  id: number;
  mediaType: 'movie' | 'tv';
  title: string;
  year: number | null;
  posterUrl: string | null;
  posterPath: string | null;
  matchScore: number;
  primaryCall: string;
  reason: string;
  where: string | null;
  deciderUrl: string;
  ratings?: TileRatings;
}

interface Msg {
  id: number;
  role: 'you' | 'judge';
  text: string;
  items?: ResultItem[];
  verdict?: TitleVerdict; // a named title put on trial
  /** A comparative anchor we could not place — the user picks which title. */
  clarify?: { question: string; options: AnchorOptionView[]; pending: unknown };
}

const EXAMPLES = [
  'A crime thriller under 2 hours, out in the last couple years',
  'Something funny and short I can watch tonight on my services',
  'A bingeable show, all episodes out, 80%+ audience',
];

export function AskTheJudge({ seedQuery = null }: { seedQuery?: string | null }) {
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [input, setInput] = useState('');
  const [q, setQ] = useState<FinderQuery>({ ...EMPTY_QUERY });
  const [loading, setLoading] = useState(false);
  const [listening, setListening] = useState(false);
  const [assistantName] = useState('WatchVerd1ct');
  // The canonical conversation state — the case as currently filed. Every turn
  // sends it, the server merges the new sentence into it, and the chips below
  // the thread ARE this object, each one removable.
  const [conv, setConv] = useState<CanonicalRequest>({ ...EMPTY_REQUEST });
  const [chips, setChips] = useState<Chip[]>([]);
  // The exact query this screen is answering, and the server's request id — so a
  // specific search always says what it searched for and can never be mistaken
  // for the generic recommendations feed.
  const [answeringFor, setAnsweringFor] = useState<string | null>(seedQuery?.trim() || null);
  const [requestId, setRequestId] = useState<string | null>(null);
  const userKeyRef = useRef<string | null>(null);
  // Monotonic turn counter — a late response from an earlier turn must never
  // overwrite the state a newer turn already produced.
  const turnSeq = useRef(0);
  const nextId = useRef(1);
  const scrollRef = useRef<HTMLDivElement>(null);
  const recognitionRef = useRef<{ start: () => void; stop: () => void } | null>(null);
  const seededRef = useRef(false);

  // Restore a conversation across rerenders/refreshes — but only for the same
  // account: the stored blob carries the server-issued userKey, and the first
  // response from a DIFFERENT user wipes it (no cross-account carryover).
  useEffect(() => {
    try {
      const raw = sessionStorage.getItem(CONV_STORE_KEY);
      if (!raw) return;
      const saved = JSON.parse(raw) as { userKey?: string; state?: CanonicalRequest; chips?: Chip[] };
      if (saved.state) {
        setConv(saved.state);
        setChips(saved.chips ?? []);
        userKeyRef.current = saved.userKey ?? null;
      }
    } catch {
      /* a corrupt blob is just ignored */
    }
  }, []);

  function persistConv(state: CanonicalRequest, chipList: Chip[], userKey: string | null) {
    try {
      sessionStorage.setItem(CONV_STORE_KEY, JSON.stringify({ userKey, state, chips: chipList }));
    } catch {
      /* storage full/blocked — persistence is best-effort */
    }
  }

  function resetConversation() {
    setConv({ ...EMPTY_REQUEST });
    setChips([]);
    try {
      sessionStorage.removeItem(CONV_STORE_KEY);
    } catch {
      /* ignore */
    }
    say('Fresh docket. Tell me what you’re in the mood for.');
  }

  const voiceSupported =
    typeof window !== 'undefined' && ('webkitSpeechRecognition' in window || 'SpeechRecognition' in window);

  function say(text: string, items?: ResultItem[], role: 'you' | 'judge' = 'judge', verdict?: TitleVerdict) {
    setMsgs((m) => [...m, { id: nextId.current++, role, text, items, verdict }]);
  }

  /** Ask which title was meant, carrying the rest of the request untouched. */
  function askWhich(question: string, options: AnchorOptionView[], pending: unknown) {
    setMsgs((m) => [...m, { id: nextId.current++, role: 'judge', text: '', clarify: { question, options, pending } }]);
  }

  useEffect(() => {
    setMsgs([
      {
        id: nextId.current++,
        role: 'judge',
        text: `Tell me what you’re in the mood for — a vibe, a genre, a “like Mindhunter,” however you’d say it — and I’ll pull real titles, each scored for you. Need exact filters? That’s Forensic Search.`,
      },
    ]);
  }, []);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
  }, [msgs, loading]);

  function onText(v: string) {
    setInput(v);
    if (v.trim().length > 1) setQ(naiveParseQuery(v));
  }

  /** Years + ids of the most recent results — what "newer"/"I saw those" refer to. */
  function lastShown(): { shownYears: number[]; shownIds: { mediaType: 'movie' | 'tv'; id: number }[] } {
    for (let i = msgs.length - 1; i >= 0; i--) {
      const items = msgs[i]?.items;
      if (items && items.length > 0) {
        return {
          shownYears: items.map((x) => x.year).filter((y): y is number => y != null),
          shownIds: items.map((x) => ({ mediaType: x.mediaType, id: x.id })),
        };
      }
    }
    return { shownYears: [], shownIds: [] };
  }

  async function submit(
    rawText?: string,
    queryOverride?: FinderQuery,
    convOverride?: CanonicalRequest,
    /** A clarification the user just answered — resumes the original request. */
    clarifyAnswer?: { pendingComparison: unknown; comparisonChoice: unknown },
  ) {
    if (loading) return;
    const query = queryOverride ?? q;
    const text = (rawText ?? input).trim();
    setInput('');
    /* A clarification answer already showed the chosen title as the user's
       turn; re-echoing the original sentence would read as asking twice. */
    if (!clarifyAnswer && (text || !convOverride)) {
      say(text || `Filed my case — ${describeQuery(query)}.`, undefined, 'you');
    }
    setLoading(true);
    const mySeq = ++turnSeq.current;
    try {
      const res = await fetchWithTimeout('/api/ask', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          query,
          text: text || undefined,
          conversation: convOverride ?? conv,
          // Send back the server-issued key so the SERVER can reject a
          // conversation that belongs to a different account.
          userKey: userKeyRef.current ?? undefined,
          turnContext: lastShown(),
          ...(clarifyAnswer ?? {}),
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'failed');

      // STALE-RESPONSE GUARD: a newer turn already superseded this one, so its
      // late response must not clobber the current state or append results.
      if (mySeq !== turnSeq.current) return;

      // Record what THIS search answered and its request id, for the header.
      if (text) setAnsweringFor(text);
      if (typeof data.requestId === 'string') setRequestId(data.requestId);

      // Adopt the server's merged state. If the account changed since the
      // stored conversation was created, drop the stale one instead of mixing.
      if (data.conversation) {
        if (userKeyRef.current && data.userKey && userKeyRef.current !== data.userKey) {
          setConv({ ...EMPTY_REQUEST });
          setChips([]);
          try { sessionStorage.removeItem(CONV_STORE_KEY); } catch { /* ignore */ }
        } else {
          setConv(data.conversation);
          setChips(data.chips ?? []);
          persistConv(data.conversation, data.chips ?? [], data.userKey ?? null);
        }
        userKeyRef.current = data.userKey ?? userKeyRef.current;
      }

      // A specifically-named title got put on trial — show the full ruling.
      if (classifyAskResponse(data) === 'title') {
        const v = data.verdict as TitleVerdict;
        const alts = (data.alternatives ?? []) as ResultItem[];
        const skip = v.primaryCall === 'SKIP IT';
        const ruling =
          `${v.title}${v.year ? ` (${v.year})` : ''} — my ruling: ${v.primaryCall} at ${v.matchScore} for you. ${v.oneLiner}` +
          (alts.length > 0 ? (skip ? ' Here’s why, and better picks below.' : ' Here’s the case — and a few more in the same lane.') : '');
        say(ruling, alts, 'judge', v);
        return;
      }

      /* AN ANCHOR NEEDS SETTLING. The comparison is intact — the server sent
         back everything needed to resume it — so this asks one question rather
         than answering a different, smaller request.

         BRANCHED ON `kind`, NOT ON THE OPTION COUNT. A NOT_FOUND anchor carries
         an EMPTY option list on purpose, and gating entry on its length sent it
         into the generic results branch below, where it rendered "No title
         clears all of that" and the clarification question together. */
      const branch = classifyAskResponse(data);
      if (branch === 'clarify-options' || branch === 'clarify-question') {
        askWhich(
          typeof data.clarify === 'string' ? data.clarify : 'Which title did you mean?',
          branch === 'clarify-options' ? (data.comparisonOptions as AnchorOptionView[]) : [],
          data.pendingComparison,
        );
        return;
      }

      const items: ResultItem[] = data.items ?? [];
      // Prefer the server's read-back of what THIS TURN changed — it is the
      // actual interpretation, not a client-side guess.
      const interp: string[] = Array.isArray(data.interpretation) ? data.interpretation : [];
      const read = interp.length > 0 ? interp.join('; ') : describeQuery(query);
      let ruling: string;
      if (items.length > 0) {
        const top = items[0]!;
        ruling = `I read your case: ${read}. Ruling — ${items.length} title${items.length === 1 ? '' : 's'} worth your night. Top of the docket: ${top.title}${top.year ? ` (${top.year})` : ''} — ${top.primaryCall} at ${top.matchScore} match.`;
      } else {
        ruling = `I read your case: ${read}. No title clears all of that. Remove a chip below or re-file with fewer requirements.`;
      }
      if (data.relaxed) ruling += ` ${data.relaxed}`;
      if (data.clarify) ruling += ` ${data.clarify}`;
      say(ruling, items);
    } catch {
      say('The court hit a snag pulling candidates. Try re-filing that in a moment.');
    } finally {
      setLoading(false);
    }
  }

  function runExample(ex: string) {
    const parsed = naiveParseQuery(ex);
    setInput(ex);
    setQ(parsed);
    void submit(ex, parsed);
  }

  function startVoice() {
    if (typeof window === 'undefined') return;
    const w = window as unknown as { webkitSpeechRecognition?: new () => never; SpeechRecognition?: new () => never };
    const Ctor = w.SpeechRecognition ?? w.webkitSpeechRecognition;
    if (!Ctor) return;
    const rec = new (Ctor as unknown as new () => Record<string, unknown>)() as Record<string, unknown> & {
      lang: string; interimResults: boolean; maxAlternatives: number;
      onresult: (e: { results: Array<Array<{ transcript: string }>> }) => void;
      onend: () => void; onerror: () => void; start: () => void; stop: () => void;
    };
    rec.lang = 'en-US';
    rec.interimResults = false;
    rec.maxAlternatives = 1;
    rec.onresult = (e) => {
      const said = e.results?.[0]?.[0]?.transcript ?? '';
      if (said) {
        const parsed = naiveParseQuery(said);
        setInput(said);
        setQ(parsed);
        void submit(said, parsed); // speaking actually files the case
      }
    };
    rec.onend = () => setListening(false);
    rec.onerror = () => setListening(false);
    recognitionRef.current = rec;
    setListening(true);
    rec.start();
  }

  function stopVoice() {
    recognitionRef.current?.stop();
    setListening(false);
  }

  useEffect(() => {
    if (seedQuery && !seededRef.current) {
      seededRef.current = true;
      const parsed = naiveParseQuery(seedQuery);
      setQ(parsed);
      void submit(seedQuery, parsed);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [seedQuery]);

  const showExamples = msgs.length <= 1 && !loading;

  return (
    <div className="space-y-4">
      {/* RESULTS-FOR HEADER. A specific search always says what it searched for,
          so it can never be confused with the generic recommendations feed.
          Present only when a real query is being answered. */}
      {answeringFor && (
        <div
          data-testid="search-results-header"
          data-answering-for={answeringFor}
          className="flex flex-wrap items-baseline gap-x-2 gap-y-1 rounded-xl border border-brand-400/30 bg-brand-500/10 px-3 py-2"
        >
          <span className="text-sm font-bold text-white">
            Results for <span className="text-brand-200">“{answeringFor}”</span>
          </span>
          {requestId && (
            <span className="text-[11px] text-slate-400" data-testid="search-request-id">
              request {requestId}
            </span>
          )}
        </div>
      )}
      {/* ============ The conversation ============ */}
      <div className="card flex h-[56vh] max-h-[620px] flex-col overflow-hidden p-0">
        <div className="flex items-center gap-3 border-b border-white/10 px-4 py-3">
          <span aria-hidden className="grid h-11 w-11 flex-none place-items-center rounded-xl border border-brand-400/40 bg-brand-500/15 text-sm font-black text-brand-100">V1</span>
          <div className="min-w-0 flex-1">
            <div className="eyebrow">⚖️ The bench</div>
            <div className="truncate text-base font-bold text-white">{assistantName}</div>
          </div>
        </div>

        <div ref={scrollRef} className="flex-1 space-y-3 overflow-y-auto px-4 py-4">
          {msgs.map((m) => (
            <div key={m.id} className={m.role === 'you' ? 'flex justify-end' : 'flex justify-start'}>
              <div className={`max-w-[85%] ${m.role === 'you' ? 'rounded-2xl rounded-br-sm bg-brand-500/25 px-3.5 py-2 text-sm text-brand-50' : 'w-full'}`}>
                {m.role === 'judge' ? (
                  <div className="rounded-2xl rounded-bl-sm border border-white/10 bg-white/[0.04] px-3.5 py-2.5 text-sm text-slate-100">
                    {m.text}
                    {m.clarify && (
                      <AnchorClarify
                        question={m.clarify.question}
                        options={m.clarify.options}
                        disabled={loading}
                        onChoose={(o) => {
                          /* Resume the ORIGINAL request. The pending envelope
                             carries the relation, the anchor that already
                             resolved and every stated constraint, so nothing is
                             retyped and nothing is searched twice. */
                          const env = m.clarify!.pending as { text?: string; pending?: { spokenAs?: string }[] } | null;
                          say(`${o.title}${o.year ? ` (${o.year})` : ''}`, undefined, 'you');
                          void submit(env?.text ?? undefined, undefined, undefined, {
                            pendingComparison: m.clarify!.pending,
                            comparisonChoice: {
                              // The NAME we asked about, not the option's title —
                              // they differ whenever the catalogue spells it
                              // differently from the user.
                              spokenAs: env?.pending?.[0]?.spokenAs ?? o.title,
                              tmdbId: o.tmdbId,
                              mediaType: o.mediaType,
                            },
                          });
                        }}
                      />
                    )}
                    {m.verdict && (
                      <div className="mt-3">
                        <JudgeVerdictCard v={m.verdict} />
                      </div>
                    )}
                    {m.items && m.items.length > 0 && (
                      <div className="mt-3">
                        {m.verdict && (
                          <div className="eyebrow mb-2 text-[11px]">Better for you</div>
                        )}
                        <div className="poster-grid">
                          {m.items.map((it) => (
                            <PosterCard
                              key={`${it.mediaType}-${it.id}`}
                              href={`/app/title/${it.mediaType}/${it.id}`}
                              mediaType={it.mediaType}
                              tmdbId={it.id}
                              title={it.title}
                              year={it.year}
                              posterUrl={it.posterUrl}
                              posterPath={it.posterPath}
                            >
                              {it.reason && <ReasonText text={it.reason} className="mt-1.5 text-[11px] text-slate-300" />}
                              {it.where && (
                                <div className="mt-1.5">
                                  <span className="rounded-md border border-white/10 bg-white/5 px-2 py-0.5 text-[11px] text-slate-300"><ProviderNameList names={[it.where]} /></span>
                                </div>
                              )}
                            </PosterCard>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                ) : (
                  m.text
                )}
              </div>
            </div>
          ))}

          {loading && (
            <div className="flex justify-start">
              <div className="rounded-2xl rounded-bl-sm border border-white/10 bg-white/[0.04] px-3.5 py-2.5 text-sm text-slate-400">
                ⚖️ The court is deliberating<span className="animate-pulse">…</span>
              </div>
            </div>
          )}

          {showExamples && (
            <div className="flex flex-wrap gap-1.5 pt-1">
              {EXAMPLES.map((ex) => (
                <button key={ex} onClick={() => runExample(ex)} className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs text-slate-300 hover:bg-white/10">
                  {ex}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* ============ The case as currently filed — removable chips ============ */}
        {chips.length > 0 && (
          <div className="flex flex-wrap items-center gap-1.5 border-t border-white/10 px-3 pt-2" data-testid="conversation-chips">
            <span className="eyebrow mr-1 text-[10px]">Your case:</span>
            {chips.map((c) => (
              <button
                key={c.id}
                type="button"
                data-testid={`chip-${c.id}`}
                onClick={() => {
                  const next = removeChip(conv, c.id);
                  setConv(next);
                  say(`Struck "${c.label}" from the case.`, undefined, 'you');
                  void submit('', undefined, next);
                }}
                className="group flex min-h-[32px] items-center gap-1 rounded-full border border-brand-400/30 bg-brand-500/15 px-2.5 py-1 text-xs text-brand-100 hover:border-red-400/40 hover:bg-red-500/15"
                aria-label={`Remove constraint: ${c.label}`}
                title={`Remove "${c.label}"`}
              >
                {c.label}
                <span aria-hidden className="text-brand-300 group-hover:text-red-300">×</span>
              </button>
            ))}
            <button
              type="button"
              onClick={resetConversation}
              className="ml-auto min-h-[32px] rounded-full border border-white/10 bg-white/5 px-2.5 py-1 text-xs text-slate-400 hover:bg-white/10"
              aria-label="Start the conversation over"
            >
              Start over
            </button>
          </div>
        )}

        <div className="border-t border-white/10 p-3">
          <div className="flex items-end gap-2">
            <textarea
              value={input}
              onChange={(e) => onText(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); void submit(); } }}
              rows={1}
              placeholder={listening ? 'Listening…' : 'Tell the judge what you want — or just hit File it'}
              className="input max-h-28 min-h-[44px] flex-1 resize-none"
            />
            {voiceSupported && (
              <button
                type="button"
                onClick={listening ? stopVoice : startVoice}
                className={`grid h-11 w-11 flex-none place-items-center rounded-xl border transition ${listening ? 'border-red-400/50 bg-red-500/20 text-red-200' : 'border-white/12 bg-white/5 text-slate-300 hover:bg-white/10'}`}
                aria-label={listening ? 'Stop listening' : 'Speak to the judge'}
                title={listening ? 'Listening… tap to stop' : 'Speak to the judge'}
              >
                <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" aria-hidden>
                  <rect x="9" y="3" width="6" height="11" rx="3" stroke="currentColor" strokeWidth="1.6" />
                  <path d="M5 11a7 7 0 0 0 14 0M12 18v3" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
                </svg>
              </button>
            )}
            <button type="button" onClick={() => submit()} disabled={loading} className="btn-primary h-11 flex-none px-4 disabled:opacity-40">
              File it
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
