'use client';

import { useState } from 'react';
import { REPORT_TABS, DEFAULT_TAB, type ReportTab } from '@/lib/verdict/reportTabs';

/**
 * THE TITLE PAGE'S TAB BAR.
 *
 * Eighteen stacked cards became a decision block plus four tabs — see
 * `lib/verdict/reportTabs` for what goes where and why.
 *
 * STICKY, because the whole point is to be able to move between the four
 * answers without scrolling back up. It is 52px, not the 148px a sticky header
 * would have cost, and it only sticks below the decision block, so it never
 * covers the score.
 *
 * The inactive panels are UNMOUNTED, not hidden. Hiding them would keep every
 * per-title fetch on the page (ratings, seasons, similar-title cards, Content
 * DNA) firing on load — the scroll would be shorter and the page no faster.
 */
export function ReportTabs({
  verdict,
  details,
  watch,
  similar,
}: {
  verdict: React.ReactNode;
  details: React.ReactNode;
  watch: React.ReactNode;
  similar: React.ReactNode;
}) {
  const [tab, setTab] = useState<ReportTab>(DEFAULT_TAB);
  const panels: Record<ReportTab, React.ReactNode> = { verdict, details, watch, similar };

  return (
    <>
      <div
        className="sticky top-0 z-30 -mx-4 border-y border-white/10 bg-ink-950/95 px-4 py-2 backdrop-blur sm:top-16 sm:-mx-6 sm:px-6"
        data-testid="report-tabs"
      >
        <div role="tablist" aria-label="Title sections" className="flex gap-1">
          {REPORT_TABS.map((t) => {
            const active = t.id === tab;
            return (
              <button
                key={t.id}
                type="button"
                role="tab"
                id={`report-tab-${t.id}`}
                aria-selected={active}
                aria-controls={`report-panel-${t.id}`}
                aria-label={`${t.label} — ${t.hint}`}
                data-testid={`report-tab-${t.id}`}
                data-active={active ? 'true' : 'false'}
                onClick={() => setTab(t.id)}
                className={`min-h-[44px] min-w-0 flex-1 rounded-lg px-2 text-sm font-bold transition ${
                  active
                    ? 'bg-brand-500 text-white shadow-glow'
                    : 'text-slate-300 hover:bg-white/5 hover:text-white'
                }`}
              >
                {t.label}
              </button>
            );
          })}
        </div>
      </div>

      <div
        role="tabpanel"
        id={`report-panel-${tab}`}
        aria-labelledby={`report-tab-${tab}`}
        data-testid={`report-panel-${tab}`}
        className="space-y-6"
      >
        {panels[tab]}
      </div>
    </>
  );
}
