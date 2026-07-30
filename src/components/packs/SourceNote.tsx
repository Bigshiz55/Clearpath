import type { FactConfidence } from '@/lib/packs/types';

const CONFIDENCE_LABEL: Record<FactConfidence, string> = {
  verified: 'Verified',
  reported: 'Reported',
  unconfirmed: 'Unconfirmed',
};
const CONFIDENCE_CLASS: Record<FactConfidence, string> = {
  verified: 'border-emerald-400/40 bg-emerald-500/15 text-emerald-300',
  reported: 'border-gold-400/40 bg-gold-500/15 text-gold-300',
  unconfirmed: 'border-white/15 bg-white/[0.05] text-slate-400',
};

/** A curated fact's provenance — every sourced claim in Packs shows this, never a bare statement. */
export function SourceNote({ sourceUrl, confidence }: { sourceUrl: string | null; confidence: FactConfidence }) {
  return (
    <span className="inline-flex items-center gap-1.5 text-[11px]">
      <span className={`rounded-full border px-1.5 py-0.5 font-bold uppercase tracking-wide ${CONFIDENCE_CLASS[confidence]}`}>
        {CONFIDENCE_LABEL[confidence]}
      </span>
      {sourceUrl ? (
        <a href={sourceUrl} target="_blank" rel="noopener noreferrer" className="text-slate-500 underline hover:text-slate-300">
          Source
        </a>
      ) : (
        <span className="text-slate-600">No source yet</span>
      )}
    </span>
  );
}
