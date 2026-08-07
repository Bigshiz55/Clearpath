'use client';

import { useState } from 'react';
import { answerCross, CROSS_QUESTIONS, type SpoilerLevel, type CrossContext } from '@/lib/trial/crossExamination';
import { SegmentedControl } from '@/components/ui/SegmentedControl';
import { EvidenceStatusTag } from './EvidenceStatusTag';
import { cn } from '@/lib/utils/cn';

export function CrossExamination({ ctx, onAsk }: { ctx: CrossContext; onAsk?: (id: string) => void }) {
  const [spoiler, setSpoiler] = useState<SpoilerLevel>('none');
  const [openId, setOpenId] = useState<string | null>(null);

  const active = openId ? answerCross(openId, ctx, spoiler) : null;

  return (
    <div>
      <div className="mb-3 flex items-center justify-between gap-3">
        <p className="text-sm text-ivory-300">Ask the witness stand.</p>
        <SegmentedControl
          ariaLabel="Spoiler level"
          value={spoiler}
          onChange={(v) => setSpoiler(v)}
          options={[
            { value: 'none', label: 'No spoilers' },
            { value: 'mild', label: 'Mild' },
            { value: 'full', label: 'Full' },
          ]}
        />
      </div>
      <div className="flex flex-wrap gap-2">
        {CROSS_QUESTIONS.map((q) => (
          <button
            key={q.id}
            type="button"
            onClick={() => {
              setOpenId(q.id);
              onAsk?.(q.id);
            }}
            className={cn(
              'rounded-full border px-3 py-1.5 text-xs font-medium transition focus:outline-none focus-visible:ring-2 focus-visible:ring-copper-300',
              openId === q.id
                ? 'border-copper-500/50 bg-copper-500/10 text-copper-200'
                : 'border-ink-600 bg-ink-850 text-ivory-200 hover:border-ink-500',
            )}
          >
            {q.label}
            {q.spoilerSensitive && <span className="ml-1 text-gold-400" title="May touch spoilers">•</span>}
          </button>
        ))}
      </div>

      {active && (
        <div className="mt-4 rounded-xl border border-ink-700 bg-ink-900/70 p-4" role="status" aria-live="polite">
          <div className="mb-1.5 flex items-center gap-2">
            <EvidenceStatusTag status={active.status} />
            {active.confidence > 0 && (
              <span className="text-[11px] text-ivory-400">confidence {(active.confidence * 100) | 0}%</span>
            )}
          </div>
          <p className="text-ivory-100">{active.answer}</p>
        </div>
      )}
    </div>
  );
}
