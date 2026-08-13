import 'server-only';
import { getScoringData } from '@/lib/titleData';
import { buildVerdict } from '@/lib/scoring';
import { regionFor } from '@/lib/profile';
import { streamingNames } from '@/lib/services';
import { tmdbImage } from '@/lib/tmdb/image';
import { explainVerdict, type VerdictExplanation } from '@/lib/verdictExplain';
import { withoutRawSourceQuotes } from '@/lib/verdict/sourceQuotes';
import { PosterCard } from '@/components/PosterCard';
import { WhyVerdict } from '@/components/verdict/WhyVerdict';
import { EnterWatchVerd1ctCta } from './EnterWatchVerd1ctCta';
import type { MediaType } from '@/lib/types';

/**
 * PROVE THE OUTPUT BY SHOWING THE ACTUAL PRODUCT.
 *
 * ── WHAT THIS REPLACES ────────────────────────────────────────────────────
 * This section used to draw its own bespoke report: a 20px-wide poster in a
 * near-empty box, a standalone green FOR pill, prose metadata, ± evidence
 * bullets floating OUTSIDE the card, availability as a sentence ("Available on
 * fuboTV, Paramount Plus Premium"), an alternate recommendation as more prose,
 * and its own underlined link out. None of it existed anywhere else in
 * WatchVerd1ct, so the one screen whose job is "here is what you get" showed a
 * thing you would never see again after signing in.
 *
 * ── WHAT IT IS NOW ────────────────────────────────────────────────────────
 * The REAL card. `PosterCard` — the same component `/app`, search, the finder,
 * Packs and the release wall all render — with the same children it always
 * carries: `CardFacts`, `CardSynopsis`, `AlgorithmScore` (Verd1ct badge, call
 * and ratings), `WhyThisTitle`, `CardFit`, and `WhereToWatch` with its
 * `ProviderLogos` strip. The "Why this Verd1ct?" panel (`WhyVerdict`) goes in
 * the card's own `evidence` slot, exactly as `FinderUI` does it, and carries
 * why-watch ("Why it matched") and watch-out ("Things to know" / "Remaining
 * uncertainty"). There is no landing-only card markup left in this file.
 *
 * ── WHAT IS HONEST HERE, AND HOW ──────────────────────────────────────────
 * The scoring is real and runs at request time through the same pipeline
 * `askJudgeTitle` uses (`getScoringData` → `buildVerdict`).
 *
 * The PERSONALIZATION is not faked, and nothing here has to remember not to
 * fake it — the production components already refuse. An anonymous visitor has
 * no Taste DNA, so `/api/dna` answers `{ dna: null }`, and:
 *   • `AlgorithmScore` labels itself "WatchVerd1ct" instead of "Your VERD1CT"
 *     and shows the general quality number we pass as `objectiveScore`;
 *   • `CardFit` renders nothing at all rather than a disclaimer;
 *   • `WhyThisTitle` produces no "your preferences" reason, because
 *     `buildWhyReasons` will not make a claim about a viewer it knows nothing
 *     about;
 *   • `explainVerdict` is given `matchScore: null`, so the panel's own
 *     confidence line reads "No personal taste signal yet — match is generic."
 * That is the shipped anonymous state of the real card, not a demo mode.
 *
 * Fails open: no TMDB key or a network miss renders the honest fallback plus
 * the same entrance, rather than a broken section or (worse) invented data.
 */

/**
 * THE EXAMPLE IS A FIXED ENTITY, LOOKED UP BY ID — NEVER SEARCHED FOR.
 *
 * This used to run `searchTitles('The Godfather')` and take the first result
 * whose title contained "godfather". That made the landing page's identity a
 * function of TMDB's popularity ordering and of a substring match — the exact
 * class of defect the search work exists to remove. "The Godfather Part III",
 * a re-release entry, or a documentary about the film could all satisfy it, and
 * which one won could change between two requests without anything here
 * changing. There is no query to get right, because there is no query: the
 * example IS movie 238, resolved through the same `getScoringData` path every
 * other surface uses.
 */
const EXAMPLE_MEDIA_TYPE: MediaType = 'movie';
const EXAMPLE_TMDB_ID = 238; // The Godfather (1972)

/** Everything the section needs, resolved server-side. Serializable, so the
 *  harness at /dev/landing-example can render the identical section. */
export interface ExampleCard {
  tmdbId: number;
  mediaType: MediaType;
  title: string;
  year: number | null;
  posterUrl: string | null;
  posterPath: string | null;
  /** The deterministic general score — the judgment everyone gets, not a match. */
  quality: number;
  /** The production "Why this Verd1ct?" payload. */
  explain: VerdictExplanation;
}

async function loadExample(): Promise<ExampleCard | null> {
  try {
    const region = regionFor(null);
    const { meta, providers } = await getScoringData(EXAMPLE_MEDIA_TYPE, EXAMPLE_TMDB_ID, region);
    const report = buildVerdict({
      meta,
      providers,
      // There is no visitor taste data here, and `hasSignal: false` keeps the
      // engine from pretending otherwise. Only `report.general` is read below.
      personal: { label: 'General Verdict', rules: [], likedFranchiseIds: [], collectionId: null, hasSignal: false },
    });

    const quality = Math.round(report.general.standardScore ?? report.general.score);
    const where = providers?.available ? (streamingNames(providers.options)[0] ?? null) : null;
    // "Well received by audiences (8.7/10 (23,328 votes))." is the engine
    // quoting a rating row verbatim, and `explainVerdict` states the same fact
    // below it in one clean sentence. See lib/verdict/sourceQuotes.ts — this
    // removes the duplicate, it does not rewrite anything.
    const sources = report.general.sources;
    const reasonsFor = withoutRawSourceQuotes(report.reasonsFor, sources);
    const reasonsAgainst = withoutRawSourceQuotes(report.reasonsAgainst, sources);

    return {
      tmdbId: EXAMPLE_TMDB_ID,
      mediaType: EXAMPLE_MEDIA_TYPE,
      title: meta.title,
      year: meta.year,
      posterUrl: tmdbImage(meta.posterPath, 'w342'),
      posterPath: meta.posterPath ?? null,
      quality,
      explain: explainVerdict({
        // NO PERSONAL MATCH. `explainVerdict` states the absence in its own
        // words instead of this section inventing a number for a stranger.
        matchScore: null,
        generalScore: quality,
        matchedTraits: reasonsFor.slice(0, 4),
        riskTraits: reasonsAgainst.slice(0, 3),
        // Nobody asked for anything — an anonymous visitor set no constraints,
        // so there are no checked requirements to report.
        requirements: [],
        ratingSourceCount: sources.filter((s) => s.available).length,
        // TMDB-listed is "likely", never "verified" — the same claim the
        // finder's own cards are allowed to make. See finderExplain.ts.
        availability: where ? { where, kind: 'included', confidence: 'likely' } : null,
      }),
    };
  } catch {
    return null;
  }
}

/**
 * The section itself, given already-resolved data. Split out from the fetch so
 * the visual harness can render the exact production markup without a TMDB key.
 */
export function ExampleVerdictSection({ data }: { data: ExampleCard | null }) {
  return (
    <section className="border-t border-white/10" data-testid="example-verdict">
      <div className="container-page py-8 sm:py-10">
        <h2 className="text-center text-sm font-black uppercase tracking-[0.16em] text-slate-500">Example Verd1ct</h2>
        <p className="mx-auto mt-2 max-w-sm text-center text-sm text-slate-400">
          A real card, scored live — and the same one you land on inside.
        </p>

        {!data ? (
          <p className="mx-auto mt-4 max-w-md text-center text-sm text-slate-500" data-testid="example-verdict-fallback">
            Live example unavailable right now — Enter WatchVerd1ct to see your recommendations.
          </p>
        ) : (
          <>
            {/* ONE GRID CELL, NOT A BANNER. The old section stretched a single
                card across the full page and filled the difference with black.
                A production card is a column in `poster-grid` (280px floor,
                see globals.css), so on a laptop it is drawn at that width and
                nothing else changes; below `sm` it is left full-width, which
                is exactly what a phone card is in the app — `.wv-card` turns
                it into the poster-beside-text row on its own. */}
            <div className="mx-auto mt-5 w-full sm:max-w-[320px]" data-testid="example-verdict-card">
              <PosterCard
                href={`/app/title/${data.mediaType}/${data.tmdbId}`}
                tmdbId={data.tmdbId}
                mediaType={data.mediaType}
                title={data.title}
                year={data.year}
                posterUrl={data.posterUrl}
                posterPath={data.posterPath}
                // The general judgment, for the one surface where "no DNA" is
                // the truth rather than a loading state.
                objectiveScore={data.quality}
                // FOR / AGAINST / SAVE / W ARE OFF, VIA THE CARD'S OWN OPT-OUT.
                // Every one of them writes to a signed-in viewer's DNA and
                // watchlist. Rendering them to a visitor with no account would
                // be four controls that answer a tap with an error toast — so
                // the card is shown in its read-only state (`overlay={null}`,
                // a documented PosterCard mode) and the entrance below is the
                // action. Nothing is redrawn to achieve that.
                overlay={null}
                evidence={<WhyVerdict data={data.explain} />}
              />
            </div>

            {/* THE HONEST LABEL FOR WHAT THE CARD IS SHOWING. Section copy,
                not card chrome: the card says "WatchVerd1ct" rather than "Your
                VERD1CT" on its own, and this says why. */}
            <p className="mx-auto mt-3 max-w-sm text-center text-xs text-slate-500" data-testid="example-verdict-anon">
              The general Verd1ct. Build your Taste DNA and it becomes your Match.
            </p>
          </>
        )}

        {/* ONE TRANSITION, ONE BUTTON — the site's primary entrance component,
            not a second button language. */}
        <div className="mt-7 flex flex-col items-center gap-3 text-center">
          <p className="text-base font-semibold text-slate-200 sm:text-lg" data-testid="example-verdict-transition">
            This is the generic verdict. Yours gets personal.
          </p>
          <EnterWatchVerd1ctCta testId="example-verdict-cta" />
        </div>
      </div>
    </section>
  );
}

export async function ExampleVerdict() {
  return <ExampleVerdictSection data={await loadExample()} />;
}
