'use client';

import { useEffect, useRef, useState } from 'react';
import { RobedPortrait } from '@/components/RobedPortrait';
import { ReasonText } from '@/components/ReasonText';
import { PosterCard } from '@/components/PosterCard';
import { JudgeVerdictCard } from '@/components/JudgeVerdictCard';
import type { TitleVerdict } from '@/lib/askTypes';
import { type TileRatings } from '@/lib/ratings';
import { houseByKey, readHousePick } from '@/lib/houseJudges';
import { naiveParseQuery, describeQuery, EMPTY_QUERY } from '@/lib/finderParse';
import type { FinderQuery } from '@/lib/finder';

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
  const [judgeName, setJudgeName] = useState('Judge Annie');
  const [judgeSrc, setJudgeSrc] = useState('/judge-annie.png');
  const nextId = useRef(1);
  const scrollRef = useRef<HTMLDivElement>(null);
  const recognitionRef = useRef<{ start: () => void; stop: () => void } | null>(null);
  const seededRef = useRef(false);

  const voiceSupported =
    typeof window !== 'undefined' && ('webkitSpeechRecognition' in window || 'SpeechRecognition' in window);

  function say(text: string, items?: ResultItem[], role: 'you' | 'judge' = 'judge', verdict?: TitleVerdict) {
    setMsgs((m) => [...m, { id: nextId.current++, role, text, items, verdict }]);
  }

  useEffect(() => {
    const dog = houseByKey(readHousePick() === 'waffles' ? 'waffles' : 'annie');
    setJudgeName(dog.name);
    setJudgeSrc(dog.src);
    setMsgs([
      {
        id: nextId.current++,
        role: 'judge',
        text: `${dog.name} presiding. Tell me what you’re in the mood for — a vibe, a genre, a “like Mindhunter,” however you’d say it — and I’ll pull real titles, each scored for you. Need exact filters? That’s Forensic Search.`,
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

  async function submit(rawText?: string, queryOverride?: FinderQuery) {
    if (loading) return;
    const query = queryOverride ?? q;
    const text = (rawText ?? input).trim();
    setInput('');
    say(text || `Filed my case — ${describeQuery(query)}.`, undefined, 'you');
    setLoading(true);
    try {
      const res = await fetch('/api/ask', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query, text: text || undefined }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'failed');

      // A specifically-named title got put on trial — show the full ruling.
      if (data.kind === 'title' && data.verdict) {
        const v = data.verdict as TitleVerdict;
        const alts = (data.alternatives ?? []) as ResultItem[];
        const skip = v.primaryCall === 'SKIP IT';
        const ruling =
          `${v.title}${v.year ? ` (${v.year})` : ''} — my ruling: ${v.primaryCall} at ${v.matchScore} for you. ${v.oneLiner}` +
          (alts.length > 0 ? (skip ? ' Here’s why, and better picks below.' : ' Here’s the case — and a few more in the same lane.') : '');
        say(ruling, alts, 'judge', v);
        return;
      }

      const items: ResultItem[] = data.items ?? [];
      const read = describeQuery(query);
      let ruling: string;
      if (items.length > 0) {
        const top = items[0]!;
        ruling = `I read your case: ${read}. Ruling — ${items.length} title${items.length === 1 ? '' : 's'} worth your night. Top of the docket: ${top.title}${top.year ? ` (${top.year})` : ''} — ${top.primaryCall} at ${top.matchScore} match.`;
      } else {
        ruling = `I read your case: ${read}. No title clears all of that. Try rephrasing — broaden the genre or drop a requirement — and re-file. For exact filters, use Forensic Search.`;
      }
      if (data.relaxed) ruling += ` ${data.relaxed}`;
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
      {/* ============ The conversation ============ */}
      <div className="card flex h-[56vh] max-h-[620px] flex-col overflow-hidden p-0">
        <div className="flex items-center gap-3 border-b border-white/10 px-4 py-3">
          <RobedPortrait src={judgeSrc} size={44} />
          <div className="min-w-0 flex-1">
            <div className="eyebrow">⚖️ The bench</div>
            <div className="truncate text-base font-bold text-white">{judgeName}</div>
          </div>
        </div>

        <div ref={scrollRef} className="flex-1 space-y-3 overflow-y-auto px-4 py-4">
          {msgs.map((m) => (
            <div key={m.id} className={m.role === 'you' ? 'flex justify-end' : 'flex justify-start'}>
              <div className={`max-w-[85%] ${m.role === 'you' ? 'rounded-2xl rounded-br-sm bg-brand-500/25 px-3.5 py-2 text-sm text-brand-50' : 'w-full'}`}>
                {m.role === 'judge' ? (
                  <div className="rounded-2xl rounded-bl-sm border border-white/10 bg-white/[0.04] px-3.5 py-2.5 text-sm text-slate-100">
                    {m.text}
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
                                  <span className="rounded-md border border-white/10 bg-white/5 px-2 py-0.5 text-[11px] text-slate-300">📺 {it.where}</span>
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
