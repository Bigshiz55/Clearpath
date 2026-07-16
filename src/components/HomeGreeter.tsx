'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { houseByKey, readHousePick } from '@/lib/houseJudges';

// The judge's personality — rotating openers, greeting you like a regular.
const OPENERS = [
  'the court’s in session. What are we watching tonight?',
  'tell me the vibe — genre, length, mood — and I’ll hand down a verdict.',
  'give me a case and I’ll rule. What are you in the mood for?',
  'no more endless scrolling. Tell me what you want and I’ll find it.',
  'what’s the assignment tonight — something funny, tense, easy?',
];

const CHIPS = [
  { label: '😂 Funny & short', q: 'something funny and short for tonight' },
  { label: '🔪 Crime thriller', q: 'a crime thriller from the last few years' },
  { label: '🍿 Bingeable series', q: 'a bingeable show with all episodes out, 80%+ audience' },
  { label: '🎲 Surprise me', q: '' },
];

function timeGreeting(hour: number): string {
  if (hour < 5) return 'Burning the midnight oil';
  if (hour < 12) return 'Morning';
  if (hour < 17) return 'Afternoon';
  if (hour < 22) return 'Evening';
  return 'Late night';
}

export function HomeGreeter({ name, className = '' }: { name?: string | null; className?: string }) {
  const router = useRouter();
  const [q, setQ] = useState('');
  const [judge, setJudge] = useState({ name: 'Judge Annie', src: '/judge-annie.png' });
  const [greeting, setGreeting] = useState<string | null>(null);
  const [listening, setListening] = useState(false);
  const recognitionRef = useRef<{ start: () => void; stop: () => void } | null>(null);

  const voiceSupported =
    typeof window !== 'undefined' && ('webkitSpeechRecognition' in window || 'SpeechRecognition' in window);

  // Client-only so the greeting/judge can vary without a hydration mismatch.
  useEffect(() => {
    const dog = houseByKey(readHousePick() === 'waffles' ? 'waffles' : 'annie');
    setJudge({ name: dog.name, src: dog.src });
    const hour = new Date().getHours();
    const who = name ? `, ${name}` : '';
    const opener = OPENERS[Math.floor(Math.random() * OPENERS.length)]!;
    setGreeting(`${timeGreeting(hour)}${who} — ${opener}`);
  }, [name]);

  function ask(text: string) {
    const t = text.trim();
    router.push(t ? `/app/ask?q=${encodeURIComponent(t)}` : '/app/ask');
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
      if (said) ask(said);
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

  return (
    <div className={className}>
      {/* Mascot + speech bubble */}
      <div className="flex items-end gap-3">
        <div className="relative flex-none">
          <div className="h-16 w-16 overflow-hidden rounded-full border-2 border-gold-400/60 shadow-lg" style={{ boxShadow: '0 0 22px rgba(245,198,90,.35)' }}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={judge.src} alt={judge.name} className="h-full w-full object-cover" />
          </div>
          {/* "online" pulse */}
          <span className="absolute -bottom-0.5 -right-0.5 flex h-4 w-4">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-60" />
            <span className="relative inline-flex h-4 w-4 rounded-full border-2 border-ink-900 bg-emerald-400" />
          </span>
        </div>
        <div className="relative mb-1 max-w-lg rounded-2xl rounded-bl-sm border border-white/10 bg-white/[0.06] px-4 py-2.5 backdrop-blur">
          <div className="eyebrow">⚖️ {judge.name}</div>
          <p className="mt-1 text-base text-slate-50 sm:text-lg">
            {greeting ?? 'The court is in session. What are we watching tonight?'}
          </p>
        </div>
      </div>

      {/* Talk to the judge */}
      <div className="mt-3 flex items-center gap-2 rounded-2xl border border-white/12 bg-ink-850/70 p-1.5 shadow-card focus-within:border-brand-400/60">
        <span className="pl-2 text-lg" aria-hidden>💬</span>
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              ask(q);
            }
          }}
          placeholder="Tell the judge what you feel like watching…"
          className="min-w-0 flex-1 bg-transparent px-1 py-2 text-sm text-white outline-none placeholder:text-slate-500 sm:text-base"
          aria-label="Tell the judge what you want to watch"
        />
        {voiceSupported && (
          <button
            type="button"
            onClick={listening ? stopVoice : startVoice}
            className={`grid h-10 w-10 flex-none place-items-center rounded-xl transition ${listening ? 'bg-red-500/20 text-red-300' : 'text-slate-400 hover:bg-white/5 hover:text-white'}`}
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
          onClick={() => ask(q)}
          className="btn-primary flex-none rounded-xl px-4 py-2 text-sm"
        >
          Ask ⚖️
        </button>
      </div>

      {/* Quick prompts */}
      <div className="mt-2 flex flex-wrap gap-1.5">
        {CHIPS.map((c) => (
          <button
            key={c.label}
            onClick={() => ask(c.q)}
            className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs text-slate-300 transition hover:border-white/20 hover:bg-white/10 hover:text-white"
          >
            {c.label}
          </button>
        ))}
      </div>
    </div>
  );
}
