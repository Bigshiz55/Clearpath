'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { setDimensionOverride, clearDimensionOverride } from '@/lib/actions/dimensionOverrides';
import { useI18n } from '@/i18n/I18nProvider';

export interface DialView {
  key: string;
  label: string;
  low: string;
  high: string;
  pref: number;
  lean: string;
  tier: 'learning' | 'weak' | 'moderate' | 'strong';
  confidence: number;
  samples: number;
  pinned: boolean;
  isLimit: boolean;
}

const TIER_CLS: Record<DialView['tier'], string> = {
  learning: 'text-slate-400 border-slate-500/40 bg-slate-500/10',
  weak: 'text-slate-300 border-slate-400/40 bg-slate-400/10',
  moderate: 'text-brand-200 border-brand-400/40 bg-brand-500/10',
  strong: 'text-emerald-200 border-emerald-400/40 bg-emerald-500/10',
};
const TIER_KEY: Record<DialView['tier'], string> = {
  learning: 'dna.tierLearning',
  weak: 'dna.tierWeak',
  moderate: 'dna.tierModerate',
  strong: 'dna.tierStrong',
};

export function TasteDials({ dials }: { dials: DialView[] }) {
  return (
    <div className="mt-4 space-y-3.5">
      {dials.map((d) => (
        <Dial key={d.key} dial={d} />
      ))}
    </div>
  );
}

function Dial({ dial }: { dial: DialView }) {
  const router = useRouter();
  const { t, plural } = useI18n();
  const [open, setOpen] = useState(false);
  const [pref, setPref] = useState(dial.pref);
  const [limit, setLimit] = useState(dial.isLimit);
  const [pending, start] = useTransition();
  const [err, setErr] = useState<string | null>(null);

  // Translate the axis label/endpoints by the stable dimension key, falling back
  // to the English text the pure engine supplied if a translation is missing.
  const L = (suffix: 'label' | 'low' | 'high', fb: string) => {
    const k = `dims.${dial.key}.${suffix}`;
    const r = t(k);
    return r === k ? fb : r;
  };
  const label = L('label', dial.label);
  const low = L('low', dial.low);
  const high = L('high', dial.high);

  const strong = Math.abs(dial.pref - 50) >= 25;
  const tierCls = TIER_CLS[dial.tier];
  const tierText = t(TIER_KEY[dial.tier]);
  const leanFor = (p: number) => (p >= 50 ? high : low);

  function save() {
    setErr(null);
    start(async () => {
      const r = await setDimensionOverride({ key: dial.key, pref: Math.round(pref), isLimit: limit });
      if (!r.ok) {
        setErr(r.error ?? t('dna.couldNotSave'));
        return;
      }
      setOpen(false);
      router.refresh();
    });
  }
  function reset() {
    setErr(null);
    start(async () => {
      const r = await clearDimensionOverride(dial.key);
      if (!r.ok) {
        setErr(r.error ?? t('dna.couldNotClear'));
        return;
      }
      setOpen(false);
      router.refresh();
    });
  }

  return (
    <div className={`rounded-xl border p-3 transition ${dial.isLimit ? 'border-rose-400/40 bg-rose-500/[0.06]' : 'border-white/10 bg-white/[0.03]'}`}>
      {/* Axis name + lean + strength */}
      <div className="flex items-baseline justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2">
          <span className="text-sm font-bold text-white">{label}</span>
          {dial.pinned && <span className="text-[10px] font-bold uppercase tracking-wide text-brand-300" title={t('dna.youSetThis')}>📌 {t('dna.yours')}</span>}
          {dial.isLimit && <span className="text-[10px] font-bold uppercase tracking-wide text-rose-300" title={t('dna.avoid')}>⛔ {t('dna.avoid')}</span>}
        </div>
        <span className={`text-xs font-bold ${strong ? 'text-brand-200' : 'text-slate-300'}`}>{leanFor(dial.pref)}</span>
      </div>

      {/* Track */}
      <div className="mt-2 relative h-2 rounded-full bg-white/10">
        <span className="absolute left-1/2 top-1/2 h-3 w-px -translate-y-1/2 bg-white/25" />
        <span
          className="absolute top-1/2 h-4 w-4 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white bg-brand-500 shadow"
          style={{ left: `${dial.pref}%` }}
        />
      </div>
      <div className="mt-1 flex items-center justify-between text-[11px] text-slate-500">
        <span>{low}</span>
        <span>{high}</span>
      </div>

      {/* Confidence + sample count + adjust */}
      <div className="mt-2 flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className={`rounded-full border px-2 py-0.5 text-[10px] font-bold ${dial.pinned ? 'border-brand-400/40 bg-brand-500/10 text-brand-200' : tierCls}`}>
            {dial.pinned ? t('dna.youSetThis') : tierText}
          </span>
          {!dial.pinned && (
            <span className="text-[11px] text-slate-500">
              {plural('dna.samples', dial.samples, { pct: Math.round(dial.confidence * 100) })}
            </span>
          )}
        </div>
        <button onClick={() => setOpen((o) => !o)} className="text-[11px] font-bold text-brand-300 hover:text-brand-200">
          {open ? t('dna.close') : dial.pinned ? t('dna.edit') : t('dna.adjust')}
        </button>
      </div>

      {/* Correction control */}
      {open && (
        <div className="mt-3 rounded-lg border border-white/10 bg-ink-900/50 p-3">
          <div className="flex items-center justify-between text-xs">
            <span className="text-slate-400">{low}</span>
            <span className="font-bold text-brand-200">{leanFor(pref)}</span>
            <span className="text-slate-400">{high}</span>
          </div>
          <input
            type="range"
            min={0}
            max={100}
            value={pref}
            onChange={(e) => setPref(Number(e.target.value))}
            className="mt-2 w-full accent-brand-500"
            aria-label={t('dna.setYour', { label })}
          />
          <label className="mt-2 flex items-center gap-2 text-xs text-slate-300">
            <input type="checkbox" checked={limit} onChange={(e) => setLimit(e.target.checked)} className="accent-rose-500" />
            {t('dna.dealbreaker')}
          </label>
          {err && <div className="mt-2 text-xs text-rose-300">{err}</div>}
          <div className="mt-3 flex items-center gap-2">
            <button onClick={save} disabled={pending} className="btn-primary px-3 py-1.5 text-xs disabled:opacity-60">
              {pending ? t('dna.saving') : t('dna.save')}
            </button>
            {dial.pinned && (
              <button onClick={reset} disabled={pending} className="text-xs font-semibold text-slate-400 hover:text-white">
                {t('dna.resetLearned')}
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
