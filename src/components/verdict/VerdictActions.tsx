'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
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

  const btn = (active: boolean) => (active ? 'btn-primary' : 'btn-secondary');

  return (
    <section className="card p-4 sm:p-5">
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
