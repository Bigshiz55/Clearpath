import { Film } from 'lucide-react';
import { Verd1ctBadge } from '@/components/Verd1ctBadge';
import { scoreVerdict } from '@/lib/verdictVisual';

/**
 * WHAT THE PRODUCT ACTUALLY LOOKS LIKE — not a stock illustration.
 *
 * A first-time visitor was being told "one clear verdict, matched to your
 * taste, with exactly where to watch it" without ever seeing what that means.
 * This is a static mock of a real result card, built from the SAME pieces a
 * real one is: `Verd1ctBadge` is the exact component every scored title on
 * the site renders, and `scoreVerdict` is the exact function that turns a
 * score into the "Watch It" pill and its color. Only the surrounding data
 * (title, score, reason, provider) is fixed instead of fetched — clearly
 * labeled EXAMPLE so nobody mistakes a marketing mock for a live result.
 */
export function HeroVerdictPreview() {
  const generalScore = 78;
  const general = scoreVerdict(generalScore);
  const personal = 94;

  return (
    <div className="card wv-tile relative overflow-hidden bg-ink-950/85" data-testid="hero-verdict-preview">
      <span className="absolute right-3 top-3 z-10 rounded-md bg-black/70 px-2 py-0.5 text-[10px] font-black uppercase tracking-wide text-slate-300 backdrop-blur-sm">
        Example
      </span>

      <div className="flex gap-4 p-4 sm:p-5">
        {/* The app's own "no poster" art — same gradient + film glyph every
            real card falls back to when TMDB has no image. Reusing it here
            (instead of a new illustration) is the point: this is the app's
            visual language, not marketing art. */}
        <div className="relative aspect-[2/3] w-24 flex-none overflow-hidden rounded-xl bg-gradient-to-br from-ink-700 to-ink-850 sm:w-28">
          <svg viewBox="0 0 24 24" className="absolute inset-0 m-auto h-9 w-9 text-slate-600" fill="none" aria-hidden>
            <rect x="3" y="4" width="18" height="16" rx="2" stroke="currentColor" strokeWidth="1.5" />
            <path d="m7 4 2 4m4-4 2 4m-9 8 4-4 3 3 2-2 4 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </div>

        <div className="min-w-0 flex-1">
          {/* pr- clears the absolutely-positioned EXAMPLE tag in the corner —
              without it the title's first line ran underneath the tag on
              narrow widths. */}
          <div className="pr-14 text-base font-bold leading-snug text-white">The Lockwood Job</div>
          <div className="mt-0.5 flex items-center gap-1.5 text-xs text-slate-400">
            <span className="rounded bg-white/10 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-slate-300">Movie</span>
            <span>2024 · Heist thriller</span>
          </div>

          {/* GENERAL VERDICT + YOUR PERSONAL MATCH, side by side — the two
              distinct scores the proof points above the fold promise. */}
          <div className="mt-3 flex items-center gap-3">
            <div className="flex items-center gap-1.5">
              <Verd1ctBadge score={generalScore} px={34} tv={false} title={`General Verdict — ${generalScore}`} />
              <div className="leading-tight">
                <div className="text-[10px] font-black uppercase tracking-wide text-slate-400">General</div>
                <div className={`text-xs font-black ${general.visual.text}`}>{general.call}</div>
              </div>
            </div>
            <div className="flex items-center gap-1.5">
              <Verd1ctBadge score={personal} px={34} title={`Your VERD1CT — ${personal}`} />
              <div className="leading-tight">
                <div className="text-[10px] font-black uppercase tracking-wide text-pink-200/80">Your match</div>
                <div className="text-xs font-black text-pink-100">Strong fit</div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="space-y-2 border-t border-white/10 px-4 py-3 sm:px-5">
        <p className="text-[13px] leading-snug text-emerald-200/90">
          <span aria-hidden>🧬 </span>
          You rate slow-burn heist thrillers highly — this fits.
        </p>
        <div className="flex items-center gap-1.5">
          <Film size={13} className="flex-none text-slate-500" aria-hidden />
          <span className="text-xs text-slate-400">Streaming now:</span>
          <span className="inline-flex items-center rounded-md border border-white/10 bg-white/5 px-2 py-0.5 text-xs font-semibold text-slate-200">
            Netflix
          </span>
        </div>
      </div>
    </div>
  );
}
