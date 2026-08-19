#!/usr/bin/env node
/**
 * TASTE DNA PROOF — AGAINST A REAL DEPLOYMENT, AS A REAL SIGNED-IN USER.
 *
 * Phase 1 made Ask order its answers by the reader's Taste DNA instead of by a
 * user-independent quality score. Every in-process test for that mocks the
 * Supabase reads, so none of them can say whether a DEPLOYED build, holding a
 * REAL account's stored DNA, actually returns a different order. That is the
 * only question this script asks.
 *
 * It imports no application module. The evidence is whatever `/api/ask`
 * returns over HTTP.
 *
 * ── WHY NO DIAGNOSTIC ENDPOINT WAS ADDED ─────────────────────────────────
 * `/api/ask` already spreads the whole `FinderItem`, so each result carries
 * `matchScore` — the objective score, which personalization never modifies —
 * next to `personal.rankScore`, which is what the list is now sorted by, and
 * `personal.evidence`, which names what moved it. Before and after arrive in
 * the SAME response. A new founder route would have added production surface
 * to read fields the product already returns.
 *
 * ── THE OBJECTIVE ORDER IS NOT INVENTED HERE ─────────────────────────────
 * Sorting by `matchScore` descending is not a comparator this script made up:
 * it is verbatim the comparator `finder.ts` used before Phase 1
 * (`b.matchScore - a.matchScore`). So "objective rank" is what this exact
 * deployment would have returned with the feature absent.
 *
 * ── SECRETS ──────────────────────────────────────────────────────────────
 * The login secret and the session cookies are held in memory, never printed,
 * never interpolated into a logged URL. Only cookie COUNTS are logged.
 */

import { PROTECTION, bypassHeaders, explainProtection, makeRedactor, request } from './protection.mjs';

const BASE_URL = process.env.BASE_URL;
const EXPECT_SHA = process.env.EXPECT_SHA ?? '';
const LOGIN_SECRET = process.env.PREVIEW_TEST_LOGIN_SECRET ?? '';
const BYPASS = process.env.VERCEL_AUTOMATION_BYPASS_SECRET ?? '';

const redact = makeRedactor([LOGIN_SECRET, BYPASS]);
const headers = (extra = {}) => bypassHeaders(BYPASS, { 'content-type': 'application/json', ...extra });

/** Infrastructure failure — NOT a product verdict. Exit 2, always distinct. */
function infra(msg, hint) {
  console.error(`::error::INFRASTRUCTURE — ${redact(msg)}`);
  if (hint) console.error(`  ${redact(hint)}`);
  process.exit(2);
}
function fail(msg) {
  console.error(`::error::PROOF FAILED — ${redact(msg)}`);
  process.exitCode = 1;
}

/** The three queries the closure asked for. */
/**
 * The deployed language contract. Each case carries what the DEPLOYED response
 * must show, so this proves behaviour rather than merely exercising a route.
 *
 * `expect` is checked against the route's own echoed interpretation (`query`,
 * `interpretation`, `kind`) and the returned items — never against parser
 * internals, which is the whole point of running it over HTTP.
 */
const QUERIES = [
  { id: 'Q1', text: 'Looking for a good thriller', kind: 'broad taste-sensitive', expect: { minItems: 2 } },
  { id: 'Q2', text: 'movies about chess', kind: 'subject', expect: { minItems: 2, media: 'movie' } },
  { id: 'Q3', text: 'three Sylvester Stallone movies', kind: 'hard constraint', expect: { exactItems: 3, media: 'movie' } },
  { id: 'Q4', text: 'another boxing movie', kind: 'unframed + qualifier', expect: { minItems: 2, media: 'movie' } },
  { id: 'Q5', text: 'another courtroom drama', kind: 'genre-head qualifier', expect: { minItems: 2 } },
  { id: 'Q6', text: "a thriller that isn't slow", kind: 'contracted negation', expect: { minItems: 2 } },
  { id: 'Q7', text: 'My wife likes comedies.', kind: 'third-party statement', expect: { notASearch: true } },
  { id: 'Q8', text: 'a movie my wife and I would both like', kind: 'companion request', expect: { minItems: 2, media: 'movie' } },
  /* A COMPARISON IS A ROUND TRIP WHEN ITS ANCHOR IS AMBIGUOUS. "Taken" names a
     2008 film, a 2017 series and a 2002 miniseries; the critic layer refuses to
     guess between them and asks one question instead. Contracting this on "at
     least 1 item in the first response" would have scored that refusal as a
     failure and pressured the product into guessing. So the contract is the
     WHOLE exchange: answer immediately when the anchor is unambiguous, or ask
     one question with REAL options and deliver results once it is answered. */
  { id: 'Q9', text: 'I want something darker than Taken.', kind: 'comparative anchor + axis', expect: { minItems: 1, comparativeRoundTrip: true, mustDifferFromFloor: true } },
  { id: 'Q10', text: 'I had a burrito and want something fun tonight.', kind: 'multi-clause', expect: { minItems: 2 } },
  { id: 'Q11', text: 'I like Yellowstone. What should I watch?', kind: 'cross-clause taste', expect: { minItems: 2 } },
  { id: 'Q12', text: 'I want a thriller, nothing scary', kind: 'trailing negative fragment', expect: { minItems: 2 } },
  /* DID THE COMPARISON ACTUALLY SHAPE THE ANSWER? Q9 proves the round trip
     completes; completing is not the same as mattering. A comparative request
     that quietly degrades to the platform's popularity head is the failure the
     critic layer exists to prevent, and it looks identical to success from a
     result count. This anchor is unambiguous, so no question intervenes, and
     the answer is measured against the floor this same deployment returns for
     a request that constrains nothing. */
  { id: 'Q13', text: 'I want something darker than Whiplash.', kind: 'comparative, the answer must differ', expect: { minItems: 2, comparativeRoundTrip: true, mustDifferFromFloor: true } },

  /* ── TITLE vs DISCOVERY OWNERSHIP ──────────────────────────────────────
     The defect these exist to stop: `/api/ask` re-reading a discovery
     sentence with the legacy title extractor, which strips the media noun
     and looks up a phantom title. Deployed, that returned zero for "another
     boxing movie". These are the same grammar with different subjects, so a
     regression cannot hide behind one lucky catalog gap. */
  { id: 'Q14', text: 'a chess movie', kind: 'ownership · determiner + subject + medium', expect: { minItems: 1, media: 'movie' } },
  { id: 'Q15', text: 'another western', kind: 'ownership · determiner + genre', expect: { minItems: 2 } },
  { id: 'Q16', text: 'two space movies', kind: 'ownership · count + subject + medium', expect: { exactItems: 2, media: 'movie' } },
  /* …and the other half of the rule: a sentence that really does name a
     title must still reach the title machinery and come back as a VERDICT,
     not as a discovery grid. A fence that silenced these would have traded
     one defect for a worse one. */
  { id: 'Q17', text: 'Rocky', kind: 'ownership control · bare title', expect: { verdict: true } },
  { id: 'Q18', text: 'Snake Eyes', kind: 'ownership control · bare title', expect: { verdict: true } },
  { id: 'Q19', text: 'Show me The Lego Movie', kind: 'ownership control · canonical lookup', expect: { verdict: true } },

  /* ── STATEMENT vs REQUEST ──────────────────────────────────────────────
     Q7 pins the bare statement. This pins the boundary's other side: the
     same companion taste, followed by an actual request, must search. */
  { id: 'Q20', text: 'My wife likes comedies. What should we watch?', kind: 'statement + request', expect: { minItems: 2 } },

  /* ── THE COMPARISON MUST BE ABOUT WHAT WAS ASKED ───────────────────────
     Q13 asks the SAME anchor to move the OTHER way. If the stated axis is
     doing any work at all the two answers cannot be the same list, and no
     hard-coded titles are needed to say so. This is the sharpest available
     test of the authority repair: `plan.authority` describes the anchor, and
     both of these share an anchor — only the axis differs. */
  { id: 'Q21', text: 'I want something lighter than Whiplash.', kind: 'comparative, opposite axis', expect: { minItems: 2, comparativeRoundTrip: true, differsFrom: 'Q13' } },

  /* ── VOCABULARY THAT WAS HALF-COVERED ─────────────────────────────────
     "recommend thrillers" bound NO genre (the plural was missing from the
     genre vocabulary) and bound the SUBJECT "recommend" (the verb was missing
     from the qualifier guard). Both were invisible because the singular and
     the other verbs worked. */
  { id: 'Q22', text: 'recommend thrillers', kind: 'vocabulary · plural genre + bare imperative', expect: { minItems: 2 } },

  /* ── A NEGATED PACE WORD IS A PACE ────────────────────────────────────
     "nothing that drags" was recorded with the right polarity and then
     executed as a keyword exclusion on a word almost nothing is tagged with,
     so the request ran as a bare genre browse. These two ask the SAME genre
     for OPPOSITE ends of the pace band; if the veto reaches execution they
     cannot be the same list. */
  { id: 'Q23', text: 'I want a thriller that drags', kind: 'pace · stated slow', expect: { minItems: 2 } },
  { id: 'Q24', text: 'I want a thriller, nothing that drags', kind: 'pace · vetoed slow', expect: { minItems: 2, differsFrom: 'Q23' } },

  /* ── THE CONVERSATIONAL FRONT DOOR, AS PEOPLE ACTUALLY TYPE ───────────
     Not new mechanisms — the same ones, reached through sentences that carry
     background, a stated preference, someone else's opinion, or an explicit
     disambiguating cue. A hand-authored expected answer would prove nothing
     here; what is checked is that the real path still produces an answer of
     the right SHAPE. */
  { id: 'Q25', text: 'I liked Rocky a few weeks ago. I’m looking for another boxing movie.', kind: 'NL · taste + request', expect: { minItems: 2, media: 'movie' } },
  { id: 'Q26', text: 'I had a beef burrito for dinner and I want a smart thriller.', kind: 'NL · background + request', expect: { minItems: 2 } },
  /* THE CUE HAS TO REACH THE ANSWER, not merely produce one. "some verdict came
     back" would pass even if the medium and the year were thrown away, which is
     precisely the defect: `AnchorRequest.year` existed for two releases and
     nothing filled it. So the contract names the field the cue governs. */
  { id: 'Q27', text: 'the Taken movie', kind: 'NL · explicit medium cue', expect: { verdict: { mediaType: 'movie' } } },
  { id: 'Q28', text: 'Taken 2008', kind: 'NL · explicit year cue', expect: { verdict: { year: 2008 } } },
  { id: 'Q29', text: 'anything except horror', kind: 'NL · bare exclusion', expect: { minItems: 2 } },
  { id: 'Q30', text: 'my wife hated it but I liked it', kind: 'NL · third-party opinion, not the user’s taste', expect: { notASearch: true } },
];

/** Cross-query contracts, evaluated once every answer is in hand. */
const MAX_SHARED_HEAD = 2;

const key = (i) => `${i.mediaType}:${i.id}`;
const median = (xs) => {
  const s = [...xs].sort((a, b) => a - b);
  const m = s.length >> 1;
  return s.length % 2 ? s[m] : Math.round((s[m - 1] + s[m]) / 2);
};
const pct = (xs, p) => {
  const s = [...xs].sort((a, b) => a - b);
  return s[Math.min(s.length - 1, Math.max(0, Math.ceil((p / 100) * s.length) - 1))];
};

/** Request-fit: the channel that orders by how squarely a title answers the ask. */
function relevanceOf(item) {
  const r = item.relevance;
  if (!r) return { participated: false, nudge: 0, reason: null };
  return { participated: Boolean(r.participated), nudge: r.nudge ?? 0, reason: r.reason ?? null };
}

function evidenceOf(item) {
  const p = item.personal;
  if (!p) return { participated: false, note: 'no personal field on the item' };
  const ev = p.evidence ?? {};
  const names = (list) => (list ?? []).map((r) => r.label ?? r.key ?? r.axis ?? JSON.stringify(r)).slice(0, 3);
  return {
    participated: Boolean(p.participated),
    personalScore: p.personalScore ?? null,
    rankScore: p.rankScore ?? null,
    dimensionMatch: ev.dimensionMatch ?? null,
    preferenceNudge: ev.preferenceNudge ?? 0,
    confidence: ev.confidence ?? 0,
    reasons: names(ev.reasons),
    concerns: names(ev.concerns),
  };
}

async function main() {
  if (!BASE_URL) infra('BASE_URL is not set.');
  console.log(`Taste DNA proof against ${BASE_URL}`);

  const version = await request(`${BASE_URL}/api/version`, { headers: headers() });
  if (!version.ok) {
    infra(`/api/version unreachable: ${explainProtection({ verdict: PROTECTION.TRANSPORT, bypassSent: Boolean(BYPASS), transport: version.error }, redact)}`);
  }
  const v = await version.res.json().catch(() => ({}));
  console.log(`  deployment sha=${v.sha ?? 'unknown'} env=${v.vercelEnv ?? 'unknown'} branch=${v.branch ?? 'unknown'}`);
  if (EXPECT_SHA && v.sha && !EXPECT_SHA.startsWith(v.sha) && !v.sha.startsWith(EXPECT_SHA)) {
    infra(`deployment sha ${v.sha} does not match the expected head ${EXPECT_SHA}. Testing the wrong build proves nothing.`);
  }

  if (!LOGIN_SECRET) infra('PREVIEW_TEST_LOGIN_SECRET is not set — /api/ask is 401 without a real cookie session.');
  const login = await request(`${BASE_URL}/api/preview-test-login`, {
    method: 'POST',
    headers: headers({ 'x-preview-test-secret': LOGIN_SECRET }),
  });
  if (!login.ok) infra('preview login did not complete.');
  if (login.status === 404) {
    infra(
      'preview login answered 404.',
      'That route is inert on production by design (VERCEL_ENV), and 404s when its test identity is unconfigured. A production run of this proof needs a founder/admin session instead.',
    );
  }
  if (login.status < 200 || login.status >= 300) infra(`preview login failed with ${login.status}.`);
  const rawCookies = login.res.headers.getSetCookie?.() ?? [];
  const cookie = rawCookies.map((c) => c.split(';')[0]).join('; ');
  if (!cookie) infra('preview login set no cookies.');
  console.log(`  authenticated with ${rawCookies.length} session cookie(s) (values not logged)`);

  const ask = async (text, extra = {}) => {
    const started = Date.now();
    const res = await request(`${BASE_URL}/api/ask`, {
      method: 'POST',
      headers: headers({ cookie }),
      body: JSON.stringify({ text, ...extra }),
      timeoutMs: 90_000,
    });
    const ms = Date.now() - started;
    if (!res.ok) infra(`/api/ask did not complete for "${text}".`);
    if (res.status === 401) infra('/api/ask returned 401 — the session did not reach the route.');
    if (res.status >= 500) infra(`/api/ask returned ${res.status}.`);
    const body = await res.res.json().catch(() => ({}));
    return { ms, body };
  };

  const report = { sha: v.sha ?? null, env: v.vercelEnv ?? null, at: new Date().toISOString(), queries: [] };
  let anyParticipation = false;
  /** id → the keys of the answer this deployment actually gave, in order. */
  const answerHead = new Map();
  /** id → what the deployment SAID about that answer, when it said anything. */
  const answerNote = new Map();

  /* WHY, NOT JUST HOW MANY.
     The first run of this harness reported "Q4 → 0 items" and stopped there,
     which is a symptom, not evidence: zero can mean the subject never resolved
     to a catalog keyword, or that discovery returned nothing, or that every
     candidate was judged non-central. `/api/ask` already returns the whole
     funnel (`diagnostics`) and the query it actually executed, so a failing
     case can name its own cause instead of sending someone back to the source
     to guess. Printed for any query that returns nothing or misses its
     contract — never for a healthy one, which would just be noise. */
  const explainShortfall = (body) => {
    const d = body.diagnostics ?? null;
    const q = body.query ?? {};
    console.log(`  WHY: kind=${body.kind ?? '?'}`);
    if (body.relaxed) console.log(`    relaxed: ${body.relaxed}`);
    const interp = Array.isArray(body.interpretation) ? body.interpretation : [];
    for (const line of interp.slice(0, 4)) console.log(`    interpretation: ${line}`);
    console.log(
      `    executed query: media=${q.mediaType ?? '?'} genreIds=${JSON.stringify(q.genreIds ?? [])} ` +
      `subject=${q.subjectLabel ?? 'none'} strict=${q.subjectStrict ?? false} ` +
      `subjectKeywordIds=${JSON.stringify(q.subjectKeywordIds ?? [])} ` +
      `subjectLexemes=${JSON.stringify(q.subjectLexemes ?? [])} ` +
      `castIds=${JSON.stringify(q.castIds ?? [])} finalCount=${q.finalCount ?? null}`,
    );
    if (!d) {
      console.log('    no diagnostics on the response — this arm does not report a funnel.');
      return;
    }
    console.log(
      `    funnel: candidates=${d.candidateCount} → deterministic=${d.deterministicEligibleCount} → ` +
      `semanticEvaluated=${d.semanticEvaluatedCount ?? '-'} → subjectCentral=${d.centralSubjectEligibleCount} → ` +
      `quality=${d.qualityEligibleCount} → returned=${d.finalReturnedCount}`,
    );
    const eva = Array.isArray(d.evaluations) ? d.evaluations : [];
    if (eva.length > 0) {
      console.log(`    ${eva.length} candidate verdict(s); the 8 strongest:`);
      for (const e of eva.slice(0, 8)) {
        console.log(
          `      ${String(e.title).slice(0, 30).padEnd(31)} ${e.eligible ? 'PASS' : 'FAIL'} ` +
          `${String(e.centrality).padEnd(11)} conf=${String(e.confidence).padStart(3)}  ${e.rejectionReason ?? e.evidence ?? ''}`,
        );
      }
    }
  };

  /** Answer a clarification the way the product's own UI answers it, and prove
   *  the comparison then completes. Returns a list of failures (empty = good). */
  const proveComparativeRoundTrip = async (body, ask2) => {
    const problems = [];
    let settled = [];
    let disclosure = [];
    let criticDiag = null;
    if (body.kind !== 'clarify') {
      problems.push(`expected either results or one clarifying question, got kind=${body.kind ?? '?'}`);
      return { problems, settled, disclosure, criticDiag };
    }
    const options = Array.isArray(body.comparisonOptions) ? body.comparisonOptions : [];
    const envelope = body.pendingComparison ?? null;
    console.log(`  ROUND TRIP step 1 — asked: ${JSON.stringify(body.clarify ?? null)}`);
    console.log(`    ${options.length} real option(s): ${options.slice(0, 4).map((o) => `${o.title}${o.year ? ` (${o.year})` : ''} [${o.mediaType} ${o.tmdbId}]`).join(' · ') || 'none'}`);
    if (options.length === 0) problems.push('the clarification offered no options, so it cannot be answered');
    if (!envelope) problems.push('no pendingComparison envelope — the original request cannot be resumed');
    for (const o of options) {
      if (typeof o.tmdbId !== 'number' || !o.mediaType || !o.title) {
        problems.push(`an option is not a real catalog identity: ${JSON.stringify(o)}`);
        break;
      }
    }
    if (problems.length > 0) return { problems, settled, disclosure, criticDiag };
    const chosen = options[0];
    const spokenAs = envelope?.pending?.[0]?.spokenAs ?? chosen.title;
    const resumed = await ask2(envelope?.text ?? undefined, {
      pendingComparison: envelope,
      comparisonChoice: { spokenAs, tmdbId: chosen.tmdbId, mediaType: chosen.mediaType },
    });
    const back = Array.isArray(resumed.body.items) ? resumed.body.items : [];
    settled = back;
    disclosure = Array.isArray(resumed.body.interpretation) ? resumed.body.interpretation : [];
    criticDiag = resumed.body.diagnostics?.critic ?? null;
    console.log(`  ROUND TRIP step 2 — answered "${spokenAs}" → ${chosen.title}: ${back.length} item(s) · ${resumed.ms}ms · kind=${resumed.body.kind ?? '?'}`);
    for (const i of back.slice(0, 5)) console.log(`      ${String(i.title).slice(0, 34).padEnd(35)} match=${i.matchScore}`);
    if (back.length === 0) {
      problems.push('the settled comparison still returned nothing');
      explainShortfall(resumed.body);
    }
    if (criticDiag) {
      console.log(`    critic: ${criticDiag.candidates} candidate(s), ${criticDiag.fingerprinted} fingerprinted, eligible=${criticDiag.eligible}, applied=${criticDiag.applied}, authority=${criticDiag.authority}`);
    }
    for (const line of disclosure) console.log(`    said: ${line}`);
    return { problems, settled, disclosure, criticDiag };
  };

  /* THE FLOOR — what this deployment returns when the request constrains
     nothing. Measured, never hard-coded: a list of famous titles written into
     this file would rot, and would also be a judgement about which films are
     "generic" rather than an observation about this build. */
  const floorRes = await ask('recommend something');
  const floorItems = Array.isArray(floorRes.body.items) ? floorRes.body.items : [];
  const floor = new Set(floorItems.slice(0, 8).map(key));
  console.log(`\n──────── FLOOR (an unconstrained ask): ${floor.size} title(s)`);
  console.log(`  ${floorItems.slice(0, 8).map((i) => i.title).join(' · ') || 'none'}`);

  for (const q of QUERIES) {
    console.log(`\n──────── ${q.id} (${q.kind}): "${q.text}"`);
    const { ms, body } = await ask(q.text);
    const items = Array.isArray(body.items) ? body.items : [];
    if (items.length === 0) {
      console.log(`  no items returned (kind=${body.kind ?? '?'}) — nothing to order.`);
      /* For a third-party STATEMENT that is the correct outcome: "My wife likes
         comedies." is not an order, and a deployment that answers it with a
         comedy grid has misread it. */
      if ((q.expect ?? {}).notASearch) console.log('  CONTRACT not-a-search: PASS (no result set)');
      /* A NAMED TITLE COMES BACK AS A VERDICT, NOT A GRID. `kind: 'title'`
         carries `verdict` + `alternatives` rather than `items`, so an empty
         `items` is the CORRECT shape here — and the ownership fence would be
         a regression, not a fix, if it silenced these. */
      else if ((q.expect ?? {}).verdict) {
        const v = body.verdict ?? null;
        const want = (q.expect ?? {}).verdict;
        const shape = body.kind === 'title' && v != null && typeof v.title === 'string';
        /* An object expectation names the FIELDS the sentence's cues govern.
           `true` keeps the original contract: a named title comes back as a
           verdict rather than a grid. */
        const cues = typeof want === 'object'
          ? Object.entries(want).filter(([k, expected]) => v?.[k] !== expected)
          : [];
        const ok = shape && cues.length === 0;
        const cueNote = typeof want === 'object'
          ? ` · cues ${cues.length === 0 ? 'honoured' : `IGNORED: ${cues.map(([k, e]) => `${k} wanted ${e}, got ${JSON.stringify(v?.[k])}`).join('; ')}`}`
          : '';
        console.log(`  CONTRACT a verdict on the named title: ${ok ? `PASS (${v?.title}${v?.year ? ` (${v.year})` : ''} — ${v?.primaryCall ?? '?'} at ${v?.matchScore ?? '?'})${cueNote}` : `FAIL (kind=${body.kind ?? '?'})${cueNote}`}`);
        if (!ok) {
          explainShortfall(body);
          fail(
            shape
              ? `${q.id} "${q.text}": the verdict ignored a cue the sentence carried — ${cues.map(([k, e]) => `${k} wanted ${e}, got ${JSON.stringify(v?.[k])}`).join('; ')}.`
              : `${q.id} "${q.text}": a named title did not come back as a verdict.`,
          );
        }
      }
      else if ((q.expect ?? {}).comparativeRoundTrip) {
        const { problems, settled, disclosure, criticDiag } = await proveComparativeRoundTrip(body, ask);
        console.log(`  CONTRACT comparative round trip: ${problems.length === 0 ? 'PASS' : 'FAIL'}`);
        for (const pr of problems) fail(`${q.id} "${q.text}": ${pr}`);
        /* A comparison that COMPLETED still has to have MATTERED. The floor
           check belongs on whichever response finally carried items, which for
           an ambiguous anchor is the settled one. */
        /* DIFFER, OR SAY WHY NOT. A comparison whose candidates carry no
           cached fingerprints CANNOT move the order — GC6 is cache-only by
           design and a title the classifier has not reached contributes
           nothing. That is a coverage fact, not a bug in the comparison. What
           is a bug is serving the quality order as though the comparison had
           been applied. So the contract is the disjunction, and silence fails
           both ways. */
        if ((q.expect ?? {}).mustDifferFromFloor && settled.length > 0) {
          const head = settled.slice(0, 5).map(key);
          const shared = head.filter((k) => floor.has(k));
          const differs = floor.size === 0 || shared.length <= 2;
          /* READ THE FACT, NOT THE COPY. This used to match the sentence
             against a hand-kept list of phrasings, so the day the route added
             an honest third disclosure — "I couldn't check what I know about
             these titles just now" — the deployment told the truth and this
             contract recorded silence. Copy is supposed to change; a contract
             pinned to it fails on improvements. `diagnostics.critic.disclosed`
             is the route's own statement that it said something, and the
             user-visible line still has to exist, so this is strictly harder to
             satisfy than the regex was: a degraded answer with no note fails on
             both halves, and an unrelated interpretation line cannot stand in
             for a disclosure the route never made. */
          const disclosed = criticDiag?.disclosed === true && disclosure.length > 0;
          const ok = differs || disclosed;
          console.log(
            `  CONTRACT the settled comparison differs from the floor, or says it could not: ` +
            `${ok ? `PASS (${differs ? `${shared.length}/5 shared` : 'disclosed'})` : `FAIL (${shared.length} of the top ${head.length} are floor titles, and nothing was disclosed)`}`,
          );
          if (!ok) fail(`${q.id} "${q.text}": returned the unconstrained order and did not say the comparison had not been applied.`);
        }
        if (settled.length > 0) answerHead.set(q.id, settled.slice(0, 5).map(key));
        if (disclosure.length > 0 || criticDiag) answerNote.set(q.id, { disclosure, criticDiag });
      } else {
        explainShortfall(body);
        fail(`${q.id} "${q.text}": returned no results at all.`);
      }
      report.queries.push({
        ...q, items: 0, latencyMs: ms, kind: body.kind ?? null,
        diagnostics: body.diagnostics ?? null, executedQuery: body.query ?? null,
        interpretation: body.interpretation ?? null, relaxed: body.relaxed ?? null,
      });
      continue;
    }

    // PERSONALIZED order is the order the route returned.
    const personalized = items.map(key);
    answerHead.set(q.id, personalized.slice(0, 5));
    // OBJECTIVE order is the pre-Phase-1 comparator, applied to the same set.
    const objective = [...items].sort((a, b) => b.matchScore - a.matchScore).map(key);

    const objRank = new Map(objective.map((k, i) => [k, i + 1]));
    const rows = items.map((it, i) => {
      const k = key(it);
      const ev = evidenceOf(it);
      if (ev.participated) anyParticipation = true;
      return {
        title: it.title,
        id: k,
        objectiveRank: objRank.get(k),
        objectiveScore: it.matchScore,
        personalizedRank: i + 1,
        personalizedScore: ev.rankScore,
        movement: (objRank.get(k) ?? 0) - (i + 1),
        scoreDelta: ev.rankScore == null ? null : ev.rankScore - it.matchScore,
        evidence: ev,
      };
    });

    /* EVIDENCE COVERAGE, EVERY QUERY. The prior closure measured "0 of 43
       fingerprinted" once, by hand, on one comparative request. Coverage is an
       operational fact that moves, so it is reported for every answer: how many
       titles the personal channel could say anything about, and how many the
       request-fit channel could. */
    const personalCovered = items.filter((i) => i.personal?.participated).length;
    const relevanceCovered = items.filter((i) => i.relevance?.participated).length;
    console.log(`  ${items.length} items · ${ms}ms · kind=${body.kind ?? '?'}`);
    console.log(
      `  EVIDENCE COVERAGE  personal ${personalCovered}/${items.length}` +
      ` · request-fit ${relevanceCovered}/${items.length}` +
      `${body.diagnostics?.critic ? ` · critic fingerprints ${body.diagnostics.critic.fingerprinted}/${body.diagnostics.critic.candidates} (read: ${body.diagnostics.critic.evidence ?? '?'})` : ''}`,
    );
    const relMoved = items.filter((i) => (i.relevance?.nudge ?? 0) !== 0);
    if (relMoved.length > 0) {
      console.log(`  REQUEST FIT moved ${relMoved.length} title(s); strongest: ${relMoved.slice(0, 3).map((i) => `${String(i.title).slice(0, 26)} ${i.relevance.nudge > 0 ? '+' : ''}${i.relevance.nudge}`).join(' · ')}`);
      for (const i of relMoved.slice(0, 2)) if (i.relevance.reason) console.log(`    said: ${i.relevance.reason}`);
    }
    console.log(`  ${'title'.padEnd(34)} ${'obj#'.padStart(4)} ${'objSc'.padStart(6)} ${'per#'.padStart(4)} ${'perSc'.padStart(6)} ${'move'.padStart(5)}  evidence`);
    for (const r of rows) {
      const e = r.evidence;
      const ev = e.participated
        ? `dim=${e.dimensionMatch ?? '-'} pref=${e.preferenceNudge} conf=${e.confidence}${e.reasons.length ? ' [' + e.reasons.join('; ') + ']' : ''}${e.concerns.length ? ' !' + e.concerns.join('; ') : ''}`
        : 'none (participated=false)';
      console.log(
        `  ${String(r.title).slice(0, 33).padEnd(34)} ${String(r.objectiveRank).padStart(4)} ${String(r.objectiveScore).padStart(6)} ` +
        `${String(r.personalizedRank).padStart(4)} ${String(r.personalizedScore ?? '-').padStart(6)} ${String(r.movement > 0 ? '+' + r.movement : r.movement).padStart(5)}  ${ev}`,
      );
    }

    /* ── THE LANGUAGE CONTRACT, CHECKED ON THE DEPLOYED RESPONSE ──────────
       A route that returns 200 with a plausible-looking list has proved
       nothing; these are the behaviours the P0 language work repaired, read
       back from what the deployment actually returned. */
    const exp = q.expect ?? {};
    if (exp.notASearch) {
      const ok = items.length === 0;
      console.log(`  CONTRACT not-a-search: ${ok ? 'PASS' : `FAIL (${items.length} items returned)`}`);
      if (!ok) fail(`${q.id} "${q.text}": a third-party statement returned a result set.`);
    }
    const checks = [];
    if (exp.exactItems != null) {
      checks.push([`exactly ${exp.exactItems} items`, items.length === exp.exactItems, `got ${items.length}`]);
    }
    if (exp.minItems != null) {
      checks.push([`at least ${exp.minItems} items`, items.length >= exp.minItems, `got ${items.length}`]);
    }
    if (exp.media != null) {
      const wrong = items.filter((i) => i.mediaType !== exp.media);
      checks.push([`every item is ${exp.media}`, wrong.length === 0, `${wrong.length} of the wrong type`]);
    }
    if (exp.mustDifferFromFloor) {
      const head = items.slice(0, 5).map(key);
      const shared = head.filter((k) => floor.has(k));
      console.log(`  overlap with the unconstrained floor: ${shared.length} of the top ${head.length}`);
      checks.push([
        'the answer is not the unconstrained floor',
        floor.size === 0 || shared.length <= 2,
        `${shared.length} of the top 5 are the titles an unconstrained ask returns`,
      ]);
    }
    let contractMissed = false;
    for (const [label, ok, detail] of checks) {
      console.log(`  CONTRACT ${label}: ${ok ? 'PASS' : `FAIL (${detail})`}`);
      if (!ok) {
        contractMissed = true;
        fail(`${q.id} "${q.text}": expected ${label}, ${detail}.`);
      }
    }
    if (contractMissed) explainShortfall(body);

    // ── SET EQUALITY: ordering may change, membership may not ──────────────
    const sameSet =
      objective.length === personalized.length && new Set(objective).size === new Set(personalized).size &&
      objective.every((k) => personalized.includes(k));
    console.log(`  SET EQUALITY (eligible before vs after Taste): ${sameSet ? 'PASS' : 'FAIL'}`);
    if (!sameSet) fail(`${q.id}: personalization changed the membership of the answer.`);

    // ── CEILING: no movement may exceed the documented bound ───────────────
    const over = rows.filter((r) => r.scoreDelta != null && Math.abs(r.scoreDelta) > 18);
    console.log(`  CEILING (|delta| <= 18): ${over.length === 0 ? 'PASS' : 'FAIL'}`);
    if (over.length > 0) fail(`${q.id}: ${over.length} title(s) moved more than the +/-18 ceiling.`);

    const moved = rows.filter((r) => r.movement !== 0);
    console.log(`  MOVEMENTS: ${moved.length} of ${rows.length} title(s) changed position`);

    // ── NO-DNA CONTROL, when this account turns out to have no DNA ─────────
    const participation = rows.filter((r) => r.evidence.participated).length;
    if (participation === 0) {
      /* TWO THINGS MAY LEGITIMATELY REORDER AN ANSWER, and both must declare
         themselves. Taste is one; how squarely a title answers the request is
         the other, and it reports `relevance.participated` per item exactly so
         that a reorder can never be unattributed. Anything else moving the
         order with nothing claiming responsibility is the failure this control
         exists to catch. */
      const identical = objective.every((k, i) => k === personalized[i]);
      const attributed = relevanceCovered > 0;
      const ok = identical || attributed;
      console.log(
        `  UNATTRIBUTED-REORDER CONTROL: no taste participated; order ${identical ? 'identical to objective' : 'differs'}` +
        `${identical ? '' : ` and request-fit claims ${relevanceCovered}/${items.length}`}: ${ok ? 'PASS' : 'FAIL'}`,
      );
      if (!ok) fail(`${q.id}: the order changed and nothing claimed responsibility for it.`);
    }

    report.queries.push({
      ...q, items: items.length, latencyMs: ms, kind: body.kind ?? null, rows, sameSet,
      movements: moved.length, participation,
      diagnostics: body.diagnostics ?? null, executedQuery: body.query ?? null,
    });
  }

  /* ── CROSS-QUERY CONTRACTS ────────────────────────────────────────────────
     The sharpest question a single query cannot answer: did the thing the user
     ASKED FOR shape the answer? Two requests that share an anchor and differ
     only in the axis must not come back as the same list. No hard-coded titles
     are needed to say so, and no judgement about which films are "generic" —
     the deployment is compared against itself. */
  console.log('\n──────── CROSS-QUERY CONTRACTS');
  for (const q of QUERIES) {
    const other = (q.expect ?? {}).differsFrom;
    if (!other) continue;
    const mine = answerHead.get(q.id);
    const theirs = answerHead.get(other);
    if (!mine || !theirs) {
      console.log(`  ${q.id} vs ${other}: SKIPPED — one side produced no answer to compare`);
      fail(`${q.id}: could not compare with ${other} because one of them returned nothing.`);
      continue;
    }
    const shared = mine.filter((k) => theirs.includes(k));
    const differs = shared.length <= MAX_SHARED_HEAD;
    /* Same disjunction as the floor contract: identical answers are only
       acceptable when the deployment SAID the comparison could not be applied
       — to both of them, because one disclosure does not excuse the other. */
    const said = (id) => (answerNote.get(id)?.disclosure ?? []).some((l) => /couldn.t apply|didn.t separate|without the comparison|couldn.t fulfil/i.test(l));
    const disclosed = said(q.id) && said(other);
    const ok = differs || disclosed;
    console.log(
      `  ${q.id} ("${q.text}") vs ${other}: ${shared.length} of the top ${mine.length} titles are the same — ${ok ? `PASS${differs ? '' : ' (both disclosed)'}` : 'FAIL'}`,
    );
    if (!ok) {
      fail(
        `${q.id}: asking the same anchor to move the OTHER way returned ${shared.length}/${mine.length} of the same titles, and the deployment did not say the comparison had not been applied.`,
      );
    }
  }

  // ── LATENCY: repeat each query so a single sample cannot mislead ─────────
  console.log('\n──────── LATENCY (5 runs per query)');
  console.log(`  ${'query'.padEnd(34)} ${'min'.padStart(6)} ${'med'.padStart(6)} ${'p95'.padStart(6)} ${'max'.padStart(6)}`);
  for (const q of QUERIES) {
    const samples = [];
    for (let i = 0; i < 5; i += 1) samples.push((await ask(q.text)).ms);
    console.log(
      `  ${q.text.slice(0, 33).padEnd(34)} ${String(Math.min(...samples)).padStart(6)} ${String(median(samples)).padStart(6)} ` +
      `${String(pct(samples, 95)).padStart(6)} ${String(Math.max(...samples)).padStart(6)}`,
    );
    const entry = report.queries.find((r) => r.id === q.id);
    if (entry) entry.latency = { samples, min: Math.min(...samples), median: median(samples), p95: pct(samples, 95), max: Math.max(...samples) };
  }

  console.log(`\nANY DNA PARTICIPATION ON THIS ACCOUNT: ${anyParticipation ? 'YES' : 'NO'}`);
  if (!anyParticipation) {
    console.log('  → This account is a legitimate NO-DNA CONTROL, and the objective order was preserved.');
    console.log('  → It does NOT demonstrate reordering. That needs an account with stored Taste DNA.');
  }
  console.log(`\n::group::machine-readable\n${JSON.stringify(report)}\n::endgroup::`);
}

main().catch((e) => infra(`unexpected: ${e?.message ?? e}`));
