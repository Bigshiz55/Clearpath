'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { RobedPortrait } from '@/components/RobedPortrait';
import { ReasonText } from '@/components/ReasonText';
import { SaveButton } from '@/components/SaveButton';
import { RatingsStrip } from '@/components/RatingsStrip';
import { JudgeVerdictCard } from '@/components/JudgeVerdictCard';
import type { TitleVerdict } from '@/lib/askTypes';
import { EMPTY_TILE_RATINGS, type TileRatings } from '@/lib/ratings';
import { houseByKey, readHousePick } from '@/lib/houseJudges';
import { naiveParseQuery, describeQuery, EMPTY_QUERY } from '@/lib/finderParse';
import { GENRE_CHIPS } from '@/lib/finderGenres';
import { verdictVisualForCall } from '@/lib/verdictVisual';
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

function speakable(t: string): string {
  return t.replace(/[^\p{L}\p{N}\s.,'’!?%-]/gu, '').replace(/\s+/g, ' ').trim();
}
function runtimeReadout(v: number): string {
  if (v >= 240) return 'Any length';
  const h = Math.floor(v / 60);
  const m = v % 60;
  return h > 0 ? `≤ ${h}h ${m ? `${m}m` : ''}`.trim() : `≤ ${m}m`;
}
function releasedReadout(years: number): string {
  if (years <= 0) return 'Any year';
  const from = new Date().getFullYear() - years;
  return `${from} → now`;
}

export function AskTheJudge({ hasServices, seedQuery = null }: { hasServices: boolean; seedQuery?: string | null }) {
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [input, setInput] = useState('');
  const [q, setQ] = useState<FinderQuery>({ ...EMPTY_QUERY });
  const [showFilters, setShowFilters] = useState(true);
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

  function say(text: string, items?: ResultItem[], role: 'you' | 'judge' = 'judge', verdict?: TitleVerdict) {
    setMsgs((m) => [...m, { id: nextId.current++, role, text, items, verdict }]);
  }

  function speakLine(text: string) {
    if (!speak || typeof window === 'undefined' || !('speechSynthesis' in window)) return;
    try {
      const u = new SpeechSynthesisUtterance(speakable(text));
      u.rate = 1.02;
      window.speechSynthesis.cancel();
      window.speechSynthesis.speak(u);
    } catch {
      /* speech optional */
    }
  }

  useEffect(() => {
    const dog = houseByKey(readHousePick() === 'waffles' ? 'waffles' : 'annie');
    setJudgeName(dog.name);
    setJudgeSrc(dog.src);
    setMsgs([
      {
        id: nextId.current++,
        role: 'judge',
        text: `${dog.name} presiding. The constraints below are already set — tweak them, or just tell me in your own words and they'll follow along. Then file your case.`,
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
  function set<K extends keyof FinderQuery>(key: K, val: FinderQuery[K]) {
    setQ((prev) => ({ ...prev, [key]: val }));
  }
  function toggleGenre(id: number) {
    setQ((prev) => ({
      ...prev,
      genreIds: prev.genreIds.includes(id) ? prev.genreIds.filter((g) => g !== id) : [...prev.genreIds, id],
    }));
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
        speakLine(`${v.primaryCall} at ${v.matchScore}. ${v.title}.`);
        return;
      }

      const items: ResultItem[] = data.items ?? [];
      const read = describeQuery(query);
      let ruling: string;
      if (items.length > 0) {
        const top = items[0]!;
        ruling = `I read your case: ${read}. Ruling — ${items.length} title${items.length === 1 ? '' : 's'} worth your night. Top of the docket: ${top.title}${top.year ? ` (${top.year})` : ''} — ${top.primaryCall} at ${top.matchScore} match.`;
      } else {
        ruling = `I read your case: ${read}. No title clears all of that. Loosen a constraint below — the match bar, or a genre — and re-file.`;
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
  const sinceYears = q.sinceMonths ? Math.max(1, Math.round(q.sinceMonths / 12)) : 0;

  return (
    <div className="space-y-4">
      {/* ============ Constraints — on by default; the first thing you decide ============ */}
      <div className="card p-4">
        <button onClick={() => setShowFilters((s) => !s)} className="flex w-full items-center justify-between">
          <span className="eyebrow-lg">⚖️ Your constraints</span>
          <span className="text-sm font-semibold text-brand-200">{showFilters ? 'Hide ▲' : 'Show ▼'}</span>
        </button>
        <p className="mt-1.5 text-sm text-slate-300">Set the ground rules — or just tell the judge and these follow along. On by default; ignore them if you like.</p>

        {showFilters && (
          <div className="mt-3 space-y-3">
            <div className="flex flex-wrap gap-1.5">
              {([['any', 'Any'], ['movie', 'Movies'], ['tv', 'Shows']] as const).map(([v, label]) => (
                <button key={v} onClick={() => set('mediaType', v)} className={`rounded-lg border px-3 py-1.5 text-sm transition ${q.mediaType === v ? 'border-brand-400/60 bg-brand-500/20 text-brand-100' : 'border-white/12 bg-white/5 text-slate-300 hover:bg-white/10'}`}>
                  {label}
                </button>
              ))}
            </div>

            <div className="flex flex-wrap gap-1.5">
              {GENRE_CHIPS.map((g) => (
                <button key={g.id} onClick={() => toggleGenre(g.id)} className={`rounded-lg border px-2.5 py-1 text-xs transition ${q.genreIds.includes(g.id) ? 'border-brand-400/60 bg-brand-500/20 text-brand-100' : 'border-white/12 bg-white/5 text-slate-300 hover:bg-white/10'}`}>
                  {g.label}
                </button>
              ))}
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <div className="mb-1 flex justify-between text-xs"><span className="text-slate-300">Max length</span><span className="font-semibold text-brand-200">{runtimeReadout(q.maxRuntime ?? 240)}</span></div>
                <input type="range" min={60} max={240} step={10} value={q.maxRuntime ?? 240} onChange={(e) => set('maxRuntime', Number(e.target.value) >= 240 ? null : Number(e.target.value))} className="w-full accent-brand-500" />
              </div>
              <div>
                <div className="mb-1 flex justify-between text-xs"><span className="text-slate-300">Released since</span><span className="font-semibold text-brand-200">{releasedReadout(sinceYears)}</span></div>
                <input type="range" min={0} max={75} step={1} value={sinceYears} onChange={(e) => { const y = Number(e.target.value); set('sinceMonths', y === 0 ? null : y * 12); }} className="w-full accent-brand-500" />
                <p className="mt-1 text-[11px] leading-snug text-slate-400">Drag left to reach classics — decades back, not just recent.</p>
              </div>
              <div>
                <div className="mb-1 flex justify-between text-xs"><span className="text-slate-300">🍿 Popcorn meter</span><span className="font-semibold text-brand-200">{q.minAudience ? `${q.minAudience}%+` : 'Any'}</span></div>
                <input type="range" min={0} max={95} step={5} value={q.minAudience ?? 0} onChange={(e) => set('minAudience', Number(e.target.value) === 0 ? null : Number(e.target.value))} className="w-full accent-brand-500" />
                <p className="mt-1 text-[11px] leading-snug text-slate-400">The audience / Popcorn score (crowd rating).</p>
              </div>
              <div>
                <div className="mb-1 flex justify-between text-xs"><span className="text-slate-300">IMDb rating</span><span className="font-semibold text-gold-400">{q.minImdb ? `${q.minImdb.toFixed(1)}+` : 'Any'}</span></div>
                <input type="range" min={0} max={9} step={0.5} value={q.minImdb ?? 0} onChange={(e) => set('minImdb', Number(e.target.value) === 0 ? null : Number(e.target.value))} className="w-full accent-gold-400" />
                <p className="mt-1 text-[11px] leading-snug text-slate-400">IMDb’s 0–10 star rating, when we have it.</p>
              </div>
              <div>
                <div className="mb-1 flex justify-between text-xs"><span className="text-slate-300">Your match at least</span><span className="font-semibold text-gold-400">{q.minMatch ? `${q.minMatch}+` : 'Any'}</span></div>
                <input type="range" min={0} max={95} step={5} value={q.minMatch ?? 0} onChange={(e) => set('minMatch', Number(e.target.value) === 0 ? null : Number(e.target.value))} className="w-full accent-gold-400" />
              </div>
            </div>

            <div className="flex flex-wrap gap-2">
              <button onClick={() => set('englishAudioOnly', !q.englishAudioOnly)} className={`rounded-lg border px-3 py-1.5 text-sm transition ${q.englishAudioOnly ? 'border-emerald-400/50 bg-emerald-500/15 text-emerald-100' : 'border-white/12 bg-white/5 text-slate-300 hover:bg-white/10'}`}>
                {q.englishAudioOnly ? '✓ ' : ''}English audio
              </button>
              <button
                onClick={() => set('streamItOnly', !q.streamItOnly)}
                title="Only titles the judge rules Stream It — our “Watch It” verdict."
                className={`rounded-lg border px-3 py-1.5 text-sm transition ${q.streamItOnly ? 'border-emerald-400/50 bg-emerald-500/15 text-emerald-100' : 'border-white/12 bg-white/5 text-slate-300 hover:bg-white/10'}`}
              >
                {q.streamItOnly ? '✓ ' : ''}⚖️ “Stream It” verdicts only
              </button>
              {q.mediaType !== 'movie' && (
                <button
                  onClick={() => set('bingeableOnly', !q.bingeableOnly)}
                  title="TV only: every episode of the latest season is already out — nothing left to wait on (vs. an ongoing, week-to-week release)."
                  className={`rounded-lg border px-3 py-1.5 text-sm transition ${q.bingeableOnly ? 'border-emerald-400/50 bg-emerald-500/15 text-emerald-100' : 'border-white/12 bg-white/5 text-slate-300 hover:bg-white/10'}`}
                >
                  {q.bingeableOnly ? '✓ ' : ''}📺 All episodes out
                </button>
              )}
              <button onClick={() => set('onMyServices', !q.onMyServices)} disabled={!hasServices} title={hasServices ? '' : 'Add your services in Settings first'} className={`rounded-lg border px-3 py-1.5 text-sm transition disabled:opacity-40 ${q.onMyServices ? 'border-emerald-400/50 bg-emerald-500/15 text-emerald-100' : 'border-white/12 bg-white/5 text-slate-300 hover:bg-white/10'}`}>
                {q.onMyServices ? '✓ ' : ''}On my services
              </button>
            </div>
          </div>
        )}
      </div>

      {/* ============ The conversation ============ */}
      <div className="card flex h-[56vh] max-h-[620px] flex-col overflow-hidden p-0">
        <div className="flex items-center gap-3 border-b border-white/10 px-4 py-3">
          <RobedPortrait src={judgeSrc} size={44} />
          <div className="min-w-0 flex-1">
            <div className="eyebrow">⚖️ The bench</div>
            <div className="truncate text-base font-bold text-white">{judgeName}</div>
          </div>
          <button
            onClick={() => { setSpeak((s) => !s); if (typeof window !== 'undefined' && 'speechSynthesis' in window) window.speechSynthesis.cancel(); }}
            className="rounded-lg border border-white/12 bg-white/5 px-2.5 py-1 text-xs text-slate-300 transition hover:bg-white/10"
            title={speak ? 'Judge reads rulings aloud' : 'Judge is muted'}
          >
            {speak ? '🔊 Voice on' : '🔇 Muted'}
          </button>
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
                      <div className="mt-3 space-y-2">
                        {m.verdict && (
                          <div className="eyebrow text-[11px]">Better for you</div>
                        )}
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
                                  <span className="text-[11px] text-slate-400">match</span>
                                </div>
                                {it.reason && <ReasonText text={it.reason} className="mt-1 text-[11px] text-slate-300" />}
                                <RatingsStrip ratings={it.ratings ?? EMPTY_TILE_RATINGS} title={it.title} year={it.year} className="mt-1" />
                                <div className="mt-1.5 flex flex-wrap gap-1">
                                  {it.where && <span className="rounded-md border border-white/10 bg-white/5 px-2 py-0.5 text-[11px] text-slate-300">📺 {it.where}</span>}
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
