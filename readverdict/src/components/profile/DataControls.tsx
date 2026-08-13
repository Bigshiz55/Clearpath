'use client';

import { useState } from 'react';
import { useStore } from '@/lib/store/StoreProvider';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';

export function DataControls() {
  const store = useStore();
  const [confirming, setConfirming] = useState<'dna' | 'all' | null>(null);

  const exportData = () => {
    const blob = new Blob([JSON.stringify(store.state, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'readverdict-data.json';
    a.click();
    URL.revokeObjectURL(url);
    store.track('data_exported');
  };

  return (
    <div className="space-y-4">
      <Card padding="lg">
        <h3 className="font-display text-lg font-semibold text-ivory-50">Your data</h3>
        <p className="mt-1 text-sm text-ivory-300">
          Everything is stored locally on this device until you connect an account. You control it.
        </p>
        <div className="mt-4 flex flex-wrap gap-2">
          <Button size="sm" variant="secondary" onClick={exportData}>Export my data (JSON)</Button>
          <Button size="sm" variant="ghost" onClick={() => setConfirming('dna')}>Reset Reader DNA</Button>
          <Button size="sm" variant="danger" onClick={() => setConfirming('all')}>Delete everything</Button>
        </div>

        {confirming && (
          <div className="mt-4 rounded-xl border border-oxblood-500/40 bg-oxblood-500/5 p-4">
            <p className="text-sm text-ivory-100">
              {confirming === 'dna'
                ? 'Reset your Reader DNA to empty? Your library stays.'
                : 'Delete all local data — library, Reader DNA, and history? This cannot be undone.'}
            </p>
            <div className="mt-3 flex gap-2">
              <Button
                size="sm"
                variant="danger"
                onClick={() => {
                  if (confirming === 'dna') store.resetDna();
                  else store.clearAll();
                  store.track('data_deleted', { scope: confirming });
                  setConfirming(null);
                }}
              >
                Yes, {confirming === 'dna' ? 'reset DNA' : 'delete everything'}
              </Button>
              <Button size="sm" variant="ghost" onClick={() => setConfirming(null)}>Cancel</Button>
            </div>
          </div>
        )}
      </Card>

      <Card padding="lg">
        <h3 className="font-display text-lg font-semibold text-ivory-50">Consent</h3>
        <div className="mt-3 space-y-3">
          <Toggle
            label="Product analytics"
            desc="Anonymous, semantic events to improve verdict quality."
            checked={store.state.consent.analytics}
            onChange={(v) => store.setConsent({ analytics: v })}
          />
          <Toggle
            label="Personalization"
            desc="Use your reading behavior to sharpen Reader DNA and verdicts."
            checked={store.state.consent.personalization}
            onChange={(v) => store.setConsent({ personalization: v })}
          />
        </div>
      </Card>
    </div>
  );
}

function Toggle({
  label,
  desc,
  checked,
  onChange,
}: {
  label: string;
  desc: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <label className="flex cursor-pointer items-start justify-between gap-4">
      <span>
        <span className="block text-sm font-medium text-ivory-100">{label}</span>
        <span className="block text-xs text-ivory-400">{desc}</span>
      </span>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        onClick={() => onChange(!checked)}
        className={`relative mt-0.5 h-6 w-11 shrink-0 rounded-full transition ${checked ? 'bg-copper-500' : 'bg-ink-700'}`}
      >
        <span
          className={`absolute top-0.5 h-5 w-5 rounded-full bg-ivory-50 transition-all ${checked ? 'left-[22px]' : 'left-0.5'}`}
        />
      </button>
    </label>
  );
}
