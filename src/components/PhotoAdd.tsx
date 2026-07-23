'use client';

import { useRef, useState } from 'react';
import Link from 'next/link';
import { photoMatches, addToWatchlist, type PhotoMatch } from '@/lib/actions/watchlist';
import { tmdbImage } from '@/lib/tmdb/image';
import { useI18n } from '@/i18n/I18nProvider';

type State = 'idle' | 'reading' | 'matching' | 'pick' | 'done' | 'error';

export function PhotoAdd() {
  const { t, plural } = useI18n();
  const [state, setState] = useState<State>('idle');
  const [progress, setProgress] = useState(0);
  const [message, setMessage] = useState('');
  const [preview, setPreview] = useState<string | null>(null);
  const [matches, setMatches] = useState<PhotoMatch[]>([]);
  const [added, setAdded] = useState<string[]>([]);
  const [ocrText, setOcrText] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setPreview(URL.createObjectURL(file));
    setState('reading');
    setProgress(0);
    setMessage('');
    setMatches([]);
    setAdded([]);
    setOcrText('');
    try {
      const Tesseract = (await import('tesseract.js')).default;
      const { data } = await Tesseract.recognize(file, 'eng', {
        logger: (m: { status: string; progress: number }) => {
          if (m.status === 'recognizing text') setProgress(Math.round(m.progress * 100));
        },
      });
      const text = (data.text || '').trim();
      setOcrText(text);
      if (!text) {
        setState('error');
        setMessage(t('misc.photo.noText'));
        return;
      }
      setState('matching');
      const res = await photoMatches(text);
      if (res.ok && res.matches && res.matches.length > 0) {
        setMatches(res.matches);
        setState('pick');
      } else {
        setState('error');
        setMessage(res.error ?? t('misc.photo.noMatch'));
      }
    } catch {
      setState('error');
      setMessage(t('misc.photo.readError'));
    } finally {
      if (inputRef.current) inputRef.current.value = '';
    }
  }

  async function pick(m: PhotoMatch) {
    const label = `${m.title}${m.year ? ` (${m.year})` : ''}`;
    if (added.includes(label)) return;
    const res = await addToWatchlist({
      tmdbId: m.tmdbId,
      mediaType: m.mediaType,
      title: m.title,
      year: m.year,
      posterPath: m.posterPath,
      status: 'possible',
    });
    if (res.ok) {
      setAdded((a) => [...a, label]);
    } else {
      setMessage(res.error ?? t('misc.photo.addError'));
    }
  }

  function reset() {
    setState('idle');
    setPreview(null);
    setMessage('');
    setProgress(0);
    setMatches([]);
    setAdded([]);
    setOcrText('');
  }

  return (
    <div className="card p-5">
      <div className="text-sm font-semibold text-white">{t('misc.photo.title')}</div>
      <p className="mt-1 text-xs text-slate-400">
        {t('misc.photo.subtitle')}
      </p>

      <input ref={inputRef} type="file" accept="image/*" onChange={onFile} className="hidden" />

      {(state === 'idle' || state === 'error') && (
        <button onClick={() => inputRef.current?.click()} className="btn-primary mt-4 w-full py-3">
          {t('misc.photo.choosePhoto')}
        </button>
      )}

      {(state === 'reading' || state === 'matching') && (
        <div className="mt-4">
          <div className="flex items-center justify-between text-xs text-slate-400">
            <span>{state === 'reading' ? t('misc.photo.readingTitles') : t('misc.photo.findingMatches')}</span>
            {state === 'reading' && <span>{progress}%</span>}
          </div>
          <div className="mt-1 h-2 w-full overflow-hidden rounded-full bg-white/10">
            <div
              className="h-full rounded-full bg-brand-400 transition-all"
              style={{ width: state === 'reading' ? `${progress}%` : '100%' }}
            />
          </div>
        </div>
      )}

      {preview && state !== 'idle' && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={preview} alt="" className="mt-3 max-h-40 rounded-lg border border-white/10 object-contain" />
      )}

      {state === 'pick' && (
        <div className="mt-4">
          <div className="text-xs font-semibold text-slate-300">
            {plural('misc.photo.found', matches.length)}
          </div>
          <div className="mt-2 space-y-2">
            {matches.map((m) => {
              const label = `${m.title}${m.year ? ` (${m.year})` : ''}`;
              const isAdded = added.includes(label);
              const poster = tmdbImage(m.posterPath, 'w92');
              return (
                <button
                  key={`${m.mediaType}-${m.tmdbId}`}
                  onClick={() => pick(m)}
                  disabled={isAdded}
                  className={`flex w-full items-center gap-3 rounded-xl border p-2 text-left transition ${
                    isAdded
                      ? 'border-emerald-400/40 bg-emerald-500/10'
                      : 'border-white/10 bg-white/5 hover:bg-white/10'
                  }`}
                >
                  {poster ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={poster} alt="" className="h-14 w-10 flex-none rounded object-cover" />
                  ) : (
                    <div className="flex h-14 w-10 flex-none items-center justify-center rounded bg-white/10 text-xs text-slate-500">
                      {m.mediaType === 'tv' ? 'TV' : '🎬'}
                    </div>
                  )}
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-semibold text-white">{m.title}</div>
                    <div className="text-xs text-slate-400">
                      {m.mediaType === 'tv' ? t('misc.photo.tvSeries') : t('misc.photo.movie')}
                      {m.year ? ` · ${m.year}` : ''}
                    </div>
                  </div>
                  <span className={`flex-none text-sm font-semibold ${isAdded ? 'text-emerald-300' : 'text-brand-300'}`}>
                    {isAdded ? t('misc.photo.added') : t('misc.photo.add')}
                  </span>
                </button>
              );
            })}
          </div>
          {message && <p className="mt-2 text-sm text-amber-300">{message}</p>}
          <div className="mt-3 flex gap-2">
            <Link href="/app/watchlist" className="btn-secondary text-sm">{t('misc.photo.viewWatchlist')}</Link>
            <button onClick={reset} className="btn-ghost text-sm">{t('misc.photo.addAnotherPhoto')}</button>
          </div>
        </div>
      )}

      {state === 'done' && (
        <div className="mt-3">
          <p className="text-sm font-semibold text-emerald-200">✅ {t('misc.photo.addedColon')} {message}</p>
          <div className="mt-2 flex gap-2">
            <Link href="/app/watchlist" className="btn-secondary text-sm">{t('misc.photo.viewWatchlist')}</Link>
            <button onClick={reset} className="btn-ghost text-sm">{t('misc.photo.addAnother')}</button>
          </div>
        </div>
      )}

      {state === 'error' && message && (
        <div className="mt-3">
          <p className="text-sm text-amber-300">{message}</p>
          {ocrText && (
            <details className="mt-2">
              <summary className="cursor-pointer text-xs text-slate-500">{t('misc.photo.whatIRead')}</summary>
              <pre className="mt-1 max-h-32 overflow-auto whitespace-pre-wrap rounded-lg bg-black/30 p-2 text-xs text-slate-400">
                {ocrText}
              </pre>
            </details>
          )}
        </div>
      )}
    </div>
  );
}
