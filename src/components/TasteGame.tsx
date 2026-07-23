'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { Poster } from './PosterCard';
import { rateQuizTitle } from '@/lib/actions/quiz';
import { useT } from '@/i18n/I18nProvider';

interface Item {
  id: number;
  mediaType: 'movie' | 'tv';
  title: string;
  year: number | null;
  posterPath: string | null;
  posterUrl: string | null;
}

// Plain-language rulings → a 1–10 rating the taste engine already understands.
// Icons map to the feeling at a glance (heart = loved, thumbs = good/bad) so a
// first-timer never has to guess what a button means.
const RULINGS: { labelKey: string; emoji: string; rating: number; style: string }[] = [
  { labelKey: 'ask.ruleLoved', emoji: '❤️', rating: 9, style: 'border-gold-400/60 bg-gold-500/20 text-amber-100 hover:bg-gold-500/30' },
  { labelKey: 'ask.ruleLiked', emoji: '👍', rating: 7, style: 'border-brand-400/50 bg-brand-500/15 text-brand-100 hover:bg-brand-500/25' },
  { labelKey: 'ask.ruleOkay', emoji: '😐', rating: 5, style: 'border-white/20 bg-white/5 text-slate-200 hover:bg-white/10' },
  { labelKey: 'ask.ruleDisliked', emoji: '👎', rating: 2, style: 'border-red-400/40 bg-red-500/15 text-red-100 hover:bg-red-500/25' },
];

/** "The Docket" — a court-themed taste game. Rule on as many cases as you like;
 *  each ruling tunes your taste. Adjourn (stop) whenever you want. */
export function TasteGame({ onDone, build = 'dev' }: { onDone: (ruledCount: number) => void; build?: string }) {
  const t = useT();
  const [items, setItems] = useState<Item[]>([]);
  const [idx, setIdx] = useState(0);
  const [ruled, setRuled] = useState(0);
  const [failed, setFailed] = useState(false);
  const fetching = useRef(false);

  const loadMore = useCallback(async () => {
    if (fetching.current) return;
    fetching.current = true;
    try {
      const res = await fetch('/api/quiz');
      const data = await res.json();
      if (data.error) {
        if (items.length === 0) setFailed(true);
        return;
      }
      const incoming: Item[] = data.items ?? [];
      setItems((prev) => {
        const have = new Set(prev.map((p) => `${p.mediaType}-${p.id}`));
        return [...prev, ...incoming.filter((i) => !have.has(`${i.mediaType}-${i.id}`))];
      });
    } catch {
      if (items.length === 0) setFailed(true);
    } finally {
      fetching.current = false;
    }
  }, [items.length]);

  useEffect(() => {
    void loadMore();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Top up the deck before it runs dry so the game feels endless.
  useEffect(() => {
    if (items.length > 0 && idx >= items.length - 3) void loadMore();
  }, [idx, items.length, loadMore]);

  const current = items[idx] ?? null;

  function advance() {
    setIdx((i) => i + 1);
  }
  function rule(rating: number) {
    if (!current) return;
    setRuled((n) => n + 1);
    void rateQuizTitle({
      tmdbId: current.id,
      mediaType: current.mediaType,
      title: current.title,
      year: current.year,
      posterPath: current.posterPath,
      rating,
    }).catch(() => {});
    advance();
  }

  return (
    // Full-viewport overlay (covers the app shell) so nothing scrolls: header +
    // rulings are fixed height and the poster flexes to fill whatever is left.
    <div className="fixed inset-0 z-50 flex flex-col overflow-hidden bg-ink-950 px-3 pt-[calc(0.5rem+env(safe-area-inset-top))] pb-[calc(0.5rem+env(safe-area-inset-bottom))]">
      {/* Header (fixed) */}
      <div className="flex-none text-center">
        <h1 className="text-lg font-black text-white sm:text-xl">⚖️ {t('ask.theDocket')} <span className="align-middle text-[10px] font-normal text-slate-600">v3·{build}</span></h1>
        {!failed && current && <div className="text-xs font-semibold text-slate-400">{t('ask.showN', { n: ruled + 1, rated: ruled })}</div>}
      </div>

      {failed ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-3 text-center text-slate-300">
          <p className="text-xl text-slate-200">{t('ask.docketLoadError')}</p>
          <button onClick={() => onDone(ruled)} className="btn-primary px-6 py-3 text-lg">{t('ask.backToPicks')}</button>
        </div>
      ) : !current ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-3 text-slate-300">
          <span className="h-9 w-9 animate-spin rounded-full border-2 border-white/20 border-t-brand-400" />
          <span className="text-lg">{t('ask.callingNextCase')}</span>
          <button onClick={() => onDone(ruled)} className="mt-2 text-sm font-semibold text-amber-100 underline">{t('ask.adjourn')}</button>
        </div>
      ) : (
        <>
          {/* Poster flexes to fill the space between header and rulings, with a
              gentle "leave whenever" Adjourn floating over its lower edge. */}
          <div className="flex min-h-0 flex-1 items-center justify-center py-2">
            <div className="relative aspect-[2/3] h-full max-h-full overflow-hidden rounded-xl border-2 border-white/10 shadow-card">
              <Poster posterUrl={current.posterUrl} title={current.title} />
              <div className="pointer-events-none absolute inset-x-0 bottom-0 h-24 bg-gradient-to-t from-black/85 via-black/40 to-transparent" />
              <button
                onClick={() => onDone(ruled)}
                className="absolute bottom-3 left-1/2 -translate-x-1/2 whitespace-nowrap rounded-full border-2 border-gold-400/60 bg-black/70 px-4 py-2 text-sm font-bold text-amber-100 backdrop-blur transition hover:bg-black/85"
              >
{t('ask.adjourn')}{ruled > 0 ? t('ask.adjournRated', { n: ruled }) : ''}
              </button>
            </div>
          </div>

          {/* Title (fixed) */}
          <div className="flex flex-none items-center justify-center gap-2 text-center">
            <span className="rounded bg-white/10 px-1.5 py-0.5 text-[10px] uppercase text-slate-300">{current.mediaType === 'movie' ? t('ask.movie') : t('ask.tv')}</span>
            <h2 className="line-clamp-1 text-base font-black leading-tight text-white sm:text-lg">
              {current.title}{current.year ? <span className="font-semibold text-slate-400"> ({current.year})</span> : null}
            </h2>
          </div>

          {/* Rulings (fixed) */}
          <div className="flex-none pt-2">
            <p className="mb-1.5 text-center text-sm font-bold text-white">
              {t('ask.haveYouSeen')}
            </p>
            <div className="grid grid-cols-2 gap-2">
              {RULINGS.map((r) => (
                <button key={r.labelKey} onClick={() => rule(r.rating)} className={`flex items-center justify-center gap-1.5 rounded-xl border-2 px-2 py-2.5 text-base font-bold transition active:scale-[0.98] ${r.style}`}>
                  <span className="text-lg" aria-hidden>{r.emoji}</span> {t(r.labelKey)}
                </button>
              ))}
            </div>
            <button onClick={advance} className="mt-2 w-full rounded-xl border-2 border-white/15 bg-white/5 py-2.5 text-sm font-bold text-slate-300 hover:bg-white/10">
              {t('ask.haventSeenThisSkip')}
            </button>
          </div>
        </>
      )}
    </div>
  );
}
