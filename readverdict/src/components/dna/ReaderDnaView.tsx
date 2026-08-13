'use client';

import Link from 'next/link';
import { useStore } from '@/lib/store/StoreProvider';
import {
  READER_DIMENSIONS,
  dimensionDef,
  explainDimension,
  profileStrength,
  type DimensionState,
} from '@/lib/domain/readerDna';
import { Card } from '@/components/ui/Card';
import { EmptyState } from '@/components/ui/EmptyState';
import { cn } from '@/lib/utils/cn';

const CONF_LABEL: Record<string, string> = { high: 'High', medium: 'Medium', low: 'Low', none: 'No data' };

function confidenceBand(c: number): 'high' | 'medium' | 'low' {
  return c >= 0.75 ? 'high' : c >= 0.45 ? 'medium' : 'low';
}

export function ReaderDnaView() {
  const store = useStore();
  const { readerDna } = store.state;
  const states = Object.values(readerDna.dimensions).filter((s) => s.evidenceCount > 0 || s.userConfirmed);
  const strength = Math.round(profileStrength(readerDna) * 100);

  if (states.length === 0) {
    return (
      <EmptyState
        title="Your Reader DNA is empty"
        body="Take the quick Reader Interview or import your reading history, and ReadVerdict will start building your profile — with the evidence behind every conclusion."
      >
        <Link href="/onboarding" className="btn-brass">Take the interview</Link>
      </EmptyState>
    );
  }

  return (
    <div className="space-y-6">
      <Card padding="lg">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm text-ivory-300">Profile strength</p>
            <p className="font-display text-3xl font-bold text-ivory-50">{strength}%</p>
          </div>
          <div className="text-right text-sm text-ivory-400">
            <p>{states.length} of {READER_DIMENSIONS.length} dimensions with evidence</p>
            <Link href="/onboarding" className="link-quiet">Refine profile</Link>
          </div>
        </div>
      </Card>

      <div className="space-y-3">
        {states
          .sort((a, b) => b.confidence - a.confidence)
          .map((s) => (
            <DimensionRow key={s.key} state={s} onConfirm={(v) => store.confirmDimension(s.key, v)} />
          ))}
      </div>
    </div>
  );
}

function DimensionRow({ state, onConfirm }: { state: DimensionState; onConfirm: (v: number) => void }) {
  const def = dimensionDef(state.key);
  if (!def) return null;
  const band = confidenceBand(state.confidence);
  return (
    <Card>
      <div className="p-5">
        <div className="flex items-center justify-between gap-3">
          <h3 className="font-display text-lg font-semibold text-ivory-50">{def.label}</h3>
          <span
            className={cn(
              'rounded-full border px-2 py-0.5 text-xs font-medium',
              band === 'high'
                ? 'border-verdict-must/40 text-verdict-must'
                : band === 'medium'
                  ? 'border-gold-400/40 text-gold-300'
                  : 'border-ink-600 text-ivory-400',
            )}
          >
            {CONF_LABEL[band]} confidence{state.userConfirmed ? ' · confirmed' : ''}
          </span>
        </div>

        <div className="mt-3 flex items-center gap-3 text-xs text-ivory-400">
          <span className="w-24 shrink-0 text-right">{def.low}</span>
          <div className="relative h-2 flex-1 rounded-full bg-ink-800">
            <div
              className="absolute top-1/2 h-4 w-4 -translate-y-1/2 rounded-full border-2 border-ink-950 bg-copper-400"
              style={{ left: `calc(${Math.round(state.value * 100)}% - 8px)` }}
            />
          </div>
          <span className="w-24 shrink-0">{def.high}</span>
        </div>

        <p className="mt-3 text-sm text-ivory-300">{explainDimension(state)}</p>

        <div className="mt-3 flex items-center gap-2">
          <span className="text-xs text-ivory-400">Not right? Set it:</span>
          {[
            { v: 0.15, l: def.low },
            { v: 0.5, l: 'Balanced' },
            { v: 0.85, l: def.high },
          ].map((o) => (
            <button
              key={o.v}
              type="button"
              onClick={() => onConfirm(o.v)}
              className="rounded-full border border-ink-600 bg-ink-850 px-2.5 py-1 text-xs text-ivory-200 hover:border-copper-400 focus:outline-none focus-visible:ring-2 focus-visible:ring-copper-300"
            >
              {o.l}
            </button>
          ))}
        </div>
      </div>
    </Card>
  );
}
