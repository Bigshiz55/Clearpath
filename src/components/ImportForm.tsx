'use client';

import { useRef, useState } from 'react';
import Link from 'next/link';
import { importParsedTitles, type ImportRowResult } from '@/lib/actions/import';
import { parseImportText, type ParsedTitle } from '@/lib/importParse';
import { useI18n } from '@/i18n/I18nProvider';

const BATCH = 20;
const MAX_TITLES = 800;

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
  const { t, plural } = useI18n();
  const [text, setText] = useState('');
  const [fileName, setFileName] = useState<string | null>(null);
  const [running, setRunning] = useState(false);
  const [done, setDone] = useState(0);
  const [total, setTotal] = useState(0);
  const [imported, setImported] = useState(0);
  const [rows, setRows] = useState<ImportRowResult[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [finished, setFinished] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setFileName(file.name);
    const reader = new FileReader();
    reader.onload = () => setText(String(reader.result ?? ''));
    reader.readAsText(file);
  }

  async function run() {
    setError(null);
    setFinished(false);
    setRows([]);
    setImported(0);
    setDone(0);

    let titles: ParsedTitle[] = parseImportText(text);
    if (titles.length === 0) {
      setError(t('misc.import.noTitles'));
      return;
    }
    if (titles.length > MAX_TITLES) titles = titles.slice(0, MAX_TITLES);
    setTotal(titles.length);
    setRunning(true);

    const allRows: ImportRowResult[] = [];
    let imp = 0;
    try {
      for (let i = 0; i < titles.length; i += BATCH) {
        const batch = titles.slice(i, i + BATCH);
        const res = await importParsedTitles(batch);
        if (res.ok) {
          imp += res.imported;
          allRows.push(...res.rows);
        } else if (res.error) {
          setError(res.error);
          break;
        }
        setDone(Math.min(i + BATCH, titles.length));
        setImported(imp);
        setRows([...allRows]);
      }
    } finally {
      setRunning(false);
      setFinished(true);
    }
  }

  const previewCount = text.trim() ? parseImportText(text).length : 0;
  const pct = total > 0 ? Math.round((done / total) * 100) : 0;
  const unmatchedRows = rows.filter((r) => r.status === 'unmatched');

  return (
    <div className="mt-5">
      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={() => fileRef.current?.click()}
          className="btn-secondary"
          disabled={running}
        >
          {t('misc.import.chooseCsv')}
        </button>
        <input
          ref={fileRef}
          type="file"
          accept=".csv,.txt,text/csv,text/plain"
          onChange={onFile}
          className="hidden"
        />
        {fileName && <span className="text-xs text-slate-400">{fileName}</span>}
      </div>

      <div className="mt-3">
        <p className="mb-1 text-xs text-slate-500">{t('misc.import.orPaste')}</p>
        <textarea
          value={text}
          onChange={(e) => {
            setText(e.target.value);
            setFileName(null);
          }}
          rows={8}
          placeholder={'Prisoners (2013) - 9\nMare of Easttown 9\nZodiac 8'}
          className="input min-h-[160px] w-full resize-y font-mono text-sm leading-relaxed"
          aria-label={t('misc.import.pasteAria')}
        />
      </div>

      <div className="mt-3 flex items-center justify-between gap-3">
        <span className="text-xs text-slate-500">
          {previewCount > 0
            ? plural('misc.import.ready', previewCount)
            : t('misc.import.anyCsv')}
        </span>
        <button
          type="button"
          onClick={run}
          disabled={running || previewCount === 0}
          className="btn-primary"
        >
          {running ? t('misc.import.importing') : t('misc.import.importHistory')}
        </button>
      </div>

      {(running || finished) && total > 0 && (
        <div className="mt-4">
          <div className="flex items-center justify-between text-xs text-slate-400">
            <span>
              {t('misc.import.progress', { done, total, imported })}
            </span>
            <span>{pct}%</span>
          </div>
          <div className="mt-1 h-2 w-full overflow-hidden rounded-full bg-white/10">
            <div
              className="h-full rounded-full bg-brand-400 transition-all"
              style={{ width: `${pct}%` }}
            />
          </div>
        </div>
      )}

      {error && (
        <p className="mt-4 rounded-xl border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-200">
          {error}
        </p>
      )}

      {finished && !error && (
        <div className="mt-5 flex flex-wrap items-center gap-3">
          <p className="text-sm font-semibold text-white">
            {unmatchedRows.length > 0
              ? t('misc.import.doneBoth', { added: imported, unmatched: unmatchedRows.length })
              : t('misc.import.doneSimple', { added: imported })}
          </p>
          <Link href="/app/watchlist" className="btn-secondary text-sm">
            {t('misc.import.viewWatchlist')}
          </Link>
          <Link href="/app" className="btn-secondary text-sm">
            {t('misc.import.seeRecs')}
          </Link>
        </div>
      )}

      {finished && unmatchedRows.length > 0 && (
        <div className="mt-4">
          <p className="mb-2 text-xs text-slate-500">{t('misc.import.couldntMatch')}</p>
          <ul className="flex flex-wrap gap-2">
            {unmatchedRows.slice(0, 40).map((r, i) => (
              <li key={i} className="rounded-full border border-white/10 bg-white/5 px-2.5 py-1 text-xs text-slate-300">
                {r.title}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
