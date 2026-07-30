'use client';

import { useRef } from 'react';
import { explainSections, SECTION, type Reason } from '@/lib/verdict/explainSections';

/**
 * "WHY THIS VERD1CT?" — the same explanation, in an order a person can scan.
 *
 * It opened onto three undifferentiated runs of text, every line ending in its
 * own arithmetic ("Sci-Fi: a strong personal match (+6)."), under headings that
 * did not say what each run was for. The facts were all there and none of them
 * were findable.
 *
 * Three named sections now — why it matched, what to know, which of YOUR
 * requirements were checked — with the strongest few reasons leading and the
 * arithmetic behind "See scoring details". Nothing is removed: every reason and
 * every number is still on the card, one layer down.
 *
 * SIZED TO BE READ, NOT DECODED. The whole panel rendered at 12px slate-300 —
 * caption type, for the one block whose entire job is to be read. The reasons
 * are body type now (15px, near-white, relaxed leading): tap "Why this
 * Verd1ct?" and the answer is legible instantly, not after leaning in.
 *
 * AND IT CLOSES WHERE YOU FINISHED. An open panel is several screens of thumb
 * away from the summary that opened it; the only way shut was to scroll back
 * up. A Close row at the bottom folds it from where your eye already is.
 */
export interface WhyVerdictData {
  rose: string[];
  heldBack: string[];
  requirements: { label: string; satisfied: boolean; evidence: string }[];
  availability: { text: string; confidence: string } | null;
  confidence: { level: string; because: string[] };
}

function Heading({ children, tone }: { children: React.ReactNode; tone: string }) {
  return <div className={`text-[11px] font-black uppercase tracking-wide ${tone}`}>{children}</div>;
}

/** A reason, with its arithmetic dropped unless the details layer is open. */
function Line({ r, showMath }: { r: Reason; showMath: boolean }) {
  return (
    <p className="text-[15px] leading-relaxed text-slate-100">
      {r.text}
      {showMath && r.math && <span className="ml-1.5 text-[12px] tabular-nums text-slate-400">{r.math}</span>}
    </p>
  );
}

export function WhyVerdict({ data, className = '' }: { data: WhyVerdictData; className?: string }) {
  const s = explainSections(data);
  const ref = useRef<HTMLDetailsElement>(null);

  return (
    <details ref={ref} data-testid="why-verdict" className={`group rounded-lg border border-white/10 bg-white/[0.03] ${className}`}>
      <summary className="cursor-pointer select-none px-3 py-2.5 text-[15px] font-bold text-brand-200 transition hover:text-white">
        Why this Verd1ct?
      </summary>
      <div className="space-y-3 px-3 pb-1">
        {s.matched.lead.length > 0 && (
          <div data-testid="why-matched" className="space-y-0.5">
            <Heading tone="text-emerald-300">{s.matched.heading}</Heading>
            {s.matched.lead.map((r) => <Line key={r.text} r={r} showMath={false} />)}
          </div>
        )}

        {s.know.reasons.length > 0 && (
          <div data-testid="why-know" className="space-y-0.5">
            <Heading tone="text-amber-300">{s.know.heading}</Heading>
            {s.know.reasons.map((r) => <Line key={r.text} r={r} showMath={false} />)}
          </div>
        )}

        {data.requirements.length > 0 && (
          <div data-testid="why-requirements" className="space-y-0.5">
            <Heading tone="text-slate-400">{SECTION.requirements}</Heading>
            {data.requirements.map((r) => (
              <p key={r.label} className="text-[15px] leading-relaxed text-slate-100">
                {r.satisfied ? '✓' : '✗'} {r.label} <span className="text-[13px] text-slate-400">({r.evidence})</span>
              </p>
            ))}
          </div>
        )}

        {data.availability && (
          <p className="text-[15px] leading-relaxed text-slate-100">
            📺 {data.availability.text}
            <span className="ml-1.5 text-[13px] text-slate-400">· {data.availability.confidence}</span>
          </p>
        )}

        <p className="text-[14px] leading-relaxed text-slate-300">
          Confidence: <b className="uppercase text-slate-100">{data.confidence.level}</b>
          {data.confidence.because[0] ? ` — ${data.confidence.because[0]}` : ''}
        </p>

        {/* THE MATHS IS KEPT, NOT SHOWN FIRST. A coefficient is what you read to
            audit the score; a reason is what you read to decide. They were at
            the same weight, which made the audit trail the loudest thing in the
            explanation. */}
        {s.hasDetails && (
          <details data-testid="scoring-details" className="rounded-md bg-black/25 px-2.5 py-1.5">
            <summary className="cursor-pointer select-none text-[13px] font-semibold text-slate-400 transition hover:text-white">
              See scoring details
            </summary>
            <div className="mt-1 space-y-0.5">
              {[...s.matched.lead, ...s.matched.more, ...s.know.reasons].map((r) => (
                <Line key={`m-${r.text}`} r={r} showMath />
              ))}
            </div>
          </details>
        )}
      </div>

      {/* Close where you finished reading — the summary that opened this is a
          whole panel away by now. */}
      <button
        type="button"
        data-testid="why-close"
        onClick={() => ref.current?.removeAttribute('open')}
        className="mt-1 flex min-h-[40px] w-full items-center justify-center gap-1.5 border-t border-white/10 text-[13px] font-semibold text-slate-400 transition hover:text-white"
      >
        <span aria-hidden>✕</span> Close
      </button>
    </details>
  );
}
