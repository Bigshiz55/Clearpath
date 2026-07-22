'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useToast } from '@/components/Toast';

type Lang = 'en' | 'zh';

/**
 * "State Your Case" — the low-friction way to start a Taste DNA: just type (or
 * say) what you like / dislike / avoid in plain words, or make a request. The
 * server parses it into targeted DNA signals and routes actionable asks (where
 * to watch a title, something on a service, what's coming on) to the right
 * screen. Voice works in English or Simplified Chinese, and the server's intent
 * parse is language-agnostic, so "在亚马逊上找点东西看" routes just like the
 * English equivalent.
 */
export function BuildCaseBox() {
  const router = useRouter();
  const toast = useToast();
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [lang, setLang] = useState<Lang>('en');
  const [listening, setListening] = useState(false);
  const recognitionRef = useRef<{ start: () => void; stop: () => void } | null>(null);
  const lastCase = useRef<{ id: string | null; at: number }>({ id: null, at: 0 });

  const voiceSupported =
    typeof window !== 'undefined' && ('webkitSpeechRecognition' in window || 'SpeechRecognition' in window);

  useEffect(() => () => recognitionRef.current?.stop(), []);

  async function submit(override?: string, src: 'text' | 'voice' = 'text') {
    const t = (override ?? text).trim();
    if (t.length < 4 || busy) return;
    setBusy(true);
    try {
      // A resubmit within 90s is a likely rephrase → a weak "that missed" label
      // on the previous parse (step 1 of the accuracy flywheel).
      const now = Date.now();
      const priorCaseId = lastCase.current.id && now - lastCase.current.at < 90_000 ? lastCase.current.id : null;
      const r = await fetch('/api/build-case', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: t, source: src, lang, priorCaseId }),
      });
      const d = await r.json();
      if (d.error) { toast.show(d.error, 'error'); return; }
      if (typeof d.caseId === 'string') lastCase.current = { id: d.caseId, at: Date.now() };
      toast.show(d.summary ? `⚖️ ${d.summary}` : 'Got it — building your Taste DNA. 🧬', 'success');
      setText('');
      // If the case included an actionable ask (e.g. "coming on in the next 12
      // hours" or "something on Netflix"), the server routes us to the right
      // screen. `stay` = a lookup that found nothing — keep them here with the note.
      if (typeof d.redirect === 'string') router.push(d.redirect);
      else if (!d.stay) router.push('/app/watch');
    } catch {
      toast.show('Could not read that — try again.', 'error');
    } finally {
      setBusy(false);
    }
  }

  function startVoice() {
    if (typeof window === 'undefined') return;
    const w = window as unknown as { webkitSpeechRecognition?: new () => never; SpeechRecognition?: new () => never };
    const Ctor = w.SpeechRecognition ?? w.webkitSpeechRecognition;
    if (!Ctor) return;
    const rec = new (Ctor as unknown as new () => Record<string, unknown>)() as Record<string, unknown> & {
      lang: string; interimResults: boolean; maxAlternatives: number;
      onresult: (e: { results: { length: number; [i: number]: { isFinal: boolean; [j: number]: { transcript: string } } } }) => void;
      onend: () => void; onerror: (e: { error?: string }) => void; start: () => void; stop: () => void;
    };
    rec.lang = lang === 'zh' ? 'zh-CN' : 'en-US';
    // Interim results so the box fills in live — important on iOS Safari, which
    // often never delivers a "final" result but does stream interim text.
    rec.interimResults = true;
    rec.maxAlternatives = 1;
    rec.onresult = (e) => {
      let finalText = '';
      let interim = '';
      for (let i = 0; i < e.results.length; i++) {
        const r = e.results[i];
        const alt = r?.[0]?.transcript ?? '';
        if (r?.isFinal) finalText += alt;
        else interim += alt;
      }
      const shown = (finalText || interim).trim();
      if (shown) setText(shown); // live preview as you speak
      if (finalText.trim()) void submit(finalText.trim(), 'voice'); // route once a phrase finalizes
    };
    rec.onend = () => setListening(false);
    rec.onerror = (e) => {
      setListening(false);
      const code = e?.error ?? 'error';
      const msg =
        code === 'not-allowed' || code === 'service-not-allowed'
          ? zh ? '麦克风被拒绝——请在浏览器设置里允许麦克风。' : 'Microphone blocked — allow it in your browser/site settings.'
          : code === 'language-not-supported'
            ? zh ? '此设备/浏览器不支持中文语音识别——请改用键盘听写或直接粘贴。' : 'This device can’t do Chinese speech recognition — type/paste instead.'
            : code === 'no-speech'
              ? zh ? '没听到声音——请靠近麦克风再试一次。' : 'Didn’t catch any speech — try again, closer to the mic.'
              : zh ? `语音出错：${code}` : `Voice error: ${code}`;
      toast.show(msg, 'error');
    };
    recognitionRef.current = rec;
    setListening(true);
    rec.start();
  }

  function stopVoice() {
    recognitionRef.current?.stop();
    setListening(false);
  }

  const zh = lang === 'zh';

  return (
    <div className="mx-auto max-w-2xl rounded-2xl border border-brand-400/40 bg-gradient-to-r from-brand-500/15 via-fuchsia-500/10 to-transparent p-4">
      <div className="flex items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          <span className="text-2xl" aria-hidden>⚖️</span>
          <div className="min-w-0">
            <div className="text-base font-extrabold text-white sm:text-lg">{zh ? '陈述你的偏好' : 'State Your Case'}</div>
            <div className="text-sm text-slate-300">
              {zh
                ? '用你自己的话说说你喜欢什么，或直接提要求，比如“在亚马逊上找点东西看”。'
                : 'Tell us what you like — or ask for something specific, like “crime shows coming on in the next few hours.”'}
            </div>
          </div>
        </div>
        {/* Language toggle — also sets the voice recognition language. */}
        <div className="flex flex-none rounded-lg border border-white/15 bg-ink-950/60 p-0.5 text-xs font-bold">
          {(['en', 'zh'] as const).map((l) => (
            <button
              key={l}
              type="button"
              onClick={() => setLang(l)}
              className={`rounded-md px-2.5 py-1 transition ${lang === l ? 'bg-brand-500 text-white' : 'text-slate-300 hover:text-white'}`}
              aria-pressed={lang === l}
            >
              {l === 'en' ? 'EN' : '中文'}
            </button>
          ))}
        </div>
      </div>

      <div className="relative mt-3">
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) { e.preventDefault(); void submit(); } }}
          rows={3}
          aria-label={zh ? '描述你喜欢看什么' : 'Describe what you like to watch'}
          placeholder={
            zh
              ? '例如：我喜欢烧脑的悬疑片，但不喜欢超自然题材和太慢的节奏。'
              : 'e.g. I love intelligent crime mysteries, but I avoid supernatural stories and anything too slow.'
          }
          className="w-full resize-none rounded-xl border border-white/15 bg-ink-950/70 px-3 py-2.5 pr-12 text-sm text-white placeholder:text-slate-500 focus:border-brand-400 focus:outline-none"
        />
        {voiceSupported && (
          <button
            type="button"
            onClick={listening ? stopVoice : startVoice}
            className={`absolute right-2 top-2 grid h-9 w-9 place-items-center rounded-lg transition ${
              listening ? 'animate-pulse bg-red-500/25 text-red-200' : 'text-slate-400 hover:bg-white/10 hover:text-white'
            }`}
            aria-label={listening ? (zh ? '停止语音输入' : 'Stop voice input') : zh ? '语音输入（中文）' : 'Speak your case'}
            title={listening ? (zh ? '正在聆听…点击停止' : 'Listening… tap to stop') : zh ? '中文语音' : 'Speak (English)'}
          >
            <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" aria-hidden>
              <rect x="9" y="3" width="6" height="11" rx="3" stroke="currentColor" strokeWidth="1.6" />
              <path d="M5 11a7 7 0 0 0 14 0M12 18v3" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
            </svg>
          </button>
        )}
      </div>

      <div className="mt-2 flex items-center justify-between gap-3">
        <Link href="/app/mentalist" className="text-xs text-slate-400 underline-offset-2 hover:text-slate-200 hover:underline">
          {zh ? '想直接说出你喜欢的片名？→' : 'Prefer to name titles you love? →'}
        </Link>
        <button
          onClick={() => void submit()}
          disabled={busy || text.trim().length < 4}
          className="btn-primary shrink-0 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {busy ? (zh ? '正在分析…' : 'Building…') : zh ? '生成我的口味 DNA →' : 'Build my Taste DNA →'}
        </button>
      </div>
      <p className="mt-1.5 text-[11px] text-slate-500">
        {zh ? '由 WatchVerdict Mentalist 提供支持' : 'Powered by the WatchVerdict Mentalist'}
        {listening && <span className="ml-2 font-semibold text-red-300">● {zh ? '聆听中' : 'Listening'}</span>}
      </p>
    </div>
  );
}
