'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import type { PreferenceTrait } from '@/lib/types';
import { humanTrait } from '@/lib/scoring/traits';
import { saveOnboarding } from '@/lib/actions/profile';
import { STREAMING_SERVICES } from '@/lib/services';
import { useToast } from '@/components/Toast';
import { useI18n } from '@/i18n/I18nProvider';

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
  const { t, plural } = useI18n();
  const [step, setStep] = useState(1);
  const [displayName, setDisplayName] = useState(defaultName);
  const [username, setUsername] = useState('');
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
      setError(res.error ?? t('misc.onboarding.errSave'));
      setStep(1);
      return;
    }
    toast.show(t('misc.onboarding.allSet'), 'success');
    router.push('/app');
    router.refresh();
  }

  const isScott = displayName.trim().toLowerCase().startsWith('scott');

  return (
    <div className="card w-full max-w-lg p-7">
      <div className="mb-5 flex items-center gap-2">
        {[1, 2, 3].map((s) => (
          <div key={s} className={`h-1.5 flex-1 rounded-full ${step >= s ? 'bg-brand-500' : 'bg-white/10'}`} />
        ))}
      </div>

      {step === 1 && (
        <div className="space-y-4">
          <div>
            <h1 className="text-2xl font-bold text-white">{t('misc.onboarding.welcomeTitle')}</h1>
            <p className="mt-1 text-sm text-slate-400">{t('misc.onboarding.welcomeBody')}</p>
          </div>
          <div>
            <label className="label" htmlFor="name">{t('misc.onboarding.displayName')}</label>
            <input id="name" value={displayName} onChange={(e) => setDisplayName(e.target.value)} className="input" placeholder="Scott" />
          </div>
          <div>
            <label className="label" htmlFor="username">{t('misc.onboarding.username')}</label>
            <input
              id="username"
              value={username}
              onChange={(e) => setUsername(e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, ''))}
              className="input"
              placeholder="scott"
            />
            <p className="mt-1 text-xs text-slate-500">{t('misc.onboarding.usernameHint')}</p>
          </div>
          <div>
            <label className="label" htmlFor="region">{t('misc.onboarding.viewingCountry')}</label>
            <select id="region" value={region} onChange={(e) => setRegion(e.target.value)} className="input">
              {REGIONS.map(([code, name]) => (
                <option key={code} value={code}>{name}</option>
              ))}
            </select>
            <p className="mt-1 text-xs text-slate-500">{t('misc.onboarding.viewingCountryHint')}</p>
          </div>
          {error && <p className="text-sm text-red-300">{error}</p>}
          <button
            onClick={() => {
              if (!displayName.trim()) return setError(t('misc.onboarding.errDisplayName'));
              if (!/^[a-z0-9_]{3,24}$/.test(username)) return setError(t('misc.onboarding.errUsername'));
              setError(null);
              setStep(2);
            }}
            className="btn-primary w-full"
          >
            {t('misc.onboarding.continue')}
          </button>
        </div>
      )}

      {step === 2 && (
        <div className="space-y-5">
          <div>
            <h1 className="text-2xl font-bold text-white">{t('misc.onboarding.tasteTitle')}</h1>
            <p className="mt-1 text-sm text-slate-400">{t('misc.onboarding.tasteBody')}</p>
          </div>

          {isScott && (
            <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-brand-400/40 bg-brand-500/10 p-3">
              <input type="checkbox" checked={usePreset} onChange={(e) => setUsePreset(e.target.checked)} className="mt-1 h-5 w-5 accent-brand-500" />
              <span className="text-sm text-slate-200">
                {t('misc.onboarding.presetPrefix')}<strong>Scott</strong>{t('misc.onboarding.presetSuffix')}
                <span className="block text-xs text-slate-400">{t('misc.onboarding.presetDesc')}</span>
              </span>
            </label>
          )}

          {!usePreset && (
            <>
              <div>
                <div className="label">{t('misc.onboarding.genresToAvoid')} <span className="text-slate-500">{t('misc.onboarding.genresToAvoidHint')}</span></div>
                <div className="flex flex-wrap gap-2">
                  {AVOIDABLE.map((t) => (
                    <button key={t} onClick={() => toggle(avoid, t, setAvoid)} className={`chip border ${avoid.has(t) ? 'chip-active' : ''}`}>
                      {humanTrait(t)}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <div className="label">{t('misc.onboarding.thingsYouLove')} <span className="text-slate-500">{t('misc.onboarding.thingsYouLoveHint')}</span></div>
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
            <button onClick={() => setStep(1)} className="btn-ghost">{t('misc.onboarding.back')}</button>
            <button onClick={() => setStep(3)} className="btn-primary flex-1">
              {t('misc.onboarding.continue')}
            </button>
          </div>
        </div>
      )}

      {step === 3 && (
        <div className="space-y-5">
          <div>
            <h1 className="text-2xl font-bold text-white">{t('misc.onboarding.channelsTitle')}</h1>
            <p className="mt-1 text-sm text-slate-400">{t('misc.onboarding.channelsBody')}</p>
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
          <p className="text-xs text-slate-500">{plural('misc.onboarding.selectedSkip', services.size, {})}</p>

          {error && <p className="text-sm text-red-300">{error}</p>}

          <div className="flex gap-2">
            <button onClick={() => setStep(2)} className="btn-ghost">{t('misc.onboarding.back')}</button>
            <button onClick={submit} disabled={loading} className="btn-primary flex-1">
              {loading ? t('misc.onboarding.saving') : t('misc.onboarding.finish')}
            </button>
          </div>
          <button onClick={submit} disabled={loading} className="w-full text-center text-xs text-slate-500 hover:text-slate-300">
            {t('misc.onboarding.skipForNow')}
          </button>
        </div>
      )}
    </div>
  );
}
