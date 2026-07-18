'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { SaveButton } from './SaveButton';
import { EasyQuiz, type QuizResult } from './EasyQuiz';
import { TasteGame } from './TasteGame';
import { EasyOnTv } from './EasyOnTv';
import { CardRatings } from './CardRatings';
import { verdictVisualForCall } from '@/lib/verdictVisual';
import { providerWatchUrl } from '@/lib/watchLinks';
import { EASY_ERAS, EASY_CONTENT, type EasyAudience, type EasyEra, type EasyContent, type EasyPick } from '@/lib/easyTypes';

interface Favorite { id: number; name: string }
interface StoredPrefs {
  mediaType: 'any' | 'movie' | 'tv';
  maxRuntime: number | null;
  content: EasyContent;
  era: EasyEra;
  favorites: Favorite[];
  dismissed: string[];
  quizTaken: boolean;
}

const PREFS_KEY = 'wv_easy_prefs';
const DEFAULTS: StoredPrefs = { mediaType: 'any', maxRuntime: null, content: 'any', era: 'any', favorites: [], dismissed: [], quizTaken: false };

const ERA_LABELS: Record<EasyEra, string> = {
  any: 'Any era', y2020s: '2020s', y2000s: '2000s–10s', y80s90s: '80s & 90s', y60s70s: '60s & 70s', ypre60: 'Pre-1960',
};
const CONTENT_LABELS: Record<EasyContent, string> = {
  any: 'Anything', mild: 'Nothing scary', clean: 'Keep it clean', family: 'Family only',
};

/** Old saved prefs used era:'recent'|'classic' and familySafe; migrate them. */
function normalizePrefs(raw: Record<string, unknown>): StoredPrefs {
  const era = EASY_ERAS.includes(raw.era as EasyEra) ? (raw.era as EasyEra) : 'any';
  const content = EASY_CONTENT.includes(raw.content as EasyContent)
    ? (raw.content as EasyContent)
    : raw.familySafe === true
      ? 'family'
      : 'any';
  return { ...DEFAULTS, ...raw, era, content } as StoredPrefs;
}

const AUDIENCES: { v: EasyAudience; label: string; emoji: string }[] = [
  { v: 'me', label: 'Just me', emoji: '🙂' },
  { v: 'partner', label: 'My partner & me', emoji: '💞' },
  { v: 'family', label: 'The whole family', emoji: '👨‍👩‍👧' },
];

function callWords(call: string): string {
  const c = call.toUpperCase();
  if (c.includes('WATCH') || c.includes('MUST')) return 'Watch it';
  if (c.includes('SKIP')) return 'Skip it';
  return 'Maybe';
}

function BigChoice<T extends string | number | null>({ value, onChange, options, disabledValues }: { value: T; onChange: (v: T) => void; options: { v: T; label: string }[]; disabledValues?: T[] }) {
  return (
    <div className="flex flex-wrap gap-2">
      {options.map((o) => {
        const disabled = disabledValues?.includes(o.v) ?? false;
        return (
          <button
            key={String(o.v)}
            onClick={() => !disabled && onChange(o.v)}
            disabled={disabled}
            title={disabled ? 'Movies are almost never this short' : undefined}
            className={`rounded-xl border-2 px-4 py-2.5 text-base font-bold transition ${disabled ? 'cursor-not-allowed border-white/10 bg-white/[0.02] text-slate-600' : value === o.v ? 'border-brand-400 bg-brand-500/25 text-white' : 'border-white/15 bg-white/5 text-slate-200 hover:bg-white/10'}`}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

export function EasyMode({ initialPicks, name, build = 'dev' }: { initialPicks: EasyPick[]; name: string | null; build?: string }) {
  const router = useRouter();
  const [audience, setAudience] = useState<EasyAudience>('me');
  const [prefs, setPrefs] = useState<StoredPrefs>(DEFAULTS);
  const [picks, setPicks] = useState<EasyPick[]>(initialPicks);
  const [loading, setLoading] = useState(false);
  const [customize, setCustomize] = useState(false);
  const [sessionSkips, setSessionSkips] = useState<string[]>([]);
  const [mood, setMood] = useState<number[]>([]);
  const [quizOpen, setQuizOpen] = useState(false);
  const [gameOpen, setGameOpen] = useState(false);
  const [ratedNonce, setRatedNonce] = useState(0);
  const [view, setView] = useState<'picks' | 'tv'>('picks');
  const loaded = useRef(false);

  // Actor search
  const [actorQuery, setActorQuery] = useState('');
  const [actorHits, setActorHits] = useState<{ id: number; name: string; knownFor: string; profileUrl: string | null }[]>([]);

  useEffect(() => {
    document.documentElement.setAttribute('data-simple', '1');
    let taken = false;
    try {
      const raw = localStorage.getItem(PREFS_KEY);
      if (raw) {
        const p = normalizePrefs(JSON.parse(raw));
        setPrefs(p);
        taken = p.quizTaken;
      }
    } catch {
      /* ignore */
    }
    if (!taken) setQuizOpen(true); // first visit → offer the quick quiz
    loaded.current = true;
  }, []);

  // The quiz and The Docket are full-screen overlays with their own big touch
  // targets — the extra 1.25x "simple" scaling on top makes them overflow the
  // screen. Turn it off while an overlay is open; restore it after.
  useEffect(() => {
    const overlay = quizOpen || gameOpen;
    if (overlay) document.documentElement.removeAttribute('data-simple');
    else document.documentElement.setAttribute('data-simple', '1');
  }, [quizOpen, gameOpen]);

  const savePrefs = useCallback((next: StoredPrefs) => {
    setPrefs(next);
    try {
      localStorage.setItem(PREFS_KEY, JSON.stringify(next));
    } catch {
      /* ignore */
    }
  }, []);

  const reqKey = `${audience}|${prefs.mediaType}|${prefs.maxRuntime}|${prefs.content}|${prefs.era}|${prefs.favorites.map((f) => f.id).join(',')}|${mood.join(',')}|${prefs.dismissed.join(',')}|${sessionSkips.join(',')}|${quizOpen}|${gameOpen}|${ratedNonce}`;

  useEffect(() => {
    if (!loaded.current || quizOpen || gameOpen) return; // don't fetch while a full-screen flow is up
    let active = true;
    setLoading(true);
    fetch('/api/easy', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        audience,
        mediaType: prefs.mediaType,
        maxRuntime: prefs.maxRuntime,
        content: prefs.content,
        era: prefs.era,
        actorIds: prefs.favorites.map((f) => f.id),
        moodGenres: mood,
        excludeKeys: [...prefs.dismissed, ...sessionSkips],
      }),
    })
      .then((r) => r.json())
      .then((d) => active && setPicks((d.picks ?? []) as EasyPick[]))
      .catch(() => active && setPicks([]))
      .finally(() => active && setLoading(false));
    return () => {
      active = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reqKey]);

  // Actor search (debounced-ish by length).
  useEffect(() => {
    const q = actorQuery.trim();
    if (q.length < 2) {
      setActorHits([]);
      return;
    }
    let active = true;
    const t = setTimeout(() => {
      fetch(`/api/person-search?q=${encodeURIComponent(q)}`)
        .then((r) => r.json())
        .then((d) => active && setActorHits(d.people ?? []))
        .catch(() => active && setActorHits([]));
    }, 250);
    return () => {
      active = false;
      clearTimeout(t);
    };
  }, [actorQuery]);

  function addFavorite(f: Favorite) {
    if (prefs.favorites.some((x) => x.id === f.id)) return;
    savePrefs({ ...prefs, favorites: [...prefs.favorites, f].slice(0, 8) });
    setActorQuery('');
    setActorHits([]);
  }
  function removeFavorite(id: number) {
    savePrefs({ ...prefs, favorites: prefs.favorites.filter((f) => f.id !== id) });
  }
  function dismiss(key: string) {
    savePrefs({ ...prefs, dismissed: [...new Set([...prefs.dismissed, key])].slice(-200) });
  }
  function showDifferent() {
    setSessionSkips((s) => [...new Set([...s, ...picks.map((p) => `${p.mediaType}-${p.id}`)])]);
  }
  function finishQuiz(r: QuizResult) {
    setAudience(r.audience);
    setMood(r.moodGenres);
    savePrefs({ ...prefs, mediaType: r.mediaType, era: r.era, content: r.content, maxRuntime: r.maxRuntime, quizTaken: true });
    setQuizOpen(false);
  }
  function skipQuiz() {
    savePrefs({ ...prefs, quizTaken: true });
    setQuizOpen(false);
  }
  function useFullApp() {
    document.documentElement.removeAttribute('data-simple');
    try {
      localStorage.removeItem('wv_simple');
    } catch {
      /* ignore */
    }
    router.push('/app');
  }

  if (quizOpen) {
    return <EasyQuiz onDone={finishQuiz} onCancel={skipQuiz} />;
  }
  if (gameOpen) {
    return (
      <TasteGame
        build={build}
        onDone={(n) => {
          setGameOpen(false);
          if (n > 0) setRatedNonce((k) => k + 1); // ruled on cases → resharpen picks
        }}
      />
    );
  }

  return (
    <div className="mx-auto max-w-3xl space-y-8 px-1 pb-16">
      <div className="pt-2 text-center">
        <h1 className="text-3xl font-black text-white sm:text-4xl">{name ? `Hello, ${name}.` : 'Hello.'}</h1>
        <p className="mt-2 text-xl text-slate-200">Let’s find something good to watch tonight.</p>
        <div className="mt-4 flex flex-wrap justify-center gap-3">
          <button onClick={() => setQuizOpen(true)} className="inline-flex rounded-xl border-2 border-brand-400/50 bg-brand-500/15 px-5 py-3 text-lg font-bold text-brand-100 transition hover:bg-brand-500/25">
            📝 Take the 1-minute quiz
          </button>
          <button onClick={() => setGameOpen(true)} className="inline-flex rounded-xl border-2 border-gold-400/50 bg-gold-500/10 px-5 py-3 text-lg font-bold text-amber-100 transition hover:bg-gold-500/20">
            ⚖️ Rate titles in The Docket
          </button>
        </div>
      </div>

      {/* Pick a source: personalized picks, or what's coming up on live TV */}
      <div className="grid grid-cols-2 gap-3">
        <button onClick={() => setView('picks')} className={`rounded-2xl border-2 px-4 py-4 text-lg font-bold transition ${view === 'picks' ? 'border-brand-400 bg-brand-500/25 text-white' : 'border-white/15 bg-white/5 text-slate-200 hover:bg-white/10'}`}>
          🍿 What to watch
        </button>
        <button onClick={() => setView('tv')} className={`rounded-2xl border-2 px-4 py-4 text-lg font-bold transition ${view === 'tv' ? 'border-brand-400 bg-brand-500/25 text-white' : 'border-white/15 bg-white/5 text-slate-200 hover:bg-white/10'}`}>
          📡 On TV soon
        </button>
      </div>

      {view === 'tv' ? (
        <EasyOnTv />
      ) : (
      <>
      {/* Who's watching */}
      <div>
        <div className="mb-3 text-center text-lg font-semibold text-slate-200">Who’s watching?</div>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          {AUDIENCES.map((a) => (
            <button key={a.v} onClick={() => setAudience(a.v)} className={`rounded-2xl border-2 px-4 py-5 text-center text-xl font-bold transition ${audience === a.v ? 'border-brand-400 bg-brand-500/25 text-white' : 'border-white/15 bg-white/5 text-slate-200 hover:bg-white/10'}`}>
              <span className="mb-1 block text-3xl" aria-hidden>{a.emoji}</span>
              {a.label}
            </button>
          ))}
        </div>
      </div>

      {/* Customize — big and simple, learns your taste */}
      <div className="rounded-2xl border-2 border-white/15 bg-white/[0.04]">
        <button onClick={() => setCustomize((v) => !v)} className="flex w-full items-center justify-between px-5 py-4 text-left">
          <span className="text-xl font-bold text-white">⚙️ Tell us what you like</span>
          <span className="text-lg font-semibold text-brand-200">{customize ? 'Hide' : 'Set it up'}</span>
        </button>
        {customize && (
          <div className="space-y-6 border-t-2 border-white/10 p-5">
            <div>
              <div className="mb-2 text-lg font-semibold text-slate-100">A movie or a show?</div>
              <BigChoice value={prefs.mediaType} onChange={(v) => savePrefs({ ...prefs, mediaType: v })} options={[{ v: 'any', label: 'Either' }, { v: 'movie', label: '🎬 Movies' }, { v: 'tv', label: '📺 TV shows' }]} />
            </div>
            <div>
              <div className="mb-2 text-lg font-semibold text-slate-100">How long?</div>
              <BigChoice
                value={prefs.maxRuntime}
                onChange={(v) => savePrefs({ ...prefs, maxRuntime: v })}
                options={[
                  { v: null, label: 'Any length' },
                  { v: 30, label: '30 min or less' },
                  { v: 60, label: 'An hour or less' },
                  { v: 90, label: 'About 1½ hours' },
                  { v: 120, label: 'About 2 hours' },
                ]}
              />
            </div>
            <div>
              <div className="mb-2 text-lg font-semibold text-slate-100">From which era?</div>
              <BigChoice value={prefs.era} onChange={(v) => savePrefs({ ...prefs, era: v })} options={EASY_ERAS.map((e) => ({ v: e, label: ERA_LABELS[e] }))} />
            </div>
            <div>
              <div className="mb-2 text-lg font-semibold text-slate-100">How clean?</div>
              <BigChoice value={prefs.content} onChange={(v) => savePrefs({ ...prefs, content: v })} options={EASY_CONTENT.map((c) => ({ v: c, label: CONTENT_LABELS[c] }))} />
            </div>
            <div>
              <div className="mb-2 text-lg font-semibold text-slate-100">Actors you love</div>
              {prefs.favorites.length > 0 && (
                <div className="mb-2 flex flex-wrap gap-2">
                  {prefs.favorites.map((f) => (
                    <span key={f.id} className="inline-flex items-center gap-2 rounded-full border-2 border-brand-400/60 bg-brand-500/20 px-3 py-1.5 text-base font-semibold text-brand-100">
                      {f.name}
                      <button onClick={() => removeFavorite(f.id)} aria-label={`Remove ${f.name}`} className="text-lg leading-none text-slate-300 hover:text-white">×</button>
                    </span>
                  ))}
                </div>
              )}
              <input value={actorQuery} onChange={(e) => setActorQuery(e.target.value)} placeholder="Type an actor’s name…" className="w-full rounded-xl border-2 border-white/15 bg-ink-900/70 px-4 py-3 text-lg text-white placeholder:text-slate-500 outline-none focus:border-brand-400/70" />
              {actorHits.length > 0 && (
                <div className="mt-2 overflow-hidden rounded-xl border-2 border-white/10 bg-ink-850">
                  {actorHits.map((h) => (
                    <button key={h.id} onClick={() => addFavorite({ id: h.id, name: h.name })} className="flex w-full items-center gap-3 px-4 py-2.5 text-left text-lg hover:bg-white/10">
                      <span className="font-semibold text-white">{h.name}</span>
                      {h.knownFor && <span className="truncate text-sm text-slate-400">{h.knownFor}</span>}
                    </button>
                  ))}
                </div>
              )}
              <p className="mt-1.5 text-sm text-slate-400">We’ll favor movies starring the actors you add — and remember them next time.</p>
            </div>
          </div>
        )}
      </div>

      {/* Three picks */}
      <div>
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <div className="text-2xl font-black text-white">Tonight’s 3 picks for you</div>
          {picks.length > 0 && (
            <button onClick={showDifferent} className="rounded-xl border-2 border-white/20 bg-white/5 px-4 py-2 text-base font-bold text-slate-100 hover:bg-white/10">🔄 Show me different ones</button>
          )}
        </div>
        {loading ? (
          <div className="space-y-4">{[0, 1, 2].map((i) => <div key={i} className="h-40 animate-pulse rounded-2xl bg-white/5" />)}</div>
        ) : picks.length === 0 ? (
          <div className="rounded-2xl border-2 border-white/15 bg-white/5 p-6 text-center">
            <p className="text-xl text-slate-200">We couldn’t find three with those settings.</p>
            <p className="mt-1 text-lg text-slate-400">Try loosening a setting above, or tell us a few movies you love.</p>
            <Link href="/app/onboarding" className="btn-primary mt-4 inline-flex px-6 py-3 text-lg">Tell us your taste</Link>
          </div>
        ) : (
          <div className="space-y-4">
            {picks.map((p) => {
              const v = verdictVisualForCall(p.primaryCall);
              const watch = providerWatchUrl(p.where, p.title, p.year);
              const key = `${p.mediaType}-${p.id}`;
              return (
                <div key={key} className="overflow-hidden rounded-2xl border-2 border-white/15 bg-white/[0.04]">
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
                        {p.featuresFavorite && <span className="rounded-full border-2 border-gold-400/60 bg-gold-500/15 px-3 py-1 text-base font-bold text-amber-100">⭐ An actor you love</span>}
                      </div>
                      <p className="mt-3 text-lg leading-relaxed text-slate-100">{p.reason}</p>
                      {/* Every rating we have, right on the placard. */}
                      <CardRatings mediaType={p.mediaType} tmdbId={p.id} title={p.title} year={p.year} className="mt-2 text-sm" />
                      {p.where && <p className="mt-2 text-lg font-semibold text-emerald-300">▶ On {p.where}</p>}

                      <div className="mt-4 flex flex-wrap items-center gap-3">
                        <a href={watch.url} target="_blank" rel="noopener noreferrer" className="btn-primary px-6 py-3 text-lg">{watch.label} →</a>
                        <Link href={`/app/title/${p.mediaType}/${p.id}`} className="rounded-xl border-2 border-white/20 bg-white/5 px-5 py-3 text-lg font-semibold text-slate-100 hover:bg-white/10">More about it</Link>
                        <button onClick={() => dismiss(key)} className="rounded-xl border-2 border-white/20 bg-white/5 px-5 py-3 text-lg font-semibold text-slate-300 hover:bg-white/10" title="We won’t show this again">👎 Not for me</button>
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

      <div className="rounded-2xl border-2 border-white/15 bg-white/5 p-5 text-center">
        <div className="text-xl font-semibold text-white">Want something different?</div>
        <p className="mt-1 text-lg text-slate-300">Tell us in your own words — type or talk.</p>
        <Link href="/app/ask" className="btn-secondary mt-3 inline-flex px-6 py-3 text-lg">🎙️ Ask for a movie</Link>
      </div>
      </>
      )}

      <div className="text-center">
        <button onClick={useFullApp} className="text-lg font-semibold text-slate-400 underline hover:text-white">Switch to the full app</button>
      </div>
    </div>
  );
}
