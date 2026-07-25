/**
 * The Court intro panel. Replaces the former mascot ("Judge Verity") entirely:
 * no character, no owl, no gavel — WatchVerd1ct itself is the intelligence.
 * Modern, premium and explanatory, using light Verd1ct terminology only.
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
        Everyone joins from their own phone and reacts to the same shortlist. WatchVerd1ct scores
        each title for every person, protects a real objection, and returns one Verd1ct with its
        reasoning shown.
      </p>
      <ul className={`mt-3 flex flex-wrap gap-x-4 gap-y-1 text-slate-400 ${big ? 'text-sm' : 'text-xs'}`}>
        <li>Scored for everyone, not averaged</li>
        <li>Two vetoes each</li>
        <li>Hidden votes until you choose</li>
      </ul>
    </section>
  );
}
