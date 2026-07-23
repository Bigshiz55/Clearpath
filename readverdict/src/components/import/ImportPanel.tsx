'use client';

import { useState } from 'react';
import { parseImport, detectDuplicates, type ImportKind, type ImportResult } from '@/lib/import';
import { useStore } from '@/lib/store/StoreProvider';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { SegmentedControl } from '@/components/ui/SegmentedControl';
import type { BookRef } from '@/lib/store/types';

const KINDS: { value: ImportKind; label: string; kind: 'file' | 'text' }[] = [
  { value: 'goodreads_csv', label: 'Goodreads CSV', kind: 'file' },
  { value: 'storygraph_csv', label: 'StoryGraph CSV', kind: 'file' },
  { value: 'title_list', label: 'Title list', kind: 'text' },
  { value: 'isbn_list', label: 'ISBN list', kind: 'text' },
];

export function ImportPanel() {
  const store = useStore();
  const [kind, setKind] = useState<ImportKind>('title_list');
  const [text, setText] = useState('');
  const [result, setResult] = useState<ImportResult | null>(null);
  const [committed, setCommitted] = useState<number | null>(null);
  const current = KINDS.find((k) => k.value === kind)!;

  const run = (raw: string) => {
    const r = parseImport(kind, raw);
    setResult(r);
    setCommitted(null);
    store.track('import_previewed', { kind, parsed: r.summary.parsed, skipped: r.summary.skipped });
  };

  const onFile = async (file: File | undefined) => {
    if (!file) return;
    const raw = await file.text();
    run(raw);
  };

  const commit = () => {
    if (!result) return;
    const dupes = new Set(detectDuplicates(result.books).flat());
    let added = 0;
    result.books.forEach((b, i) => {
      // Skip clear duplicate rows (keep the first of each cluster).
      if (dupes.has(b.rowIndex) && i !== result.books.findIndex((x) => x.rowIndex === b.rowIndex)) return;
      const ref: BookRef = {
        workId: b.isbn13 ? `isbn:${b.isbn13}` : `t:${b.title.toLowerCase()}:${(b.authors[0] ?? '').toLowerCase()}`,
        title: b.title || `(ISBN ${b.isbn13})`,
        author: b.authors[0] ?? null,
        year: null,
        coverUrl: null,
        isbn13: b.isbn13,
        subjects: [],
        pageCount: b.pageCount,
        rating: null,
        source: b.source,
      };
      store.addToLibrary(ref, b.status, `import:${b.source}`);
      added++;
    });
    setCommitted(added);
    store.track('import_committed', { kind, added });
  };

  return (
    <Card padding="lg">
      <SegmentedControl
        ariaLabel="Import type"
        value={kind}
        onChange={(v) => {
          setKind(v);
          setResult(null);
        }}
        options={KINDS.map((k) => ({ value: k.value, label: k.label }))}
      />

      <div className="mt-4">
        {current.kind === 'file' ? (
          <label className="block">
            <span className="mb-1.5 block text-sm text-ivory-200">Upload your exported {current.label}</span>
            <input
              type="file"
              accept=".csv,text/csv"
              onChange={(e) => onFile(e.target.files?.[0])}
              className="block w-full text-sm text-ivory-300 file:mr-3 file:rounded-lg file:border-0 file:bg-copper-500 file:px-3 file:py-2 file:text-sm file:font-semibold file:text-ink-950 hover:file:bg-copper-400"
            />
          </label>
        ) : (
          <div>
            <label htmlFor="import-text" className="mb-1.5 block text-sm text-ivory-200">
              {kind === 'isbn_list' ? 'Paste ISBNs (any separators)' : 'Paste titles, one per line ("Title by Author" works)'}
            </label>
            <textarea
              id="import-text"
              rows={5}
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder={kind === 'isbn_list' ? '9781250301697, 9780307588371' : 'The Silent Patient by Alex Michaelides\nGone Girl'}
              className="w-full rounded-xl border border-ink-600 bg-ink-850 px-4 py-3 text-ivory-100 focus:border-copper-500 focus:outline-none"
            />
            <Button size="sm" className="mt-2" onClick={() => run(text)} disabled={!text.trim()}>
              Preview import
            </Button>
          </div>
        )}
      </div>

      {result && (
        <div className="mt-5 rounded-xl border border-ink-700 bg-ink-900/60 p-4">
          <p className="text-sm text-ivory-200">
            Parsed <strong className="text-ivory-50">{result.summary.parsed}</strong> ·{' '}
            {result.summary.skipped} skipped · {result.summary.withIsbn} with ISBN ·{' '}
            {detectDuplicates(result.books).length} duplicate group(s)
          </p>
          {result.skipped.length > 0 && (
            <p className="mt-1 text-xs text-oxblood-400">
              {result.skipped.length} row(s) couldn’t be parsed and were skipped.
            </p>
          )}
          <ul className="mt-3 max-h-48 space-y-1 overflow-auto text-sm text-ivory-300">
            {result.books.slice(0, 30).map((b, i) => (
              <li key={i} className="truncate">
                {b.title || `(ISBN ${b.isbn13})`}
                {b.authors[0] && <span className="text-ivory-400"> — {b.authors[0]}</span>}
                <span className="ml-2 text-xs text-copper-300">{b.status}</span>
              </li>
            ))}
          </ul>
          {committed == null ? (
            <Button size="sm" className="mt-3" onClick={commit}>Add {result.summary.parsed} to My Books</Button>
          ) : (
            <p className="mt-3 text-sm text-verdict-must">Added {committed} books to My Books.</p>
          )}
        </div>
      )}
    </Card>
  );
}
