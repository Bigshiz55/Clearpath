'use client';

import { useState, useTransition } from 'react';
import Link from 'next/link';
import { importWatchedHistory, type ImportSummary } from '@/lib/actions/import';

const STATUS_STYLE: Record<string, string> = {
  imported: 'text-emerald-300',
  skipped: 'text-slate-400',
  unmatched: 'text-amber-300',
  error: 'text-red-300',
};

const STATUS_LABEL: Record<string, string> = {
  imported: 'Added',
  skipped: 'Already there',
  unmatched: "Couldn't match",
  error: 'Lookup failed',
};

export function ImportForm() {
  const [text, setText] = useState('');
  const [summary, setSummary] = useState<ImportSummary | null>(null);
  const [pending, startTransition] = useTransition();

  function submit() {
    setSummary(null);
    startTransition(async () => {
      const res = await importWatchedHistory(text);
      setSummary(res);
    });
  }

  const lineCount = text.split(/\r?\n/).filter((l) => l.trim().length > 0).length;

  return (
    <div className="mt-5">
      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        rows={10}
        placeholder={
          'Prisoners (2013) - 9\nMare of Easttown 9\nWisting: 8\nThe Fall\nZodiac 8'
        }
        className="input min-h-[220px] w-full resize-y font-mono text-sm leading-relaxed"
        aria-label="Paste your watched titles, one per line"
      />

      <div className="mt-3 flex items-center justify-between gap-3">
        <span className="text-xs text-slate-500">
          {lineCount > 0 ? `${lineCount} ${lineCount === 1 ? 'title' : 'titles'}` : 'One title per line · rating out of 10 is optional'}
        </span>
        <button
          type="button"
          onClick={submit}
          disabled={pending || lineCount === 0}
          className="btn-primary"
        >
          {pending ? 'Importing…' : 'Import titles'}
        </button>
      </div>

      {summary && !summary.ok && summary.error && (
        <p className="mt-4 rounded-xl border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-200">
          {summary.error}
        </p>
      )}

      {summary && summary.ok && (
        <div className="mt-6">
          <div className="flex flex-wrap items-center gap-3">
            <p className="text-sm font-semibold text-white">
              Added {summary.imported} to your watched list
              {summary.unmatched > 0 ? ` · ${summary.unmatched} need a look` : ''}
            </p>
            <Link href="/app/watchlist" className="btn-secondary text-sm">
              View watchlist →
            </Link>
          </div>

          <ul className="mt-4 divide-y divide-white/5 rounded-2xl border border-white/10 bg-white/[0.02]">
            {summary.rows.map((r, i) => (
              <li key={i} className="flex items-center justify-between gap-3 px-4 py-2.5 text-sm">
                <span className="min-w-0 truncate text-slate-200">
                  {r.title ?? r.raw}
                  {r.year ? <span className="text-slate-500"> ({r.year})</span> : null}
                  {r.rating ? <span className="ml-2 text-slate-400">★ {r.rating}/10</span> : null}
                </span>
                <span className={`flex-shrink-0 text-xs ${STATUS_STYLE[r.status]}`}>
                  {STATUS_LABEL[r.status]}
                </span>
              </li>
            ))}
          </ul>

          {summary.unmatched > 0 && (
            <p className="mt-3 text-xs text-slate-500">
              For titles we couldn&apos;t match, try adding the year in parentheses (e.g.
              {' '}
              <span className="text-slate-400">Wisting (2019)</span>) and import again, or search for
              them manually from Discover.
            </p>
          )}
        </div>
      )}
    </div>
  );
}
