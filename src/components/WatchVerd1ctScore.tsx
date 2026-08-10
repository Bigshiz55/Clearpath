import { Verd1ctBadge, verd1ctBadgeHeight } from './Verd1ctBadge';
import { scoreVerdict } from '@/lib/verdictVisual';

/**
 * THE WATCHVERD1CT SCORE — ONE COMPONENT, ONE IDENTITY, EVERY SURFACE.
 *
 * The proprietary score had drifted into three different objects:
 *
 *   • the CARD drew the pink Verd1ct TV mark with the number inside it
 *     (`AlgorithmScore` → `Verd1ctBadge`),
 *   • `WatchCall` drew a small pill: "🧬 84 · STREAM IT",
 *   • and `RatingsStrip`'s fallback — used wherever a surface has no
 *     mediaType/tmdbId to hand, which includes QuickLook and the detail
 *     view — drew a GREEN pill with a checkmark: "✅ 84 · STREAM IT".
 *
 * Same number, same verdict, three unrelated visual treatments, one of them in
 * the colour we use for "yes" rather than the colour we use for US. A viewer
 * has no way to learn that a green tick and a pink television are the same
 * proprietary metric — so on the card it reads as WatchVerd1ct's opinion and
 * in the drawer it reads as a generic rating, which is precisely backwards:
 * the drawer is where the score is supposed to be the hero.
 *
 * This is the only place that decision is made now. Anything showing the
 * WatchVerd1ct score renders this; nothing composes its own.
 *
 * WHAT IT DELIBERATELY DOES NOT DO: it never invents a score. Given `null` it
 * renders nothing at all (or a neutral placeholder at a fixed height when the
 * caller needs the row to hold its shape), because a fabricated number in the
 * app's own brand mark is the worst possible place to guess.
 */
export function WatchVerd1ctScore({
  score,
  /** True when the number is THIS user's DNA-weighted score, not the blend. */
  personal = false,
  /** Badge edge length in px — the rest of the block scales from it. */
  px = 42,
  /** `row` puts the call beside the mark; `stack` puts it underneath. */
  layout = 'row',
  /** Reserve the block's height before a score arrives, so nothing shifts. */
  reserveWhenEmpty = false,
  callTestId = 'wv-score-call',
  className = '',
}: {
  score: number | null;
  personal?: boolean;
  px?: number;
  layout?: 'row' | 'stack';
  reserveWhenEmpty?: boolean;
  /** Overridable so a surface that already had a stable selector for the call
   *  keeps it when it adopts this component. */
  callTestId?: string;
  className?: string;
}) {
  if (score == null) {
    if (!reserveWhenEmpty) return null;
    // THE PLACEHOLDER IS THE MARK'S REAL HEIGHT, antennas and feet included —
    // sized to `px` alone it is short by ~17px at 42, and every card in a grid
    // grew by that the moment a score landed.
    return (
      <span
        aria-hidden
        data-testid="wv-score-placeholder"
        className={`grid flex-none place-items-center rounded-[24%] bg-white/10 text-xl font-black text-slate-400 ${className}`}
        style={{ width: px, height: verd1ctBadgeHeight(px) }}
      >
        —
      </span>
    );
  }

  const v = scoreVerdict(score);
  const label = personal ? 'Your VERD1CT' : 'WatchVerd1ct';

  return (
    <div
      data-testid="wv-score"
      data-score={score}
      data-call={v.call}
      className={`flex ${layout === 'row' ? 'items-center gap-2' : 'flex-col items-start gap-1'} ${className}`}
      title={`${label} ${score}/100 — ${
        personal
          ? 'your taste blended with every rating'
          : 'every rating blended; rate a few titles and your DNA starts weighting it'
      }. It says nothing about where the title is available.`}
    >
      <Verd1ctBadge score={score} px={px} />
      <div className="min-w-0">
        {/* The label first, then the call. "STREAM IT" alone is an instruction;
            reading "Your VERD1CT" first makes it a TASTE verdict, which is the
            only thing this number has ever been. */}
        <div className="text-[10px] font-black uppercase leading-tight tracking-wide text-pink-200/80">
          {personal ? (<>Your VERD<span style={{ color: '#ff1493' }}>1</span>CT</>) : 'WatchVerd1ct'}
        </div>
        <span
          data-testid={callTestId}
          className={`mt-0.5 inline-flex items-center whitespace-nowrap rounded-md px-2 py-0.5 text-sm font-black tracking-tight ${v.visual.badge}`}
          /* TWO CLAIMS, NAMED SEPARATELY. Without this a screen reader
             announces a bare "STREAM IT", which is indistinguishable from an
             availability instruction — and this panel has never had an
             availability input. Wording is asserted by cardSeparation.test.ts. */
          aria-label={`Your recommendation verdict is ${v.call}. Current viewing availability is not confirmed by this panel — see Where to watch.`}
        >
          {v.call}
        </span>
      </div>
    </div>
  );
}
