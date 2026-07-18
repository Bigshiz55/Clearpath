'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import type { MediaType, WatchlistStatus } from '@/lib/types';
import { addToWatchlist, updateWatchlistItem, removeWatchlistItem } from '@/lib/actions/watchlist';
import { useToast } from '@/components/Toast';
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

const STATUS_LABELS: Record<WatchlistStatus, string> = {
  strict: 'Strict Watchlist',
  possible: 'Possible Watchlist',
  watching: 'Watching',
  watched: 'Watched',
  paused: 'Paused',
  dropped: 'Dropped',
};

export function VerdictActions(props: Props) {
  const router = useRouter();
  const toast = useToast();
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
      toast.show(res.error ?? 'Something went wrong.', 'error');
      return;
    }
    const data = res.data as { itemId: string } | undefined;
    if (data?.itemId) setItemId(data.itemId);
    setStatus(next);
    toast.show(`Saved to ${STATUS_LABELS[next]}.`, 'success');
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
      toast.show(res.error ?? 'Could not save.', 'error');
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
    if (!res.ok) toast.show(res.error ?? 'Could not save rating.', 'error');
    else toast.show(`Rated ${value}/10.`, 'success');
  }

  async function saveNotes() {
    const id = await ensureItem();
    if (!id) return;
    const res = await updateWatchlistItem({ itemId: id, notes });
    if (!res.ok) toast.show(res.error ?? 'Could not save notes.', 'error');
    else {
      toast.show('Notes saved.', 'success');
      setShowNotes(false);
    }
  }

  async function remove() {
    if (!itemId) return;
    const res = await removeWatchlistItem(itemId);
    if (!res.ok) {
      toast.show(res.error ?? 'Could not remove.', 'error');
      return;
    }
    setItemId(null);
    setStatus(null);
    toast.show('Removed from your watchlist.', 'info');
  }

  // The "Final Verdict" — a themed way to close a title out after watching. Each
  // maps to the existing watched/dropped status + a rating bucket, so it flows
  // straight into your diary (the Docket) with a date, no separate schema.
  const FINAL_VERDICTS: { key: string; label: string; emoji: string; status: WatchlistStatus; rating: number; tone: string }[] = [
    { key: 'guilty', label: 'Guilty — amazing', emoji: '⚖️', status: 'watched', rating: 9, tone: 'border-emerald-400/50 bg-emerald-500/15 text-emerald-100' },
    { key: 'acquitted', label: 'Acquitted — it was fine', emoji: '🤝', status: 'watched', rating: 6, tone: 'border-yellow-400/50 bg-yellow-500/15 text-yellow-100' },
    { key: 'archive', label: 'Sentenced to the archive', emoji: '🗄️', status: 'dropped', rating: 3, tone: 'border-red-400/50 bg-red-500/15 text-red-100' },
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
    toast.show(`Final verdict logged: ${v.label}. It’s in your diary.`, 'success');
  }

  const btn = (active: boolean) => (active ? 'btn-primary' : 'btn-secondary');

  return (
    <section className="card p-4 sm:p-5">
      {/* Final Verdict — the after-watching close-out that feeds your diary */}
      <div className="mb-4 rounded-2xl border border-gold-400/30 bg-gold-500/[0.06] p-4">
        <div className="flex items-center gap-2 text-sm font-bold text-white">
          <span aria-hidden>📓</span> Finished it? Hand down your Final Verdict
        </div>
        <p className="mt-0.5 text-xs text-slate-400">Logs a dated entry to your diary (the Docket).</p>
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
              <span aria-hidden>{v.emoji}</span> {v.label}
            </button>
          ))}
          <Link href="/app/docket" className="inline-flex items-center rounded-xl px-3 py-2 text-sm font-semibold text-brand-300 hover:text-brand-200">
            Open my diary →
          </Link>
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        <button onClick={() => setItemStatus('strict')} className={btn(status === 'strict')} disabled={pending}>
          ★ Strict Watchlist
        </button>
        <button onClick={() => setItemStatus('possible')} className={btn(status === 'possible')} disabled={pending}>
          + Possible
        </button>
        <button onClick={() => setItemStatus('watching')} className={btn(status === 'watching')} disabled={pending}>
          ▶ Watching
        </button>
        <button onClick={() => setItemStatus('watched')} className={btn(status === 'watched')} disabled={pending}>
          ✓ Watched
        </button>
        <button onClick={() => setShowNotes((s) => !s)} className="btn-ghost">
          ✎ Notes
        </button>
        <button onClick={() => setShowShare(true)} className="btn-ghost">
          ↗ Share
        </button>
        <button
          onClick={() => startTransition(() => router.refresh())}
          className="btn-ghost"
          disabled={pending}
        >
          ↻ Recalculate
        </button>
        {itemId && (
          <button onClick={remove} className="btn-ghost text-red-300 hover:bg-red-500/10">
            🗑 Remove
          </button>
        )}
      </div>

      {/* Rating */}
      <div className="mt-4">
        <div className="mb-1.5 text-sm font-medium text-slate-300">Your rating</div>
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
              aria-label={`Rate ${n} out of 10`}
            >
              {n}
            </button>
          ))}
        </div>
      </div>

      {showNotes && (
        <div className="mt-4">
          <label className="label" htmlFor="notes">
            Personal notes
          </label>
          <textarea
            id="notes"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={3}
            maxLength={2000}
            className="input"
            placeholder="Why you want to watch it, who recommended it, where you left off…"
          />
          <div className="mt-2 flex gap-2">
            <button onClick={saveNotes} className="btn-primary">
              Save notes
            </button>
            <button onClick={() => setShowNotes(false)} className="btn-ghost">
              Cancel
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
