'use client';

/**
 * VOICE AUDITION (founder tool).
 *
 * Lets the owner hear the interviewer's sample line before committing to a
 * production voice. The genuinely-live OpenAI Realtime voices are chosen with the
 * `VOICE_INTERVIEW_VOICE` env var and can only be heard in a real session (the
 * session route mints one voice per deployment), so this page is honest about
 * that: it lists the candidate Realtime voices with the exact env value to set,
 * and uses the browser's own `speechSynthesis` voices as an audible stand-in so
 * the cadence of the sample line can be judged today. When no key is configured
 * it says so plainly — the production voices need one.
 */
import { useEffect, useState } from 'react';
import { pickVoice } from '@/lib/voice/realtime/fallback';

const SAMPLE_LINE =
  'So… you absolutely loved Prisoners. What grabbed you — the mystery, or the tension? Hmm. Now that tells me something.';

/** The Realtime voices OpenAI offers for the interviewer persona. */
const REALTIME_VOICES = ['sage', 'alloy', 'ash', 'ballad', 'coral', 'echo', 'shimmer', 'verse'] as const;

export function AuditionClient({ mode, configuredVoice }: { mode: 'realtime' | 'fallback'; configuredVoice: string }) {
  const [voices, setVoices] = useState<SpeechSynthesisVoice[]>([]);
  const [selected, setSelected] = useState<string>('');
  const [supported, setSupported] = useState(true);
  const [speakingLine, setSpeakingLine] = useState(false);

  useEffect(() => {
    if (typeof window === 'undefined' || !('speechSynthesis' in window)) {
      setSupported(false);
      return;
    }
    const load = (): void => {
      const list = window.speechSynthesis.getVoices();
      setVoices(list);
      setSelected((cur) => cur || (pickVoice(list)?.name ?? list[0]?.name ?? ''));
    };
    load();
    window.speechSynthesis.onvoiceschanged = load;
    return () => {
      window.speechSynthesis.onvoiceschanged = null;
      window.speechSynthesis.cancel();
    };
  }, []);

  function preview(voiceName?: string): void {
    if (typeof window === 'undefined' || !('speechSynthesis' in window)) return;
    window.speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(SAMPLE_LINE);
    const v = voices.find((x) => x.name === (voiceName ?? selected));
    if (v) u.voice = v;
    u.onstart = () => setSpeakingLine(true);
    u.onend = () => setSpeakingLine(false);
    u.onerror = () => setSpeakingLine(false);
    window.speechSynthesis.speak(u);
  }

  function stop(): void {
    if (typeof window !== 'undefined' && 'speechSynthesis' in window) window.speechSynthesis.cancel();
    setSpeakingLine(false);
  }

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-6 px-4 py-8">
      <header className="space-y-1">
        <span className="text-[11px] font-bold uppercase tracking-[0.2em] text-brand-300">Founder tool</span>
        <h1 className="text-3xl font-black text-white">Voice audition</h1>
        <p className="text-slate-400">Judge the interviewer&rsquo;s sample line and choose the production voice.</p>
      </header>

      {/* Mode callout */}
      {mode === 'realtime' ? (
        <div className="card p-4" data-testid="audition-mode-realtime">
          <p className="text-sm text-emerald-200">
            Live voice is <strong>ON</strong>. Current production voice:{' '}
            <code className="rounded bg-black/40 px-1.5 py-0.5 text-emerald-100">{configuredVoice}</code>.
          </p>
          <p className="mt-1 text-sm text-slate-400">
            To change it, set <code className="rounded bg-black/40 px-1 py-0.5">VOICE_INTERVIEW_VOICE</code> to one of the
            candidates below and redeploy. The real OpenAI voices are heard in a live interview; the previews here use your
            browser&rsquo;s voices as a stand-in for cadence only.
          </p>
        </div>
      ) : (
        <div className="card border-gold-400/30 p-4" data-testid="audition-mode-fallback">
          <p className="text-sm text-gold-100">
            No OpenAI key is configured, so the <strong>production Realtime voices need a key</strong> before they can be
            heard. Below you can preview your browser&rsquo;s built-in voices as a stand-in for the sample line&rsquo;s
            cadence.
          </p>
        </div>
      )}

      {/* Sample line */}
      <div className="card p-5">
        <div className="text-[11px] font-bold uppercase tracking-wide text-slate-400">The sample line</div>
        <p className="mt-2 text-lg font-medium text-white">&ldquo;{SAMPLE_LINE}&rdquo;</p>
      </div>

      {/* Browser-voice preview */}
      <div className="card p-5">
        <h2 className="text-sm font-bold uppercase tracking-wide text-slate-400">Preview (browser voices)</h2>
        {supported ? (
          <>
            <div className="mt-3 flex flex-col gap-3 sm:flex-row sm:items-center">
              <label htmlFor="audition-voice" className="sr-only">
                Choose a browser voice
              </label>
              <select
                id="audition-voice"
                className="min-h-[44px] flex-1 rounded-xl border border-white/15 bg-white/5 px-3 text-sm text-white focus:border-brand-400 focus:outline-none focus:ring-2 focus:ring-brand-400/40"
                value={selected}
                onChange={(e) => setSelected(e.target.value)}
              >
                {voices.map((v) => (
                  <option key={`${v.name}-${v.lang}`} value={v.name}>
                    {v.name} · {v.lang}
                  </option>
                ))}
              </select>
              {speakingLine ? (
                <button type="button" className="btn-secondary" onClick={stop}>
                  Stop
                </button>
              ) : (
                <button type="button" className="btn-primary" onClick={() => preview()} disabled={!voices.length}>
                  Play sample
                </button>
              )}
            </div>
            <p className="mt-2 text-xs text-slate-500">
              A British or Australian English voice best matches the written persona; the live interview auto-picks one when
              available.
            </p>
          </>
        ) : (
          <p className="mt-2 text-sm text-slate-400">This browser has no speech synthesis, so a live preview isn&rsquo;t available here.</p>
        )}
      </div>

      {/* Candidate Realtime voices */}
      <div className="card p-5">
        <h2 className="text-sm font-bold uppercase tracking-wide text-slate-400">Candidate production voices (OpenAI Realtime)</h2>
        <ul className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4" data-testid="audition-realtime-voices">
          {REALTIME_VOICES.map((v) => (
            <li
              key={v}
              className={`rounded-xl border px-3 py-2 text-center text-sm font-semibold capitalize ${
                v === configuredVoice ? 'border-emerald-400/50 bg-emerald-500/10 text-emerald-100' : 'border-white/10 bg-white/5 text-slate-200'
              }`}
            >
              {v}
              {v === configuredVoice ? <span className="ml-1 text-[10px] uppercase text-emerald-300">live</span> : null}
            </li>
          ))}
        </ul>
        <p className="mt-3 text-xs text-slate-500">
          Set the production voice with{' '}
          <code className="rounded bg-black/40 px-1 py-0.5 text-slate-300">VOICE_INTERVIEW_VOICE=&lt;name&gt;</code> and redeploy.
        </p>
      </div>
    </div>
  );
}
