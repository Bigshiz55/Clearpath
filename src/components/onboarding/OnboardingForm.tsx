'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import type { PreferenceTrait } from '@/lib/types';
import { humanTrait } from '@/lib/scoring/traits';
import { saveOnboarding } from '@/lib/actions/profile';
import { STREAMING_SERVICES } from '@/lib/services';
import { useToast } from '@/components/Toast';

const AVOIDABLE: PreferenceTrait[] = ['supernatural', 'paranormal', 'science_fiction', 'fantasy', 'noir', 'slow_burn'];
const LOVABLE: PreferenceTrait[] = ['grounded_crime', 'psychological_thriller', 'detective_mystery', 'domestic_thriller', 'serial_killer'];

const REGIONS = [
  ['US', 'United States'],
  ['GB', 'United Kingdom'],
  ['CA', 'Canada'],
  ['AU', 'Australia'],
  ['IE', 'Ireland'],
  ['DE', 'Germany'],
  ['FR', 'France'],
  ['IN', 'India'],
  ['BR', 'Brazil'],
  ['MX', 'Mexico'],
] as const;

/** A display name into a legal username: lowercase, safe characters, 24 max. */
function slugify(name: string): string {
  return name.trim().toLowerCase().replace(/[^a-z0-9_]/g, '').slice(0, 24);
}

export function OnboardingForm({ defaultName }: { defaultName: string }) {
  const router = useRouter();
  const toast = useToast();
  const [step, setStep] = useState(0);
  const [displayName, setDisplayName] = useState(defaultName);
  const [username, setUsername] = useState(() => slugify(defaultName));
  const [region, setRegion] = useState('US');
  const [avoid, setAvoid] = useState<Set<PreferenceTrait>>(new Set());
  const [love, setLove] = useState<Set<PreferenceTrait>>(new Set());
  const [usePreset, setUsePreset] = useState(false);
  const [services, setServices] = useState<Set<number>>(new Set());
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function toggleService(id: number) {
    setServices((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggle(set: Set<PreferenceTrait>, val: PreferenceTrait, setter: (s: Set<PreferenceTrait>) => void) {
    const next = new Set(set);
    if (next.has(val)) next.delete(val);
    else next.add(val);
    setter(next);
  }

  async function submit() {
    setError(null);
    setLoading(true);
    const res = await saveOnboarding({
      displayName,
      username: username.toLowerCase(),
      region,
      avoidTraits: Array.from(avoid),
      loveTraits: Array.from(love),
      usePreset: usePreset ? 'scott' : 'none',
      services: Array.from(services),
    });
    setLoading(false);
    if (!res.ok) {
      setError(res.error ?? 'Could not save.');
      setStep(1);
      return;
    }
    toast.show('You’re all set!', 'success');
    router.push('/app');
    router.refresh();
  }

  const isScott = displayName.trim().toLowerCase().startsWith('scott');

  return (
    <div className="card w-full max-w-lg p-7">
      {step > 0 && (
        <div data-testid="onboarding-progress" className="mb-5 flex items-center gap-2">
          {[1, 2, 3].map((s) => (
            <div key={s} className={`h-1.5 flex-1 rounded-full ${step >= s ? 'bg-brand-500' : 'bg-white/10'}`} />
          ))}
        </div>
      )}

      {/* STEP 0 — WHAT THIS IS.
          A new person's first screen used to be "pick a username", which asks
          them to do admin for a product they have not seen do anything yet.
          This says what it does, in their terms, and costs one tap. No progress
          bar here on purpose: a bar implies a form, and this is not one. */}
      {step === 0 && (
        <div className="space-y-5" data-testid="onboarding-welcome">
          <div>
            <h1 className="text-2xl font-black leading-tight text-white sm:text-3xl">
              Stop scrolling. Start watching.
            </h1>
            <p className="mt-2 text-base leading-relaxed text-slate-300">
              Most apps hand you another endless list. This one gives you{' '}
              <strong className="font-bold text-white">one answer</strong> — and shows you the maths behind it.
            </p>
          </div>

          <ul className="space-y-2.5">
            {[
              { icon: '⚖️', title: 'Say it in plain words', body: '“Clever thriller, nothing too gory, under two hours.” We take it literally.' },
              { icon: '🧬', title: 'It learns what you like', body: 'A two-minute quiz, or react to titles you know. Nothing is guessed from thin air.' },
              { icon: '🔨', title: 'Shortlist, then one Verd1ct', body: 'Mark a few with the W, hit the gavel, get a decision and the reason the runner-up lost.' },
            ].map((f) => (
              <li key={f.title} className="flex items-start gap-3 rounded-xl border border-white/10 bg-white/[0.04] p-3">
                <span aria-hidden className="text-xl leading-none">{f.icon}</span>
                <span className="min-w-0">
                  <span className="block text-sm font-bold text-white">{f.title}</span>
                  <span className="mt-0.5 block text-sm leading-snug text-slate-400">{f.body}</span>
                </span>
              </li>
            ))}
          </ul>

          <button
            onClick={() => setStep(1)}
            data-testid="onboarding-start"
            className="btn-primary w-full py-3.5 text-base"
          >
            Set me up — takes a minute →
          </button>
          <p className="text-center text-xs text-slate-500">
            Three short steps. You can change any of it later.
          </p>
        </div>
      )}

      {step === 1 && (
        <div className="space-y-4">
          <div>
            <h1 className="text-2xl font-bold text-white">Welcome — let’s set you up</h1>
            <p className="mt-1 text-sm text-slate-400">This takes about a minute. You can change anything later.</p>
          </div>
          <div>
            <label className="label" htmlFor="name">Display name</label>
            <input
              id="name"
              value={displayName}
              onChange={(e) => {
                const v = e.target.value;
                // Keep the username in step with the name until the user edits
                // it themselves — one fewer thing to invent on a first run.
                setUsername((u) => (u === '' || u === slugify(displayName) ? slugify(v) : u));
                setDisplayName(v);
              }}
              className="input"
              placeholder="Scott"
            />
          </div>
          <div>
            <label className="label" htmlFor="username">Username</label>
            <input
              id="username"
              value={username}
              onChange={(e) => setUsername(e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, ''))}
              className="input"
              placeholder="scott"
            />
            <p className="mt-1 text-xs text-slate-500">
              Filled in from your name — change it if you like. 3–24 lowercase letters, numbers or underscores.
            </p>
          </div>
          <div>
            <label className="label" htmlFor="region">Viewing country</label>
            <select id="region" value={region} onChange={(e) => setRegion(e.target.value)} className="input">
              {REGIONS.map(([code, name]) => (
                <option key={code} value={code}>{name}</option>
              ))}
            </select>
            <p className="mt-1 text-xs text-slate-500">Used to show where you can watch things legally.</p>
          </div>
          {error && <p className="text-sm text-red-300">{error}</p>}
          <button
            onClick={() => {
              if (!displayName.trim()) return setError('Enter a display name.');
              if (!/^[a-z0-9_]{3,24}$/.test(username)) return setError('Pick a valid username.');
              setError(null);
              setStep(2);
            }}
            className="btn-primary w-full"
          >
            Continue
          </button>
        </div>
      )}

      {step === 2 && (
        <div className="space-y-5">
          <div>
            <h1 className="text-2xl font-bold text-white">What’s your taste?</h1>
            <p className="mt-1 text-sm text-slate-400">Pick as many or as few as you like — or skip and tune later.</p>
          </div>

          {isScott && (
            <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-brand-400/40 bg-brand-500/10 p-3">
              <input type="checkbox" checked={usePreset} onChange={(e) => setUsePreset(e.target.checked)} className="mt-1 h-5 w-5 accent-brand-500" />
              <span className="text-sm text-slate-200">
                Use the <strong>Scott</strong> preset
                <span className="block text-xs text-slate-400">Grounded crime & detective boosts; big penalties for supernatural, sci-fi, fantasy, noir & slow burns.</span>
              </span>
            </label>
          )}

          {!usePreset && (
            <>
              <div>
                <div className="label">Genres to avoid <span className="text-slate-500">(penalized when it’s a defining trait)</span></div>
                <div className="flex flex-wrap gap-2">
                  {AVOIDABLE.map((t) => (
                    <button key={t} onClick={() => toggle(avoid, t, setAvoid)} className={`chip border ${avoid.has(t) ? 'chip-active' : ''}`}>
                      {humanTrait(t)}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <div className="label">Things you love <span className="text-slate-500">(boosted)</span></div>
                <div className="flex flex-wrap gap-2">
                  {LOVABLE.map((t) => (
                    <button key={t} onClick={() => toggle(love, t, setLove)} className={`chip border ${love.has(t) ? 'chip-active' : ''}`}>
                      {humanTrait(t)}
                    </button>
                  ))}
                </div>
              </div>
            </>
          )}

          {error && <p className="text-sm text-red-300">{error}</p>}

          <div className="flex gap-2">
            <button onClick={() => setStep(1)} className="btn-ghost">Back</button>
            <button onClick={() => setStep(3)} className="btn-primary flex-1">
              Continue
            </button>
          </div>
        </div>
      )}

      {step === 3 && (
        <div className="space-y-5">
          <div>
            <h1 className="text-2xl font-bold text-white">Which channels do you have?</h1>
            <p className="mt-1 text-sm text-slate-400">
              Tap every service you subscribe to. These are the only ones shown on your search screen — you can add or
              remove them anytime in Settings.
            </p>
          </div>

          <div className="flex flex-wrap gap-2">
            {STREAMING_SERVICES.map((s) => {
              const on = services.has(s.id);
              return (
                <button
                  key={s.id}
                  onClick={() => toggleService(s.id)}
                  className={`inline-flex items-center gap-1.5 rounded-lg border px-3 py-2 text-sm transition ${
                    on ? 'border-emerald-400/50 bg-emerald-500/15 text-emerald-100' : 'border-white/12 bg-white/5 text-slate-300 hover:bg-white/10'
                  }`}
                >
                  <span aria-hidden>{s.emoji}</span>
                  {s.name}
                  {on && <span className="text-xs font-bold text-emerald-300">✓</span>}
                </button>
              );
            })}
          </div>
          <p className="text-xs text-slate-500">{services.size} selected · you can skip this and set it later.</p>

          {error && <p className="text-sm text-red-300">{error}</p>}

          <div className="flex gap-2">
            <button onClick={() => setStep(2)} className="btn-ghost">Back</button>
            <button onClick={submit} disabled={loading} className="btn-primary flex-1">
              {loading ? 'Saving…' : 'Finish & start watching'}
            </button>
          </div>
          <button onClick={submit} disabled={loading} className="w-full text-center text-xs text-slate-500 hover:text-slate-300">
            Skip for now
          </button>
        </div>
      )}
    </div>
  );
}
