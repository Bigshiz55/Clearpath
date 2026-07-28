'use client';

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
 * The section that used to say "What held it back" says so only when something
 * did. See `explainSections`.
 */
export interface WhyVerdictData {
  rose: string[];
  heldBack: string[];
  requirements: { label: string; satisfied: boolean; evidence: string }[];
  availability: { text: string; confidence: string } | null;
  confidence: { level: string; because: string[] };
}

function Heading({ children, tone }: { children: React.ReactNode; tone: string }) {
  return <div className={`text-[10px] font-black uppercase tracking-wide ${tone}`}>{children}</div>;
}

/** A reason, with its arithmetic dropped unless the details layer is open. */
function Line({ r, showMath }: { r: Reason; showMath: boolean }) {
  return (
    <p className="text-slate-300">
      {r.text}
      {showMath && r.math && <span className="ml-1 text-[11px] tabular-nums text-slate-500">{r.math}</span>}
    </p>
  );
}

export function WhyVerdict({ data, className = '' }: { data: WhyVerdictData; className?: string }) {
  const s = explainSections(data);

  return (
    <details data-testid="why-verdict" className={`group rounded-lg border border-white/10 bg-white/[0.03] text-xs ${className}`}>
      <summary className="cursor-pointer select-none px-2 py-1.5 font-bold text-brand-200 transition hover:text-white">
        Why this Verd1ct?
      </summary>
      <div className="space-y-2 px-2 pb-2">
        {s.matched.lead.length > 0 && (
          <div data-testid="why-matched">
            <Heading tone="text-emerald-300">{s.matched.heading}</Heading>
            {s.matched.lead.map((r) => <Line key={r.text} r={r} showMath={false} />)}
          </div>
        )}

        {s.know.reasons.length > 0 && (
          <div data-testid="why-know">
            <Heading tone="text-amber-300">{s.know.heading}</Heading>
            {s.know.reasons.map((r) => <Line key={r.text} r={r} showMath={false} />)}
          </div>
        )}

        {data.requirements.length > 0 && (
          <div data-testid="why-requirements">
            <Heading tone="text-slate-400">{SECTION.requirements}</Heading>
            {data.requirements.map((r) => (
              <p key={r.label} className="text-slate-300">
                {r.satisfied ? '✓' : '✗'} {r.label} <span className="text-slate-500">({r.evidence})</span>
              </p>
            ))}
          </div>
        )}

        {data.availability && (
          <p className="text-slate-300">
            📺 {data.availability.text}
            <span className="ml-1 text-slate-500">· {data.availability.confidence}</span>
          </p>
        )}

        <p className="text-slate-400">
          Confidence: <b className="uppercase">{data.confidence.level}</b>
          {data.confidence.because[0] ? ` — ${data.confidence.because[0]}` : ''}
        </p>

        {/* THE MATHS IS KEPT, NOT SHOWN FIRST. A coefficient is what you read to
            audit the score; a reason is what you read to decide. They were at
            the same weight, which made the audit trail the loudest thing in the
            explanation. */}
        {s.hasDetails && (
          <details data-testid="scoring-details" className="rounded-md bg-black/25 px-2 py-1">
            <summary className="cursor-pointer select-none text-[11px] font-semibold text-slate-400 transition hover:text-white">
              See scoring details
            </summary>
            <div className="mt-1 space-y-0.5 text-[11px]">
              {[...s.matched.lead, ...s.matched.more, ...s.know.reasons].map((r) => (
                <Line key={`m-${r.text}`} r={r} showMath />
              ))}
            </div>
          </details>
        )}
      </div>
    </details>
  );
}
