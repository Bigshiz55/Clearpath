'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import type { PreferenceTrait } from '@/lib/types';
import { humanTrait } from '@/lib/scoring/traits';
import { saveOnboarding } from '@/lib/actions/profile';
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

export function OnboardingForm({ defaultName }: { defaultName: string }) {
  const router = useRouter();
  const toast = useToast();
  const [step, setStep] = useState(1);
  const [displayName, setDisplayName] = useState(defaultName);
  const [username, setUsername] = useState('');
  const [region, setRegion] = useState('US');
  const [avoid, setAvoid] = useState<Set<PreferenceTrait>>(new Set());
  const [love, setLove] = useState<Set<PreferenceTrait>>(new Set());
  const [usePreset, setUsePreset] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

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
      <div className="mb-5 flex items-center gap-2">
        {[1, 2].map((s) => (
          <div key={s} className={`h-1.5 flex-1 rounded-full ${step >= s ? 'bg-brand-500' : 'bg-white/10'}`} />
        ))}
      </div>

      {step === 1 && (
        <div className="space-y-4">
          <div>
            <h1 className="text-2xl font-bold text-white">Welcome — let’s set you up</h1>
            <p className="mt-1 text-sm text-slate-400">This takes about a minute. You can change anything later.</p>
          </div>
          <div>
            <label className="label" htmlFor="name">Display name</label>
            <input id="name" value={displayName} onChange={(e) => setDisplayName(e.target.value)} className="input" placeholder="Scott" />
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
            <p className="mt-1 text-xs text-slate-500">3–24 lowercase letters, numbers, or underscores.</p>
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
