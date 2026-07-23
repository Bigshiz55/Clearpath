'use client';

import { useState } from 'react';
import type { Panel, Panelist, Stance } from '@/lib/swarm';
import { useI18n } from '@/i18n/I18nProvider';

const STANCE_STYLE: Record<Stance, { chip: string; labelKey: string; dot: string }> = {
  love: { chip: 'border-emerald-400/40 bg-emerald-500/10 text-emerald-100', labelKey: 'title.stanceLove', dot: 'bg-emerald-400' },
  mixed: { chip: 'border-amber-400/30 bg-amber-500/10 text-amber-100', labelKey: 'title.stanceMixed', dot: 'bg-amber-400' },
  pass: { chip: 'border-red-400/30 bg-red-500/10 text-red-100', labelKey: 'title.stancePass', dot: 'bg-red-400' },
};

interface Turn {
  name: string;
  text: string;
}

const EMOJI: Record<string, string> = {
  'The Action Junkie': '🔥',
  'The Pacing Critic': '⏱️',
  'The Indie Snob': '🎩',
  'The Visual Aesthete': '🎨',
};

export function CriticsTable({
  panel,
  facts,
}: {
  panel: Panel;
  facts: { title: string; year: number | null; watchVerdictScore: number; tier: string };
}) {
  const { t } = useI18n();
  const [debate, setDebate] = useState<Turn[] | null>(null);
  const [state, setState] = useState<'idle' | 'loading' | 'done' | 'none'>('idle');

  async function loadDebate() {
    setState('loading');
    try {
      const res = await fetch('/api/swarm', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...facts,
          panelists: panel.panelists.map((p) => ({ name: p.name, stance: p.stance, line: p.line, basis: p.basis })),
        }),
      });
      const data = await res.json();
      if (data.debate && Array.isArray(data.debate) && data.debate.length > 0) {
        setDebate(data.debate as Turn[]);
        setState('done');
      } else {
        setState('none');
      }
    } catch {
      setState('none');
    }
  }

  const { love, mixed, pass } = panel.lean;

  return (
    <section className="card p-5 sm:p-6">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-lg font-semibold text-white">{t('title.criticsTable')}</h2>
        <span className="text-xs text-slate-500">{t('title.roomSplit', { love, mixed, pass })}</span>
      </div>
      <p className="mt-1 text-xs text-slate-500">
        {t('title.criticsIntro')}
      </p>

      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        {panel.panelists.map((p: Panelist) => {
          const s = STANCE_STYLE[p.stance];
          return (
            <div key={p.key} className="rounded-xl border border-white/10 bg-white/5 p-4">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <span className="text-lg" aria-hidden>{p.emoji}</span>
                  <span className="text-sm font-semibold text-white">{p.name}</span>
                </div>
                <span className={`rounded-full border px-2 py-0.5 text-[11px] font-semibold ${s.chip}`}>{t(s.labelKey)}</span>
              </div>
              <p className="mt-2 text-sm text-slate-200">“{p.line}”</p>
              <div className="mt-2 text-[11px] text-slate-500">{t('title.basedOn')} {p.basis}</div>
            </div>
          );
        })}
      </div>

      {state !== 'done' && (
        <div className="mt-4">
          <button onClick={loadDebate} disabled={state === 'loading'} className="btn-secondary">
            {state === 'loading' ? t('title.writingDebate') : t('title.seeDebate')}
          </button>
          {state === 'none' && (
            <span className="ml-3 text-xs text-slate-500">
              {t('title.debateNeedsKey')}
            </span>
          )}
        </div>
      )}

      {debate && (
        <div className="mt-5 space-y-3 rounded-xl border border-white/10 bg-ink-900/50 p-4">
          <div className="text-xs font-semibold uppercase tracking-wide text-brand-200">{t('title.theDebate')}</div>
          {debate.map((turn, i) => (
            <div key={i} className="flex gap-2.5">
              <span className="text-base" aria-hidden>{EMOJI[turn.name] ?? '💬'}</span>
              <p className="text-sm text-slate-200">
                <span className="font-semibold text-white">{turn.name}:</span> {turn.text}
              </p>
            </div>
          ))}
          <p className="pt-1 text-[11px] text-slate-500">
            {t('title.debateDisclaimer')}
          </p>
        </div>
      )}
    </section>
  );
}
