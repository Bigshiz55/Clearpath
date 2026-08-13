import { notFound } from 'next/navigation';
import { ExampleVerdictSection, type ExampleCard } from '@/components/landing/ExampleVerdict';
import { explainVerdict } from '@/lib/verdictExplain';

/**
 * LANDING "EXAMPLE VERD1CT" harness (gated by MOBILE_HARNESS=1). Renders the
 * EXACT section the landing page renders — same `ExampleVerdictSection`, same
 * `PosterCard`, same `WhyVerdict` — with the server fetch replaced by fixed
 * data, so the visual suite can check desktop and 390px without a TMDB key.
 * The card's own per-title facts still arrive over `/api/ratings/...`, which
 * the spec intercepts. 404 in any normal build.
 */
export const dynamic = 'force-dynamic';

/**
 * A STAND-IN AT THE REAL 342×513, INLINE.
 *
 * The point of the section is that the artwork leads the card, so the harness
 * has to draw something at a true 2:3 — an empty placeholder proves nothing
 * about hierarchy. It cannot be the real TMDB URL: the harness browser has no
 * route to image.tmdb.org, so that renders as a broken-image box and the
 * screenshot lies in the other direction. A data URI is drawn from the page
 * itself, at the same dimensions `tmdbImage(..., 'w342')` returns in
 * production.
 */
const POSTER_DATA_URI =
  'data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSIzNDIiIGhlaWdodD0iNTEzIiB2aWV3Qm94PSIwIDAgMzQyIDUxMyI+PGRlZnM+PGxpbmVhckdyYWRpZW50IGlkPSJnIiB4MT0iMCIgeTE9IjAiIHgyPSIwIiB5Mj0iMSI+PHN0b3Agb2Zmc2V0PSIwIiBzdG9wLWNvbG9yPSIjMWIxYjFmIi8+PHN0b3Agb2Zmc2V0PSIxIiBzdG9wLWNvbG9yPSIjMDAwIi8+PC9saW5lYXJHcmFkaWVudD48L2RlZnM+PHJlY3Qgd2lkdGg9IjM0MiIgaGVpZ2h0PSI1MTMiIGZpbGw9InVybCgjZykiLz48dGV4dCB4PSIxNzEiIHk9IjI0MCIgZm9udC1mYW1pbHk9Ikdlb3JnaWEsc2VyaWYiIGZvbnQtc2l6ZT0iMzQiIGZpbGw9IiNlOGUyZDAiIHRleHQtYW5jaG9yPSJtaWRkbGUiPlRIRTwvdGV4dD48dGV4dCB4PSIxNzEiIHk9IjI5MCIgZm9udC1mYW1pbHk9Ikdlb3JnaWEsc2VyaWYiIGZvbnQtc2l6ZT0iNDAiIGZpbGw9IiNlOGUyZDAiIHRleHQtYW5jaG9yPSJtaWRkbGUiPkdPREZBVEhFUjwvdGV4dD48cmVjdCB4PSIxMjEiIHk9IjMyMCIgd2lkdGg9IjEwMCIgaGVpZ2h0PSIyIiBmaWxsPSIjOGE3YTRhIi8+PC9zdmc+';

/** Deliberately a real TMDB id (The Godfather) so the intercepted route path
 *  in the spec matches what production would actually request. */
const DATA: ExampleCard = {
  tmdbId: 238,
  mediaType: 'movie',
  title: 'The Godfather',
  year: 1972,
  posterUrl: POSTER_DATA_URI,
  posterPath: '/3bhkrj58Vtu7enYsRolD1fZdja1.jpg',
  quality: 88,
  explain: explainVerdict({
    matchScore: null,
    generalScore: 88,
    // What `loadExample` actually hands the section: the engine's reasons with
    // the verbatim rating-row quote already removed (see
    // lib/verdict/sourceQuotes.ts), so the screenshot shows the shipped copy.
    matchedTraits: [
      'Highly watchable — approachable format and easy to access.',
      'Legal streaming or rental options are available in your region.',
      'Backed by a large, reliable pool of audience data.',
    ],
    riskTraits: ['Long runtime (175 min) — a real time commitment.'],
    requirements: [],
    ratingSourceCount: 3,
    availability: { where: 'Paramount Plus', kind: 'included', confidence: 'likely' },
  }),
};

export default function LandingExampleHarness() {
  if (process.env.MOBILE_HARNESS !== '1') notFound();
  return (
    <div className="min-h-dvh bg-ink-950">
      <ExampleVerdictSection data={DATA} />
    </div>
  );
}
