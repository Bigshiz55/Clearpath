'use client';

import { useState } from 'react';
import { CloudCrews } from '@/components/CloudCrews';
import { TogetherPlanner } from '@/components/TogetherPlanner';
import { useStartCourt } from '@/lib/court/useStartCourt';

/**
 * THE TWO SMALLER OPTIONS under "Start a Verdict Room" — real tappable mobile
 * cards, not underlined text links. "Quick Pick" discloses the existing
 * on-device planner in place; "Invite the Jury" opens the exact same live
 * room the primary button does (same `useStartCourt` call), just labeled for
 * whoever scans straight past the primary button looking for the multi-phone
 * option by name.
 */
type Panel = 'device' | 'crews' | null;

function Card({
  emoji,
  title,
  subtitle,
  onClick,
  busy,
  testId,
}: {
  emoji: string;
  title: string;
  subtitle: string;
  onClick: () => void;
  busy?: boolean;
  testId: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={busy}
      data-testid={testId}
      className="flex min-h-[76px] w-full items-center gap-3 rounded-2xl border border-white/10 bg-ink-850 p-4 text-left transition hover:border-white/25 active:scale-[0.99] disabled:opacity-60"
    >
      <span aria-hidden className="flex h-11 w-11 flex-none items-center justify-center rounded-xl bg-white/5 text-xl">
        {emoji}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-base font-bold text-white">{busy ? 'Opening…' : title}</span>
        <span className="block text-sm text-slate-400">{subtitle}</span>
      </span>
      <span aria-hidden className="flex-none text-slate-500">→</span>
    </button>
  );
}

export function CourtSecondaryActions() {
  const [open, setOpen] = useState<Panel>(null);
  const { start, loading, error } = useStartCourt();

  return (
    <div className="mt-4" data-testid="together-secondary">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Card
          emoji="🎬"
          title="Quick Pick"
          subtitle="Choose together on this phone."
          onClick={() => setOpen(open === 'device' ? null : 'device')}
          testId="open-device"
        />
        <Card
          emoji="⚖️"
          title="Invite the Jury"
          subtitle="Everyone joins from their own phone."
          onClick={() => void start()}
          busy={loading}
          testId="open-invite"
        />
      </div>
      {error && <p className="mt-2 text-xs text-red-300">{error}</p>}

      {open === 'device' && (
        <section className="mt-4">
          <p className="text-xs text-slate-500">Quick, private juries stored just on this phone — no accounts, no sharing.</p>
          <TogetherPlanner />
        </section>
      )}

      <div className="mt-4 text-center">
        <button
          type="button"
          onClick={() => setOpen(open === 'crews' ? null : 'crews')}
          aria-expanded={open === 'crews'}
          data-testid="open-crews"
          className="text-xs font-semibold text-slate-500 underline decoration-white/25 underline-offset-4 transition hover:text-slate-300"
        >
          Manage your saved Crews
        </button>
      </div>

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
    </div>
  );
}
