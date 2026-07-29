'use client';

import { useState } from 'react';
import { CloudCrews } from '@/components/CloudCrews';
import { TogetherPlanner } from '@/components/TogetherPlanner';

/**
 * THE OTHER TWO WAYS IN, AT LINK WEIGHT. Live Court is the page's one primary
 * action; synced juries and on-device juries used to be two more full cards
 * competing with it. They are real features with real state, so they don't
 * get routes of their own invented here — each is a plain text link that
 * discloses the existing panel in place, collapsed until asked for.
 */
type Panel = 'crews' | 'device' | null;

export function TogetherSecondary() {
  const [open, setOpen] = useState<Panel>(null);

  const link = (active: boolean) =>
    `text-sm font-semibold underline-offset-4 transition ${
      active ? 'text-white underline' : 'text-slate-400 underline decoration-white/25 hover:text-white'
    }`;

  return (
    <div className="mt-4" data-testid="together-secondary">
      <p className="flex flex-wrap items-center gap-x-5 gap-y-1 text-sm text-slate-500">
        <span>Prefer something smaller?</span>
        <button type="button" onClick={() => setOpen(open === 'crews' ? null : 'crews')} aria-expanded={open === 'crews'} className={link(open === 'crews')} data-testid="open-crews">
          Synced jury with a QR code
        </button>
        <button type="button" onClick={() => setOpen(open === 'device' ? null : 'device')} aria-expanded={open === 'device'} className={link(open === 'device')} data-testid="open-device">
          Just on this device
        </button>
      </p>

      {open === 'crews' && (
        <section className="mt-4">
          <p className="text-xs text-slate-400">
            Cloud juries sync across devices. Friends scan a QR, do a 30-second calibration, and their taste counts too.
          </p>
          <div className="mt-3">
            <CloudCrews />
          </div>
        </section>
      )}
      {open === 'device' && (
        <section className="mt-4">
          <p className="text-xs text-slate-500">Quick, private juries stored just on this phone — no accounts, no sharing.</p>
          <TogetherPlanner />
        </section>
      )}
    </div>
  );
}
