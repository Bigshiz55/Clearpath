import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { isFounderOrAdminEmail } from '@/lib/admin';
import { resolveFounderAccess } from '@/lib/founder/gate';
import { getBuildInfo } from '@/lib/buildInfo';
import { serverEnv } from '@/lib/env';
import {
  adjudicateSubjectCentrality,
  ADJUDICATOR_VERSION,
} from '@/lib/nlu/subjectAdjudicator';
import type { SubjectRequirement, CandidateEvidence } from '@/lib/nlu/semanticEligibility';

export const dynamic = 'force-dynamic';

/**
 * FOUNDER-ONLY PRODUCTION SEMANTIC PROBE.
 *
 * This exercises THE EXACT `subjectAdjudicator` the Finder uses — the real
 * model call, on the deployed server, with the deployed configuration. It is
 * the only way to prove that the ambiguity-band resolver actually runs in
 * production (a boolean "OPENAI_API_KEY is set" is necessary but not
 * sufficient; this makes a real request and reports the classification).
 *
 * It contains NO fake classifier and NO hardcoded PASS results: every verdict
 * below comes back from the live adjudicator. The titles + expected labels are
 * DIAGNOSTIC FIXTURES only — there is no title-specific production logic. The
 * fixtures span sports and non-sports (cooking, law, journalism, surfing) so a
 * green run is evidence of a general capability, not a boxing/baseball patch.
 *
 * Founder-gated with the same hidden-404 model as the other founder routes; no
 * secret is read or returned (only a boolean "configured" + the public model
 * id). Manual, bounded (a handful of calls per click) — no recurring cost.
 */

interface Fixture {
  subject: SubjectRequirement;
  ev: CandidateEvidence;
  /** Independent, hand-authored ground truth — CENTRAL or INCIDENTAL/UNSUPPORTED. */
  expect: 'CENTRAL' | 'INCIDENTAL';
}

const R = (canonical: string, label: string, lexemes: string[]): SubjectRequirement => ({
  canonical,
  label,
  lexemes,
  strict: true,
});
const E = (title: string, overview: string, genres: string[], keywords: string[]): CandidateEvidence => ({
  title,
  overview,
  genres,
  keywords,
});

// Real public TMDB synopses + representative tags. NOT doctored.
const FIXTURES: Fixture[] = [
  // The exact reported false-negative class — a genuine subject film whose
  // metadata rarely repeats the literal word. MUST come back CENTRAL.
  { subject: R('baseball', 'Baseball', ['baseball']), expect: 'CENTRAL',
    ev: E('Moneyball', "Oakland A's general manager Billy Beane's successful attempt to assemble a baseball team on a lean budget by employing computer-generated analysis to acquire new players.", ['Drama'], ['baseball', 'based on a true story', 'sport']) },
  { subject: R('baseball', 'Baseball', ['baseball']), expect: 'CENTRAL',
    ev: E('Field of Dreams', 'An Iowa farmer hears a voice telling him to build a baseball diamond in his cornfield; he does, and the ghosts of great players emerge to play.', ['Drama', 'Fantasy'], ['baseball', 'iowa']) },
  // The original false-positive class — MUST come back INCIDENTAL.
  { subject: R('boxing', 'Boxing', ['boxing', 'boxer', 'ring', 'knockout']), expect: 'INCIDENTAL',
    ev: E('Snake Eyes', 'A corrupt cop is at an Atlantic City boxing match when the Secretary of Defense is assassinated beside him, and he uncovers a conspiracy.', ['Crime', 'Thriller'], ['conspiracy', 'assassination', 'boxing']) },
  { subject: R('boxing', 'Boxing', ['boxing', 'boxer', 'ring', 'knockout']), expect: 'INCIDENTAL',
    ev: E('Pulp Fiction', 'The lives of two mob hitmen, a boxer, a gangster and his wife intertwine in four tales of violence and redemption.', ['Thriller', 'Crime'], ['hitman', 'boxer', 'crime']) },
  // Cross-domain positives — a general capability, not sports.
  { subject: R('cooking', 'Cooking', ['cooking', 'chef', 'kitchen', 'cuisine']), expect: 'CENTRAL',
    ev: E('Chef', 'A head chef who loses his restaurant job starts a food truck to reclaim his creative promise and rebuild his life, cooking his way across the country.', ['Comedy', 'Drama'], ['chef', 'food truck', 'cooking']) },
  { subject: R('law', 'Lawyers', ['lawyer', 'attorney', 'court', 'trial', 'legal']), expect: 'CENTRAL',
    ev: E('A Few Good Men', 'A military lawyer defends two Marines in a court-martial; the sustained drama is the courtroom trial and the testimony that cracks the case.', ['Drama'], ['courtroom', 'trial', 'military lawyer']) },
  { subject: R('journalism', 'Journalism', ['journalist', 'journalism', 'reporter', 'newspaper']), expect: 'CENTRAL',
    ev: E('Spotlight', "The Boston Globe's investigative reporting team uncovers a systemic scandal; the film follows the reporting, the sourcing and the newsroom.", ['Drama', 'History'], ['journalist', 'investigation', 'newspaper']) },
  { subject: R('surfing', 'Surfing', ['surfing', 'surfer', 'surfboard', 'waves']), expect: 'CENTRAL',
    ev: E('Soul Surfer', 'A teenage surfing prodigy loses her arm in a shark attack and fights her way back to competitive surfing.', ['Drama'], ['surfing', 'shark attack', 'based on a true story']) },
];

export async function POST() {
  const headers = { 'cache-control': 'no-store' };

  let authorized = false;
  try {
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (user && isFounderOrAdminEmail(user.email)) authorized = true;
  } catch {
    // treat as unauthenticated
  }
  if (!authorized) {
    const access = await resolveFounderAccess();
    if (access.allowed) authorized = true;
  }
  if (!authorized) return new NextResponse('Not Found', { status: 404 });

  const configured = Boolean(serverEnv.openaiKey());
  const results: Array<Record<string, unknown>> = [];
  let correct = 0;
  let errors = 0;

  for (const f of FIXTURES) {
    const started = Date.now();
    const verdict = await adjudicateSubjectCentrality(f.subject, f.ev).catch(() => null);
    const latencyMs = Date.now() - started;
    if (!verdict) {
      errors++;
      results.push({
        subject: f.subject.canonical,
        title: f.ev.title,
        expected: f.expect,
        got: null,
        ok: false,
        note: configured ? 'adjudicator returned no verdict (timeout/non-200/unparseable)' : 'OPENAI_API_KEY not configured on this server',
        latencyMs,
      });
      continue;
    }
    // Score against independent ground truth. A CENTRAL fixture is correct iff
    // the model says CENTRAL (or MATERIAL — a sustained subject); an INCIDENTAL
    // fixture is correct iff the model does NOT say CENTRAL/MATERIAL.
    const modelSaysCentralish = verdict.centrality === 'CENTRAL' || verdict.centrality === 'MATERIAL';
    const ok = f.expect === 'CENTRAL' ? modelSaysCentralish : !modelSaysCentralish;
    if (ok) correct++;
    results.push({
      subject: f.subject.canonical,
      title: f.ev.title,
      expected: f.expect,
      got: verdict.centrality,
      confidence: verdict.confidence,
      reason: verdict.reason,
      source: verdict.source,
      ok,
      latencyMs,
    });
  }

  return NextResponse.json(
    {
      sha: getBuildInfo().gitSha || 'unknown',
      adjudicator: { configured, model: 'gpt-4o-mini', version: ADJUDICATOR_VERSION },
      summary: {
        total: FIXTURES.length,
        correct,
        errors,
        allCorrect: errors === 0 && correct === FIXTURES.length,
      },
      results,
    },
    { headers },
  );
}
