'use client';

import { useRef, useState } from 'react';
import Link from 'next/link';
import { quickAddByText } from '@/lib/actions/watchlist';

type State = 'idle' | 'reading' | 'adding' | 'done' | 'error';

export function PhotoAdd() {
  const [state, setState] = useState<State>('idle');
  const [progress, setProgress] = useState(0);
  const [message, setMessage] = useState('');
  const [preview, setPreview] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setPreview(URL.createObjectURL(file));
    setState('reading');
    setProgress(0);
    setMessage('');
    try {
      const Tesseract = (await import('tesseract.js')).default;
      const { data } = await Tesseract.recognize(file, 'eng', {
        logger: (m: { status: string; progress: number }) => {
          if (m.status === 'recognizing text') setProgress(Math.round(m.progress * 100));
        },
      });
      const text = (data.text || '').trim();
      if (!text) {
        setState('error');
        setMessage('Couldn’t read any text. Try a shot where the title is visible (a pause/info screen works great).');
        return;
      }
      setState('adding');
      const res = await quickAddByText(text);
      if (res.ok) {
        setState('done');
        setMessage(res.added ?? 'Added to your list.');
      } else {
        setState('error');
        setMessage(res.error ?? 'Couldn’t find a matching title.');
      }
    } catch {
      setState('error');
      setMessage('Something went wrong reading the image.');
    } finally {
      if (inputRef.current) inputRef.current.value = '';
    }
  }

  function reset() {
    setState('idle');
    setPreview(null);
    setMessage('');
    setProgress(0);
  }

  return (
    <div className="card p-5">
      <div className="text-sm font-semibold text-white">📸 Add from a photo</div>
      <p className="mt-1 text-xs text-slate-400">
        Snap or screenshot what’s on the TV — I’ll read the title and drop it on your watchlist. No setup.
      </p>

      <input ref={inputRef} type="file" accept="image/*" onChange={onFile} className="hidden" />

      {(state === 'idle' || state === 'error') && (
        <button onClick={() => inputRef.current?.click()} className="btn-primary mt-4 w-full py-3">
          Choose or take a photo
        </button>
      )}

      {(state === 'reading' || state === 'adding') && (
        <div className="mt-4">
          <div className="flex items-center justify-between text-xs text-slate-400">
            <span>{state === 'reading' ? 'Reading the title…' : 'Finding the match…'}</span>
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
        <p className="mt-3 text-sm text-amber-300">{message}</p>
      )}
    </div>
  );
}
