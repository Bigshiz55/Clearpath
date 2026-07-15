'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { RobedPortrait } from '@/components/RobedPortrait';
import { ReasonText } from '@/components/ReasonText';
import { SaveButton } from '@/components/SaveButton';
import { houseByKey, readHousePick } from '@/lib/houseJudges';
import { naiveParseQuery, describeQuery } from '@/lib/finderParse';
import { verdictVisualForCall } from '@/lib/verdictVisual';

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
}

interface Msg {
  id: number;
  role: 'you' | 'judge';
  text: string;
  items?: ResultItem[];
}

const EXAMPLES = [
  'A crime thriller under 2 hours, out in the last couple years',
  'Something funny and short I can watch tonight on my services',
  'A bingeable show, all episodes out, 80%+ audience',
];

// Strip emoji/symbols so the spoken line sounds natural.
function speakable(t: string): string {
  return t.replace(/[^\p{L}\p{N}\s.,'’!?%-]/gu, '').replace(/\s+/g, ' ').trim();
}

export function AskTheJudge({ hasServices, seedQuery = null }: { hasServices: boolean; seedQuery?: string | null }) {
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [listening, setListening] = useState(false);
  const [speak, setSpeak] = useState(true);
  const [judgeName, setJudgeName] = useState('Judge Annie');
  const [judgeSrc, setJudgeSrc] = useState('/judge-annie.png');
  const nextId = useRef(1);
  const scrollRef = useRef<HTMLDivElement>(null);
  const recognitionRef = useRef<{ start: () => void; stop: () => void } | null>(null);
  const seededRef = useRef(false);

  const voiceSupported =
    typeof window !== 'undefined' && ('webkitSpeechRecognition' in window || 'SpeechRecognition' in window);

  function say(text: string, items?: ResultItem[], role: 'you' | 'judge' = 'judge') {
    setMsgs((m) => [...m, { id: nextId.current++, role, text, items }]);
  }

  function speakLine(text: string) {
    if (!speak || typeof window === 'undefined' || !('speechSynthesis' in window)) return;
    try {
      const u = new SpeechSynthesisUtterance(speakable(text));
      u.rate = 1.02;
      u.pitch = 1;
      window.speechSynthesis.cancel();
      window.speechSynthesis.speak(u);
    } catch {
      /* speech optional */
    }
  }

  // Pick up the chosen house judge for the portrait + greeting.
  useEffect(() => {
    const dog = houseByKey(readHousePick() === 'waffles' ? 'waffles' : 'annie');
    setJudgeName(dog.name);
    setJudgeSrc(dog.src);
    setMsgs([
      {
        id: nextId.current++,
        role: 'judge',
        text: `${dog.name} presiding. Tell me what you're in the mood for — length, genre, how recent, on your services — and I'll rule on it. Talk or type.`,
      },
    ]);
  }, []);

  // Auto-scroll to the newest message.
  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
  }, [msgs, loading]);

  async function submit(raw: string) {
    const text = raw.trim();
    if (!text || loading) return;
    setInput('');
    say(text, undefined, 'you');
    setLoading(true);

    const parsed = naiveParseQuery(text);
    try {
      const res = await fetch('/api/finder', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: parsed }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'failed');
      const items: ResultItem[] = data.items ?? [];
      const read = describeQuery(parsed);
      let ruling: string;
      if (items.length > 0) {
        const top = items[0]!;
        ruling = `I read your case: ${read}. Ruling — ${items.length} title${items.length === 1 ? '' : 's'} worth your night. Top of the docket: ${top.title}${top.year ? ` (${top.year})` : ''} — ${top.primaryCall} at ${top.matchScore} match.`;
      } else {
        ruling = `I read your case: ${read}. No title clears all of that. Drop one rule — a genre, or the match bar — and re-file your case.`;
      }
      if (data.relaxed) ruling += ` ${data.relaxed}`;
      say(ruling, items);
      speakLine(items.length > 0 ? `${items.length} worth your night. Top pick, ${items[0]!.title}.` : `Nothing clears all of that. Loosen a rule and re-file.`);
    } catch {
      say('The court hit a snag pulling candidates. Try re-filing that in a moment.');
    } finally {
      setLoading(false);
    }
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
        setInput(said);
        void submit(said); // the fix: speaking actually files the case
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

  // Run a query passed in from elsewhere (e.g. the home search bar) once.
  useEffect(() => {
    if (seedQuery && !seededRef.current) {
      seededRef.current = true;
      void submit(seedQuery);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [seedQuery]);

  const showExamples = msgs.length <= 1 && !loading;

  return (
    <div className="card flex h-[70vh] max-h-[720px] flex-col overflow-hidden p-0">
      {/* Judge header */}
      <div className="flex items-center gap-3 border-b border-white/10 px-4 py-3">
        <RobedPortrait src={judgeSrc} size={44} />
        <div className="min-w-0 flex-1">
          <div className="text-[10px] font-bold uppercase tracking-[0.18em] text-gold-400" style={{ fontFamily: 'Georgia, serif' }}>⚖️ The bench</div>
          <div className="truncate text-sm font-bold text-white">{judgeName}</div>
        </div>
        <button
          onClick={() => { setSpeak((s) => !s); if (typeof window !== 'undefined' && 'speechSynthesis' in window) window.speechSynthesis.cancel(); }}
          className="rounded-lg border border-white/12 bg-white/5 px-2.5 py-1 text-xs text-slate-300 transition hover:bg-white/10"
          title={speak ? 'Judge reads rulings aloud' : 'Judge is muted'}
        >
          {speak ? '🔊 Voice on' : '🔇 Muted'}
        </button>
      </div>

      {/* Conversation */}
      <div ref={scrollRef} className="flex-1 space-y-3 overflow-y-auto px-4 py-4">
        {msgs.map((m) => (
          <div key={m.id} className={m.role === 'you' ? 'flex justify-end' : 'flex justify-start'}>
            <div className={`max-w-[85%] ${m.role === 'you' ? 'rounded-2xl rounded-br-sm bg-brand-500/25 px-3.5 py-2 text-sm text-brand-50' : 'w-full'}`}>
              {m.role === 'judge' ? (
                <div className="rounded-2xl rounded-bl-sm border border-white/10 bg-white/[0.04] px-3.5 py-2.5 text-sm text-slate-100">
                  {m.text}
                  {m.items && m.items.length > 0 && (
                    <div className="mt-3 space-y-2">
                      {m.items.map((it) => {
                        const v = verdictVisualForCall(it.primaryCall);
                        return (
                          <div key={`${it.mediaType}-${it.id}`} className={`flex gap-3 rounded-xl border bg-black/20 p-2 ${v.border}`}>
                            <Link href={`/app/title/${it.mediaType}/${it.id}`} className="h-24 w-16 flex-none overflow-hidden rounded-lg border border-white/10">
                              {it.posterUrl ? (
                                // eslint-disable-next-line @next/next/no-img-element
                                <img src={it.posterUrl} alt="" className="h-full w-full object-cover" />
                              ) : (
                                <div className="grid h-full w-full place-items-center bg-white/5 p-1 text-center text-[9px] text-slate-400">{it.title}</div>
                              )}
                            </Link>
                            <div className="min-w-0 flex-1">
                              <div className="flex items-start justify-between gap-2">
                                <Link href={`/app/title/${it.mediaType}/${it.id}`} className="line-clamp-1 text-sm font-semibold text-white hover:underline">
                                  {it.title} {it.year ? <span className="font-normal text-slate-400">({it.year})</span> : null}
                                </Link>
                                <SaveButton tmdbId={it.id} mediaType={it.mediaType} title={it.title} year={it.year} posterPath={it.posterPath} variant="inline" />
                              </div>
                              <div className="mt-1 flex items-center gap-2">
                                <span className={`rounded-md border px-2 py-0.5 text-[10px] font-black ${v.badge}`}>{it.primaryCall}</span>
                                <span className="text-sm font-bold tabular-nums text-gold-400">{it.matchScore}</span>
                                <span className="text-[11px] text-slate-500">match</span>
                              </div>
                              {it.reason && <ReasonText text={it.reason} className="mt-1 text-[11px] text-slate-300" />}
                              <div className="mt-1.5 flex flex-wrap gap-1">
                                {it.where && <span className="rounded-md border border-white/10 bg-white/5 px-2 py-0.5 text-[10px] text-slate-300">📺 {it.where}</span>}
                                <a href={it.deciderUrl} target="_blank" rel="noopener noreferrer" className="rounded-md border border-white/10 bg-white/5 px-2 py-0.5 text-[10px] text-brand-300 hover:bg-white/10">
                                  Stream It or Skip It? ↗
                                </a>
                              </div>
                            </div>
                          </div>
                        );
                      })}
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
              <button key={ex} onClick={() => submit(ex)} className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs text-slate-300 hover:bg-white/10">
                {ex}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Composer */}
      <div className="border-t border-white/10 p-3">
        {!hasServices && (
          <p className="mb-2 px-1 text-[11px] text-slate-500">Tip: add your streaming services in Settings and say “on my services” to filter to what you can watch tonight.</p>
        )}
        <div className="flex items-end gap-2">
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                void submit(input);
              }
            }}
            rows={1}
            placeholder={listening ? 'Listening…' : 'Tell the judge what you want to watch…'}
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
          <button
            type="button"
            onClick={() => submit(input)}
            disabled={loading || !input.trim()}
            className="btn-primary h-11 flex-none px-4 disabled:opacity-40"
          >
            File it
          </button>
        </div>
      </div>
    </div>
  );
}
