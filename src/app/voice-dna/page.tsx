import { redirect } from 'next/navigation';

/**
 * RETIRED — the Taste Interview.
 *
 * The interview is no longer part of the product. The route stays only so the
 * old URL does not 404 for anyone who bookmarked it: it redirects to the Viewer
 * DNA hub, carrying a marker so that page can explain where they landed. The
 * notice is shown only to people who actually arrived this way.
 *
 * The taste-modelling code the interview was built on survives in
 * `src/lib/taste/` — it now serves imports and ordinary product feedback.
 */
export const dynamic = 'force-dynamic';

export default function RetiredInterviewRoute() {
  redirect('/app/dna?from=interview');
}
