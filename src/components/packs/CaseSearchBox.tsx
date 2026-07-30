'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Search } from 'lucide-react';

interface Result {
  slug: string;
  title: string;
  description: string | null;
  statusSummary: string | null;
}

/**
 * "Where have I seen this?" — search by whatever the user remembers
 * (a name, a city, a detail). Real search over stored Case/programme text,
 * not a fabricated semantic match.
 */
export function CaseSearchBox({ packSlug }: { packSlug: string }) {
  const [q, setQ] = useState('');
  const [results, setResults] = useState<Result[] | null>(null);
  const [busy, setBusy] = useState(false);

  async function run(e: React.FormEvent) {
    e.preventDefault();
    if (q.trim().length < 2) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/packs/case-search?q=${encodeURIComponent(q)}`);
      const body = (await res.json()) as { results?: Result[] };
      setResults(body.results ?? []);
    } catch {
      setResults([]);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
      <h2 className="text-lg font-bold text-white">Where have I seen this?</h2>
      <p className="mt-0.5 text-sm text-slate-400">Search by a name, a city, a year — anything you remember.</p>
      <form onSubmit={(e) => void run(e)} className="mt-3 flex gap-2">
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="e.g. a name, a city, a detail from the story"
          className="input flex-1"
        />
        <button type="submit" disabled={busy || q.trim().length < 2} className="btn-primary min-h-[44px] px-4 disabled:opacity-50">
          <Search size={16} aria-hidden />
        </button>
      </form>

      {results != null && (
        <div className="mt-3 space-y-2">
          {results.length === 0 ? (
            <p className="text-sm text-slate-400">No cases match that yet.</p>
          ) : (
            results.map((r) => (
              <Link
                key={r.slug}
                href={`/packs/${packSlug}/cases/${r.slug}`}
                className="block rounded-lg border border-white/10 bg-ink-850 p-3 transition hover:border-white/25"
              >
                <p className="text-sm font-semibold text-white">{r.title}</p>
                <p className="truncate text-[12px] text-slate-400">{r.statusSummary || r.description || 'Open for details'}</p>
              </Link>
            ))
          )}
        </div>
      )}
    </div>
  );
}
