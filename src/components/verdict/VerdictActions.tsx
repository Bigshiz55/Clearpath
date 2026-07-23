'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import type { MediaType, WatchlistStatus } from '@/lib/types';
import { addToWatchlist, updateWatchlistItem, removeWatchlistItem } from '@/lib/actions/watchlist';
import { useToast } from '@/components/Toast';
import { useT } from '@/i18n/I18nProvider';
import { ShareDialog } from './ShareDialog';

interface Props {
  tmdbId: number;
  mediaType: MediaType;
  title: string;
  year: number | null;
  posterPath: string | null;
  personalLabel: string;
  initialItemId?: string | null;
  initialStatus?: WatchlistStatus | null;
  initialRating?: number | null;
  initialNotes?: string | null;
}

// Values are i18n key-paths (looked up with `t(...)` at each usage site), not
// display strings; the object KEYS remain the WatchlistStatus enum values.
const STATUS_LABELS: Record<WatchlistStatus, string> = {
  strict: 'title.actions.status.strict',
  possible: 'title.actions.status.possible',
  watching: 'title.actions.status.watching',
  watched: 'title.actions.status.watched',
  paused: 'title.actions.status.paused',
  dropped: 'title.actions.status.dropped',
};

export function VerdictActions(props: Props) {
  const router = useRouter();
  const toast = useToast();
  const t = useT();
  const [pending, startTransition] = useTransition();
  const [itemId, setItemId] = useState<string | null>(props.initialItemId ?? null);
  const [status, setStatus] = useState<WatchlistStatus | null>(props.initialStatus ?? null);
  const [rating, setRating] = useState<number | null>(props.initialRating ?? null);
  const [notes, setNotes] = useState<string>(props.initialNotes ?? '');
  const [showNotes, setShowNotes] = useState(false);
  const [showShare, setShowShare] = useState(false);

  async function setItemStatus(next: WatchlistStatus) {
    const res = await addToWatchlist({
      tmdbId: props.tmdbId,
      mediaType: props.mediaType,
      title: props.title,
      year: props.year,
      posterPath: props.posterPath,
      status: next,
    });
    if (!res.ok) {
      toast.show(res.error ?? t('title.actions.toastSomethingWrong'), 'error');
      return;
    }
    const data = res.data as { itemId: string } | undefined;
    if (data?.itemId) setItemId(data.itemId);
    setStatus(next);
    toast.show(t('title.actions.toastSavedTo', { label: t(STATUS_LABELS[next]) }), 'success');
  }

  async function ensureItem(): Promise<string | null> {
    if (itemId) return itemId;
    const res = await addToWatchlist({
      tmdbId: props.tmdbId,
      mediaType: props.mediaType,
      title: props.title,
      year: props.year,
      posterPath: props.posterPath,
      status: status ?? 'possible',
    });
    if (!res.ok) {
      toast.show(res.error ?? t('title.actions.toastCouldNotSave'), 'error');
      return null;
    }
    const data = res.data as { itemId: string } | undefined;
    if (data?.itemId) {
      setItemId(data.itemId);
      if (!status) setStatus('possible');
      return data.itemId;
    }
    return null;
  }

  async function saveRating(value: number) {
    const id = await ensureItem();
    if (!id) return;
    setRating(value);
    const res = await updateWatchlistItem({ itemId: id, rating: value });
    if (!res.ok) toast.show(res.error ?? t('title.actions.toastCouldNotSaveRating'), 'error');
    else toast.show(t('title.actions.toastRated', { n: value }), 'success');
  }

  async function saveNotes() {
    const id = await ensureItem();
    if (!id) return;
    const res = await updateWatchlistItem({ itemId: id, notes });
    if (!res.ok) toast.show(res.error ?? t('title.actions.toastCouldNotSaveNotes'), 'error');
    else {
      toast.show(t('title.actions.toastNotesSaved'), 'success');
      setShowNotes(false);
    }
  }

  async function remove() {
    if (!itemId) return;
    const res = await removeWatchlistItem(itemId);
    if (!res.ok) {
      toast.show(res.error ?? t('title.actions.toastCouldNotRemove'), 'error');
      return;
    }
    setItemId(null);
    setStatus(null);
    toast.show(t('title.actions.toastRemoved'), 'info');
  }

  // The "Final Verdict" — a themed way to close a title out after watching. Each
  // maps to the existing watched/dropped status + a rating bucket, so it flows
  // straight into your watchlist with a date, no separate schema.
  const FINAL_VERDICTS: { key: string; label: string; emoji: string; status: WatchlistStatus; rating: number; tone: string }[] = [
    { key: 'guilty', label: 'title.actions.finalVerdict.guilty', emoji: '⚖️', status: 'watched', rating: 9, tone: 'border-emerald-400/50 bg-emerald-500/15 text-emerald-100' },
    { key: 'acquitted', label: 'title.actions.finalVerdict.acquitted', emoji: '🤝', status: 'watched', rating: 6, tone: 'border-yellow-400/50 bg-yellow-500/15 text-yellow-100' },
    { key: 'archive', label: 'title.actions.finalVerdict.archive', emoji: '🗄️', status: 'dropped', rating: 3, tone: 'border-red-400/50 bg-red-500/15 text-red-100' },
  ];
  const [finalVerdict, setFinalVerdict] = useState<string | null>(null);

  async function logFinalVerdict(v: (typeof FINAL_VERDICTS)[number]) {
    setFinalVerdict(v.key);
    await setItemStatus(v.status);
    const id = await ensureItem();
    if (id) {
      setRating(v.rating);
      await updateWatchlistItem({ itemId: id, rating: v.rating });
    }
    toast.show(t('title.actions.toastFinalLogged', { label: t(v.label) }), 'success');
  }

  const btn = (active: boolean) => (active ? 'btn-primary' : 'btn-secondary');

  return (
    <section className="card p-4 sm:p-5">
      {/* Final Verdict — the after-watching close-out that feeds your diary */}
      <div className="mb-4 rounded-2xl border border-gold-400/30 bg-gold-500/[0.06] p-4">
        <div className="flex items-center gap-2 text-sm font-bold text-white">
          <span aria-hidden>📓</span> {t('title.actions.finalHeading')}
        </div>
        <p className="mt-0.5 text-xs text-slate-400">{t('title.actions.finalHint')}</p>
        <div className="mt-3 flex flex-wrap gap-2">
          {FINAL_VERDICTS.map((v) => (
            <button
              key={v.key}
              onClick={() => logFinalVerdict(v)}
              disabled={pending}
              className={`inline-flex items-center gap-1.5 rounded-xl border px-3 py-2 text-sm font-semibold transition ${
                finalVerdict === v.key ? v.tone : 'border-white/12 bg-white/5 text-slate-200 hover:bg-white/10'
              }`}
            >
              <span aria-hidden>{v.emoji}</span> {t(v.label)}
            </button>
          ))}
          <Link href="/app/watchlist" className="inline-flex items-center rounded-xl px-3 py-2 text-sm font-semibold text-brand-300 hover:text-brand-200">
            {t('title.actions.openWatchlist')} →
          </Link>
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        <button onClick={() => setItemStatus('strict')} className={btn(status === 'strict')} disabled={pending}>
          ★ {t('title.actions.status.strict')}
        </button>
        <button onClick={() => setItemStatus('possible')} className={btn(status === 'possible')} disabled={pending}>
          + {t('title.actions.btnPossible')}
        </button>
        <button onClick={() => setItemStatus('watching')} className={btn(status === 'watching')} disabled={pending}>
          ▶ {t('title.actions.status.watching')}
        </button>
        <button onClick={() => setItemStatus('watched')} className={btn(status === 'watched')} disabled={pending}>
          ✓ {t('title.actions.status.watched')}
        </button>
        <button onClick={() => setShowNotes((s) => !s)} className="btn-ghost">
          ✎ {t('title.actions.btnNotes')}
        </button>
        <button onClick={() => setShowShare(true)} className="btn-ghost">
          ↗ {t('title.actions.btnShare')}
        </button>
        <button
          onClick={() => startTransition(() => router.refresh())}
          className="btn-ghost"
          disabled={pending}
        >
          ↻ {t('title.actions.btnRecalculate')}
        </button>
        {itemId && (
          <button onClick={remove} className="btn-ghost text-red-300 hover:bg-red-500/10">
            🗑 {t('title.actions.btnRemove')}
          </button>
        )}
      </div>

      {/* Rating */}
      <div className="mt-4">
        <div className="mb-1.5 text-sm font-medium text-slate-300">{t('title.actions.ratingHeading')}</div>
        <div className="flex flex-wrap gap-1">
          {Array.from({ length: 10 }, (_, i) => i + 1).map((n) => (
            <button
              key={n}
              onClick={() => saveRating(n)}
              className={`h-9 w-9 rounded-lg border text-sm font-semibold transition ${
                rating != null && n <= rating
                  ? 'border-gold-400/60 bg-gold-500/20 text-amber-100'
                  : 'border-white/10 bg-white/5 text-slate-400 hover:bg-white/10'
              }`}
              aria-label={t('title.actions.rateAria', { n })}
            >
              {n}
            </button>
          ))}
        </div>
      </div>

      {showNotes && (
        <div className="mt-4">
          <label className="label" htmlFor="notes">
            {t('title.actions.notesLabel')}
          </label>
          <textarea
            id="notes"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={3}
            maxLength={2000}
            className="input"
            placeholder={t('title.actions.notesPlaceholder')}
          />
          <div className="mt-2 flex gap-2">
            <button onClick={saveNotes} className="btn-primary">
              {t('title.actions.saveNotes')}
            </button>
            <button onClick={() => setShowNotes(false)} className="btn-ghost">
              {t('title.actions.cancel')}
            </button>
          </div>
        </div>
      )}

      {showShare && (
        <ShareDialog
          tmdbId={props.tmdbId}
          mediaType={props.mediaType}
          personalLabel={props.personalLabel}
          onClose={() => setShowShare(false)}
        />
      )}
    </section>
  );
}
