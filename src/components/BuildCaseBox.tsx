'use client';

import { useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useToast } from '@/components/Toast';
import { useT } from '@/i18n/I18nProvider';

/**
 * "State Your Case" — the low-friction way to start a Taste DNA: just type what
 * you like / dislike / avoid in plain words, or make a request. The server
 * parses it into targeted DNA signals and routes actionable asks (where to
 * watch a title, something on a service, what's coming on) to the right screen.
 * (The title-by-title Mentalist is still one tap away.)
 */
// The kinds of things you can ask — one per router capability. Tapping a chip
// drops the example into the box so it's obvious what VERD1CT can do. The live-TV
// listing asks are first so it's clear we know what's actually on right now.
// The most common things people ask — broad, mainstream, and each one shows off
// a different engine trick (live listings, time window, where-to-watch, a
// service, a genre, an occasion). Not tuned to any one person's taste.

export function BuildCaseBox({ hero = false }: { hero?: boolean }) {
  const router = useRouter();
  const toast = useToast();
  const t = useT();
  const EXAMPLES: { hint: string; text: string }[] = [
    { hint: t('ask.buildCase.exTvTonightHint'), text: t('ask.buildCase.exTvTonightText') },
    { hint: t('ask.buildCase.exNetflixHint'), text: t('ask.buildCase.exNetflixText') },
    { hint: t('ask.buildCase.exBarbieHint'), text: t('ask.buildCase.exBarbieText') },
    { hint: t('ask.buildCase.exNext2hHint'), text: t('ask.buildCase.exNext2hText') },
    { hint: t('ask.buildCase.exScaryHint'), text: t('ask.buildCase.exScaryText') },
    { hint: t('ask.buildCase.exFamilyHint'), text: t('ask.buildCase.exFamilyText') },
  ];
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const boxRef = useRef<HTMLTextAreaElement>(null);
  const lastCase = useRef<{ id: string | null; at: number }>({ id: null, at: 0 });

  async function submit() {
    const trimmed = text.trim();
    if (trimmed.length < 4 || busy) return;
    setBusy(true);
    try {
      // A resubmit within 90s is a likely rephrase → a weak "that missed" label
      // on the previous parse (step 1 of the accuracy flywheel).
      const now = Date.now();
      const priorCaseId = lastCase.current.id && now - lastCase.current.at < 90_000 ? lastCase.current.id : null;
      const r = await fetch('/api/build-case', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: trimmed, source: 'text', lang: 'en', priorCaseId }),
      });
      const d = await r.json();
      if (d.error) { toast.show(d.error, 'error'); return; }
      if (typeof d.caseId === 'string') lastCase.current = { id: d.caseId, at: Date.now() };
      setText('');
      // If the case included an actionable ask (e.g. "coming on in the next 12
      // hours" or "something on Netflix"), the server routes us to the right
      // screen. `stay` = a lookup that found nothing — keep them here with the note.
      // On a routing moment, pop the ruling dead-center in pink (the gavel is
      // baked into that toast); a stay-put build gets the quiet bottom toast.
      if (typeof d.redirect === 'string') {
        toast.show(d.summary || t('ask.buildCase.pullingRuling'), 'verdict');
        router.push(d.redirect);
      } else {
        toast.show(d.summary ? `⚖️ ${d.summary}` : t('ask.buildCase.gotItBuilding'), 'success');
        if (!d.stay) router.push('/app/watch');
      }
    } catch {
      toast.show(t('ask.buildCase.couldNotRead'), 'error');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div
      className={
        hero
          ? 'mx-auto max-w-2xl rounded-3xl border-2 border-brand-400/50 bg-gradient-to-br from-brand-500/20 via-fuchsia-500/10 to-transparent p-5 shadow-[0_16px_50px_-16px_rgba(236,72,153,0.55)] sm:p-6'
          : 'mx-auto max-w-2xl rounded-2xl border border-brand-400/40 bg-gradient-to-r from-brand-500/15 via-fuchsia-500/10 to-transparent p-4'
      }
    >
      <div className="flex items-start gap-3">
        <span className={hero ? 'text-3xl' : 'text-2xl'} aria-hidden>⚖️</span>
        <div className="min-w-0">
          <div className={hero ? 'text-xl font-black text-white sm:text-2xl' : 'text-base font-extrabold text-white sm:text-lg'}>{t('ask.buildCase.title')}</div>
          <div className={hero ? 'text-sm font-medium text-slate-100 sm:text-base' : 'text-sm text-slate-300'}>
            {t('ask.buildCase.descA')}<span className="font-semibold text-white">{t('ask.buildCase.descLiveTv')}</span>{t('ask.buildCase.descB')}<span className="font-semibold text-white">{t('ask.buildCase.descWhereStream')}</span>{t('ask.buildCase.descC')}<span className="font-semibold text-white">{t('ask.buildCase.descOnService')}</span>{t('ask.buildCase.descD')}
          </div>
          <Link href="/app/mentalist" className={`mt-1.5 inline-block font-semibold text-brand-200 underline-offset-2 hover:text-white hover:underline ${hero ? 'text-sm' : 'text-xs'}`}>
            {t('ask.buildCase.orNameShows')}
          </Link>
        </div>
      </div>

      {/* Tappable examples — one per kind of question, so the range is obvious.
          Live-TV listings lead so it's clear we show what's actually on. */}
      <div className="mt-3">
        <div className="mb-1.5 text-[11px] font-bold uppercase tracking-wide text-slate-400">{t('ask.buildCase.tryOne')}</div>
        <div className="flex flex-wrap gap-1.5">
          {EXAMPLES.map((ex) => (
            <button
              key={ex.hint}
              type="button"
              onClick={() => { setText(ex.text); boxRef.current?.focus(); }}
              className="rounded-full border border-white/15 bg-white/[0.06] px-2.5 py-1 text-xs font-semibold text-slate-200 transition hover:border-brand-300 hover:bg-brand-500/20 hover:text-white"
            >
              {ex.hint}
            </button>
          ))}
        </div>
      </div>

      <textarea
        ref={boxRef}
        value={text}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) { e.preventDefault(); void submit(); } }}
        rows={3}
        aria-label={t('ask.buildCase.textareaAria')}
        placeholder={t('ask.buildCase.placeholder')}
        className={
          hero
            ? 'mt-3 w-full resize-none rounded-xl border border-white/20 bg-ink-950/70 px-4 py-3.5 text-base font-medium text-white placeholder:text-slate-400 focus:border-brand-400 focus:outline-none'
            : 'mt-3 w-full resize-none rounded-xl border border-white/15 bg-ink-950/70 px-3 py-2.5 text-sm text-white placeholder:text-slate-500 focus:border-brand-400 focus:outline-none'
        }
      />
      <div className="mt-3 flex justify-end">
        <button
          onClick={() => void submit()}
          disabled={busy || text.trim().length < 4}
          className={`wv-cta-3d disabled:cursor-not-allowed ${hero ? 'px-8 py-3.5 text-lg' : 'px-5 py-2.5 text-sm'}`}
        >
          {busy ? t('ask.buildCase.ruling') : t('ask.buildCase.hitGavel')}
        </button>
      </div>
    </div>
  );
}
