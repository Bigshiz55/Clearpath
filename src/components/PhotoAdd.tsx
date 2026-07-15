'use client';

import { useRef, useState } from 'react';
import Link from 'next/link';
import { photoMatches, addToWatchlist, type PhotoMatch } from '@/lib/actions/watchlist';
import { tmdbImage } from '@/lib/tmdb/image';

type State = 'idle' | 'reading' | 'matching' | 'pick' | 'done' | 'error';

export function PhotoAdd() {
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
        setMessage('Couldn’t read any text. Try a shot where the title is clearly visible (a pause or info screen works great).');
        return;
      }
      setState('matching');
      const res = await photoMatches(text);
      if (res.ok && res.matches && res.matches.length > 0) {
        setMatches(res.matches);
        setState('pick');
      } else {
        setState('error');
        setMessage(res.error ?? 'Couldn’t find a matching title in that photo.');
      }
    } catch {
      setState('error');
      setMessage('Something went wrong reading the image.');
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
      setMessage(res.error ?? 'Couldn’t add that one.');
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
      <div className="text-sm font-semibold text-white">📸 Add from a photo</div>
      <p className="mt-1 text-xs text-slate-400">
        Snap or screenshot what’s on the TV — I’ll read the titles and let you tap the ones to save. No setup.
      </p>

      <input ref={inputRef} type="file" accept="image/*" onChange={onFile} className="hidden" />

      {(state === 'idle' || state === 'error') && (
        <button onClick={() => inputRef.current?.click()} className="btn-primary mt-4 w-full py-3">
          Choose or take a photo
        </button>
      )}

      {(state === 'reading' || state === 'matching') && (
        <div className="mt-4">
          <div className="flex items-center justify-between text-xs text-slate-400">
            <span>{state === 'reading' ? 'Reading the titles…' : 'Finding matches…'}</span>
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
            Found {matches.length} possible {matches.length === 1 ? 'title' : 'titles'} — tap to add:
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
                      {m.mediaType === 'tv' ? 'TV series' : 'Movie'}
                      {m.year ? ` · ${m.year}` : ''}
                    </div>
                  </div>
                  <span className={`flex-none text-sm font-semibold ${isAdded ? 'text-emerald-300' : 'text-brand-300'}`}>
                    {isAdded ? '✓ Added' : '+ Add'}
                  </span>
                </button>
              );
            })}
          </div>
          {message && <p className="mt-2 text-sm text-amber-300">{message}</p>}
          <div className="mt-3 flex gap-2">
            <Link href="/app/watchlist" className="btn-secondary text-sm">View watchlist</Link>
            <button onClick={reset} className="btn-ghost text-sm">Add another photo</button>
          </div>
        </div>
      )}

      {state === 'done' && (
        <div className="mt-3">
          <p className="text-sm font-semibold text-emerald-200">✅ Added: {message}</p>
          <div className="mt-2 flex gap-2">
            <Link href="/app/watchlist" className="btn-secondary text-sm">View watchlist</Link>
            <button onClick={reset} className="btn-ghost text-sm">Add another</button>
          </div>
        </div>
      )}

      {state === 'error' && message && (
        <div className="mt-3">
          <p className="text-sm text-amber-300">{message}</p>
          {ocrText && (
            <details className="mt-2">
              <summary className="cursor-pointer text-xs text-slate-500">What I read from the photo</summary>
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
