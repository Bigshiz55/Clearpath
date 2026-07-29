import { StartLiveCourt } from '@/components/StartLiveCourt';

/**
 * THE ONE LIVE COURT BLOCK. The landing page used to describe Live Court
 * twice — this intro panel AND a second card below it with near-identical
 * copy ("everyone joins from their own phone" appeared in both), each with
 * its own way in. One block, two sentences, one button.
 */
export function CourtIntro({ big = false }: { big?: boolean }) {
  return (
    <section
      data-testid="court-intro"
      className={`rounded-2xl border border-brand-400/30 bg-brand-500/[0.08] ${big ? 'p-5 sm:p-6' : 'p-4'}`}
    >
      <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-brand-200">Live Court</p>
      <h2 className={`mt-1 font-black tracking-tight text-white ${big ? 'text-2xl sm:text-3xl' : 'text-lg'}`}>
        Decide together, in one round
      </h2>
      <p className={`mt-2 text-slate-300 ${big ? 'text-sm sm:text-base' : 'text-xs'}`}>
        Everyone joins from their own phone and reacts to the same blind shortlist. WatchVerd1ct
        scores each title for the whole room and returns one Verd1ct, with vetoes protected.
      </p>
      <div className="mt-4">
        <StartLiveCourt />
      </div>
    </section>
  );
}
