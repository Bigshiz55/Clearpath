'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { SaveButton } from './SaveButton';
import { verdictVisualForCall } from '@/lib/verdictVisual';
import { providerWatchUrl } from '@/lib/watchLinks';
import type { EasyAudience, EasyPick } from '@/lib/easyPicks';

const AUDIENCES: { v: EasyAudience; label: string; emoji: string }[] = [
  { v: 'me', label: 'Just me', emoji: '🙂' },
  { v: 'partner', label: 'My partner & me', emoji: '💞' },
  { v: 'family', label: 'The whole family', emoji: '👨‍👩‍👧' },
];

/** Plain, non-jargon wording for the call. */
function callWords(call: string): string {
  const c = call.toUpperCase();
  if (c.includes('WATCH') || c.includes('MUST')) return 'Watch it';
  if (c.includes('SKIP')) return 'Skip it';
  return 'Maybe';
}

export function EasyMode({ initialPicks, name }: { initialPicks: EasyPick[]; name: string | null }) {
  const router = useRouter();
  const [audience, setAudience] = useState<EasyAudience>('me');
  const [picks, setPicks] = useState<EasyPick[]>(initialPicks);
  const [loading, setLoading] = useState(false);
  const [firstRender, setFirstRender] = useState(true);

  // Easy Mode is always big & high-contrast, regardless of the global toggle.
  useEffect(() => {
    document.documentElement.setAttribute('data-simple', '1');
  }, []);

  useEffect(() => {
    if (firstRender) {
      setFirstRender(false);
      return;
    }
    let active = true;
    setLoading(true);
    fetch('/api/easy', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ audience }),
    })
      .then((r) => r.json())
      .then((d) => active && setPicks((d.picks ?? []) as EasyPick[]))
      .catch(() => active && setPicks([]))
      .finally(() => active && setLoading(false));
    return () => {
      active = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [audience]);

  function useFullApp() {
    document.documentElement.removeAttribute('data-simple');
    try {
      localStorage.removeItem('wv_simple');
    } catch {
      /* ignore */
    }
    router.push('/app');
  }

  return (
    <div className="mx-auto max-w-3xl space-y-8 px-1 pb-16">
      {/* Greeting */}
      <div className="pt-2 text-center">
        <h1 className="text-3xl font-black text-white sm:text-4xl">
          {name ? `Hello, ${name}.` : 'Hello.'}
        </h1>
        <p className="mt-2 text-xl text-slate-200">Let’s find something good to watch tonight.</p>
      </div>

      {/* Who's watching */}
      <div>
        <div className="mb-3 text-center text-lg font-semibold text-slate-200">Who’s watching?</div>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          {AUDIENCES.map((a) => (
            <button
              key={a.v}
              onClick={() => setAudience(a.v)}
              className={`rounded-2xl border-2 px-4 py-5 text-center text-xl font-bold transition ${
                audience === a.v ? 'border-brand-400 bg-brand-500/25 text-white' : 'border-white/15 bg-white/5 text-slate-200 hover:bg-white/10'
              }`}
            >
              <span className="mb-1 block text-3xl" aria-hidden>{a.emoji}</span>
              {a.label}
            </button>
          ))}
        </div>
      </div>

      {/* The three picks */}
      <div>
        <div className="mb-3 text-center text-2xl font-black text-white">Tonight’s 3 picks for you</div>
        {loading ? (
          <div className="space-y-4">
            {[0, 1, 2].map((i) => <div key={i} className="h-40 animate-pulse rounded-2xl bg-white/5" />)}
          </div>
        ) : picks.length === 0 ? (
          <div className="rounded-2xl border-2 border-white/15 bg-white/5 p-6 text-center">
            <p className="text-xl text-slate-200">We couldn’t find three right now.</p>
            <p className="mt-1 text-lg text-slate-400">Tell us a few movies you love and we’ll learn your taste.</p>
            <Link href="/app/onboarding" className="btn-primary mt-4 inline-flex px-6 py-3 text-lg">Tell us your taste</Link>
          </div>
        ) : (
          <div className="space-y-4">
            {picks.map((p) => {
              const v = verdictVisualForCall(p.primaryCall);
              const watch = providerWatchUrl(p.where, p.title, p.year);
              return (
                <div key={`${p.mediaType}-${p.id}`} className="overflow-hidden rounded-2xl border-2 border-white/15 bg-white/[0.04]">
                  <div className="flex flex-col gap-4 p-4 sm:flex-row">
                    <Link href={`/app/title/${p.mediaType}/${p.id}`} className="mx-auto w-40 flex-none overflow-hidden rounded-xl border border-white/10 sm:mx-0">
                      {p.posterUrl ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={p.posterUrl} alt="" className="h-full w-full object-cover" />
                      ) : (
                        <div className="grid aspect-[2/3] place-items-center bg-ink-800 p-3 text-center text-lg text-slate-400">{p.title}</div>
                      )}
                    </Link>
                    <div className="min-w-0 flex-1">
                      <div className="text-2xl font-black leading-tight text-white">
                        {p.title} {p.year ? <span className="font-semibold text-slate-400">({p.year})</span> : null}
                      </div>
                      <div className="mt-2 flex flex-wrap items-center gap-2">
                        <span className={`rounded-full border-2 px-4 py-1 text-xl font-black ${v.solid}`}>{callWords(p.primaryCall)}</span>
                        <span className="text-lg text-slate-300">for {audience === 'family' ? 'the family' : audience === 'partner' ? 'you both' : 'you'}</span>
                      </div>
                      <p className="mt-3 text-lg leading-relaxed text-slate-100">{p.reason}</p>
                      {p.where && <p className="mt-2 text-lg font-semibold text-emerald-300">▶ On {p.where}</p>}

                      <div className="mt-4 flex flex-wrap gap-3">
                        <a href={watch.url} target="_blank" rel="noopener noreferrer" className="btn-primary px-6 py-3 text-lg">
                          {watch.label} →
                        </a>
                        <Link href={`/app/title/${p.mediaType}/${p.id}`} className="rounded-xl border-2 border-white/20 bg-white/5 px-5 py-3 text-lg font-semibold text-slate-100 hover:bg-white/10">
                          More about it
                        </Link>
                        <SaveButton tmdbId={p.id} mediaType={p.mediaType} title={p.title} year={p.year} posterPath={null} variant="inline" />
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Ask for something else — big, friendly, voice-capable */}
      <div className="rounded-2xl border-2 border-white/15 bg-white/5 p-5 text-center">
        <div className="text-xl font-semibold text-white">Want something different?</div>
        <p className="mt-1 text-lg text-slate-300">Tell us in your own words — type or talk.</p>
        <Link href="/app/ask" className="btn-secondary mt-3 inline-flex px-6 py-3 text-lg">🎙️ Ask for a movie</Link>
      </div>

      {/* Back to the full app */}
      <div className="text-center">
        <button onClick={useFullApp} className="text-lg font-semibold text-slate-400 underline hover:text-white">
          Switch to the full app
        </button>
      </div>
    </div>
  );
}
