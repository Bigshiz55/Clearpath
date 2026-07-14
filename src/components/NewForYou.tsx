'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Poster } from '@/components/PosterCard';
import { tmdbImage } from '@/lib/tmdb/image';
import { dismissDigestItem } from '@/lib/actions/digest';
import type { MediaType } from '@/lib/types';

export interface DigestItem {
  id: string;
  tmdb_id: number;
  media_type: MediaType;
  title: string;
  year: number | null;
  poster_path: string | null;
  personal_score: number;
  primary_call: string;
  reason: string | null;
}

const callColor = (c: string) =>
  c === 'WATCH IT'
    ? 'text-emerald-300'
    : c === 'MAYBE'
      ? 'text-yellow-300'
      : 'text-red-300';

export function NewForYou({ items, label }: { items: DigestItem[]; label: string }) {
  const [list, setList] = useState(items);
  if (list.length === 0) return null;

  async function dismiss(id: string) {
    setList((l) => l.filter((i) => i.id !== id));
    await dismissDigestItem(id);
  }

  return (
    <section className="rounded-2xl border border-gold-400/30 bg-gradient-to-b from-gold-500/10 to-transparent p-4 sm:p-5">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="flex items-center gap-2 text-lg font-semibold text-white">
          <span>🆕</span> New for you
        </h2>
        <span className="text-xs text-slate-400">Fresh releases matched to {label.toLowerCase()}</span>
      </div>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
        {list.map((item) => (
          <div key={item.id} className="card group relative overflow-hidden">
            <button
              onClick={() => dismiss(item.id)}
              className="absolute right-1.5 top-1.5 z-10 grid h-7 w-7 place-items-center rounded-full bg-black/60 text-slate-300 backdrop-blur transition hover:bg-black/80 hover:text-white"
              aria-label={`Dismiss ${item.title}`}
            >
              ✕
            </button>
            <Link href={`/app/title/${item.media_type}/${item.tmdb_id}`} className="block">
              <div className="relative aspect-[2/3] overflow-hidden">
                <Poster posterUrl={tmdbImage(item.poster_path, 'w342')} title={item.title} className="transition group-hover:scale-105" />
                <span className="absolute left-2 top-2 rounded-full border border-emerald-400/40 bg-emerald-500/20 px-2 py-0.5 text-xs font-bold tabular-nums text-emerald-100">
                  {item.personal_score}%
                </span>
              </div>
              <div className="p-2.5">
                <div className="line-clamp-1 text-sm font-semibold text-white">{item.title}</div>
                <div className="text-xs text-slate-400">
                  {item.year ?? '—'} · <span className={callColor(item.primary_call)}>{item.primary_call}</span>
                </div>
                {item.reason && <div className="mt-0.5 line-clamp-1 text-[11px] text-slate-500">{item.reason}</div>}
              </div>
            </Link>
          </div>
        ))}
      </div>
    </section>
  );
}
