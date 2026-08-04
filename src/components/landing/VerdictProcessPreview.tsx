interface Stage {
  key: string;
  eyebrow: string;
  title: string;
  body: string;
}

const STAGES: Stage[] = [
  { key: 'evidence', eyebrow: '01', title: 'The Evidence', body: 'General quality, audience response, and availability.' },
  { key: 'taste', eyebrow: '02', title: 'Your Taste', body: 'What fits you specifically, learned from your ratings.' },
  { key: 'verdict', eyebrow: '03', title: 'The Verd1ct', body: 'One clear recommendation and exactly where to watch it.' },
];

/**
 * THE PROCESS, NOT A FAKE RESULT — AND ALL THREE STEPS AT ONCE.
 *
 * This used to sit beside the hero as a static mock result card: a specific
 * title, a specific score, a specific "your match" number. None of that can
 * be honest here — there is no taste profile for a visitor who hasn't told
 * the app anything yet, so a "your match: 94" badge would always be an
 * invented number wearing a real UI. TMDB/Watchmode data could make the
 * OTHER two stages real, but showing evidence and availability for a title
 * while faking the match number next to it would be worse than showing
 * neither — half-real reads as more credible than it is.
 *
 * So this shows what the engine actually DOES instead of a result it
 * produced: three short, abstract steps — no title, no score, no provider
 * name, just the shape of the process. A one-at-a-time rotating panel used
 * to sit here; it read as more interesting than a static list but hid two
 * of the three steps behind a tap most visitors never made — the opposite
 * of "easy to scan" for something that has to be understood in one look on
 * the way down the page. All three sit still, stacked, at once.
 */
export function VerdictProcessPreview() {
  return (
    <section className="border-t border-white/10" data-testid="verdict-process-preview">
      <div className="container-page py-10 sm:py-10">
        <h2 className="text-center text-sm font-black uppercase tracking-[0.16em] text-slate-500">How a Verd1ct Gets Made</h2>

        <div className="mx-auto mt-5 max-w-xl space-y-5 sm:mt-6 sm:space-y-3">
          {STAGES.map((stage) => (
            <div
              key={stage.key}
              className="flex items-center gap-3.5 rounded-2xl border border-white/10 bg-white/[0.02] p-5 sm:gap-4 sm:p-3.5"
              data-testid={`vpp-step-${stage.key}`}
            >
              <StageIcon stageKey={stage.key} />
              <div className="min-w-0">
                <div className="text-[11px] font-black uppercase tracking-wide text-slate-500">
                  {stage.eyebrow} · {stage.title}
                </div>
                <p className="mt-0.5 text-sm text-slate-300 sm:text-[15px]">{stage.body}</p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function StageIcon({ stageKey }: { stageKey: string }) {
  if (stageKey === 'evidence') {
    // Three abstract meter bars — evocative of "gathering signal", not a
    // score. No numbers: this is illustrative, never a claimed value.
    return (
      <div className="flex h-10 w-10 flex-none items-end justify-center gap-1" aria-hidden>
        <span className="h-5 w-2 rounded-full bg-emerald-400/70" />
        <span className="h-7 w-2 rounded-full bg-emerald-400/70" />
        <span className="h-4 w-2 rounded-full bg-emerald-400/70" />
      </div>
    );
  }
  if (stageKey === 'taste') {
    return (
      <div className="relative grid h-10 w-10 flex-none place-items-center" aria-hidden>
        <span className="wv-dna-halo absolute left-1/2 top-1/2 h-10 w-10 rounded-full bg-[#ff1493]/25 blur-md" />
        <span className="wv-dna-twist relative text-2xl leading-none">🧬</span>
      </div>
    );
  }
  return (
    <div className="grid h-10 w-10 flex-none place-items-center" aria-hidden>
      <span className="text-2xl leading-none">⚖️</span>
    </div>
  );
}
