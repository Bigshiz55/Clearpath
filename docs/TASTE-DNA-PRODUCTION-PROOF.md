# PHASE 1 PRODUCTION PROOF — STATE, AND THE ONE REMAINING STEP

## PHASE 1 STATE

| | |
|---|---|
| **Implementation** | **COMPLETE** |
| **Automated regression proof** | **COMPLETE** |
| **Deployed no-DNA control** | **PROVEN** |
| **Real-DNA reordering** | **AWAITING OWNER AUTHENTICATED PROOF** |
| **Production authenticated proof** | **AWAITING OWNER AUTHENTICATED PROOF** |

Read that table precisely. **Nothing about the ranking implementation is
missing or unfinished.** What is missing is an *external observation*: a
signed-in request from an account that has naturally accumulated Taste DNA.
This session cannot make that observation, because every path to an
authenticated production request needs a secret it must not hold — not because
any code is absent.

The remaining step is one paste into a browser console, below.

---

## DEPLOYED-RUNTIME EVIDENCE — captured, and what it does not cover

`eval/preview/taste-dna-proof.mjs`, run by the `taste-dna-proof` CI job against
a **preview deployment at the same code**, signed in as the real preview
identity through the existing `preview-test-login` route. Real Supabase, real
TMDB, real `/api/ask`. No application module is imported and nothing is mocked.

**No production surface was added to do this.** `/api/ask` already spreads the
whole `FinderItem`, so `matchScore` — the objective score, which personalization
never modifies — rides in the same response as `personal.rankScore` and
`personal.evidence`. A founder diagnostic route would only have re-exposed
fields the product already returns, and would then have had to be removed.

Run at `3f9547c`, 28 items over 3 queries:

| claim | result |
|---|---|
| membership unchanged before vs after taste | **PASS** on all three queries |
| no movement outside the ±18 ceiling | **PASS** |
| no-DNA control preserves the objective order | **PASS** — `participated:false` on all 28, order byte-identical |
| hard constraint holds | `three Sylvester Stallone movies` → exactly 3, all Stallone (Rocky, Creed, The Suicide Squad — he voices King Shark) |
| latency, steady state | 1.2–1.8s p95 per query; only the first (cold) call was 5.5–6.7s |

**What this does NOT cover, and why:**

1. **No reordering was observed**, because the preview identity has no stored
   Taste DNA. That is an honest no-op, not a failure — but it means the feature's
   *effect* is still unobserved on any deployment. Seeding DNA is forbidden and
   would prove nothing about real readers anyway.
2. **It is preview, not production.** Same code, different deployment.

## THE BLOCKER, EXACTLY

`/api/ask` requires a session. Verified against production, not inferred:

```
$ curl -sS -X POST https://clearpath-pearl-chi.vercel.app/api/ask \
    -H 'Content-Type: application/json' -d '{"text":"a good thriller"}'
{"error":"Not signed in."}          HTTP 401
```

`src/app/api/ask/route.ts:179` — `if (!user) return … 401`.

This session holds no production credentials: there is no `.env`/`.env.local`
in the working tree (only `.env.example`), and no `SUPABASE_*`, `TMDB_*` or
`OPENAI_*` variable is set in its environment. It therefore cannot

- sign in as any account,
- enumerate accounts to find one with sufficient Taste DNA,
- or create one — that would write production data, which the work order forbids.

The three routes out are all closed by the operating rules: never request
credentials, never touch production data, never modify production Supabase.

**Consequence for the requested proof:** every one of the seven sub-items in the
production-proof step needs a session, *including the control*. There is no
signed-out Ask ordering to compare against — a signed-out request receives 401,
not an objective-sorted list. The "no DNA" control must be a signed-in account
with no DNA, not a signed-out one.

---

## WHAT THE OWNER RUNS TO CLOSE IT — ONE PASTE, NO CREDENTIALS

**You do not need to copy a cookie, open a terminal, touch Supabase, run SQL, or
send anything secret to anyone.** The browser you are already signed into holds
the session; the snippet below rides it with `credentials: 'same-origin'`.

### The whole procedure

1. Sign in at <https://clearpath-pearl-chi.vercel.app> **with the account that
   has your ratings** (the one with real Taste DNA).
2. Open DevTools → **Console**  (F12, or ⌥⌘J on a Mac).
3. Paste the snippet below and press Enter. It takes about 15 seconds.
4. Copy the block it prints under `=== COPY FROM HERE ===` and paste it back.

That output is **field-whitelisted** — title, id, the two scores, and the taste
evidence. It contains no cookie, no token, no email, no user id, and no part of
the raw response beyond those fields. It is safe to paste into chat.

### The snippet

```js
(async () => {
  const QUERIES = ['Looking for a good thriller', 'movies about chess', 'three Sylvester Stallone movies'];
  const ask = async (text) => {
    const t0 = performance.now();
    const res = await fetch('/api/ask', {
      method: 'POST',
      credentials: 'same-origin',                 // the session you already have
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ text }),
    });
    const ms = Math.round(performance.now() - t0);
    if (res.status === 401) throw new Error('Not signed in — sign in first, then re-run.');
    return { ms, body: await res.json() };
  };

  const version = await (await fetch('/api/version', { credentials: 'same-origin' })).json();
  const out = { sha: version.sha, env: version.vercelEnv, at: new Date().toISOString(), queries: [] };

  for (const text of QUERIES) {
    const { ms, body } = await ask(text);
    const items = body.items || [];
    // WHITELIST — nothing else from the response is read or emitted.
    const rows = items.map((i, idx) => {
      const p = i.personal || {}, e = p.evidence || {};
      return {
        title: i.title, id: `${i.mediaType}:${i.id}`,
        objectiveScore: i.matchScore, personalizedRank: idx + 1,
        personalizedScore: p.rankScore ?? null, participated: !!p.participated,
        dimensionMatch: e.dimensionMatch ?? null, preferenceNudge: e.preferenceNudge ?? 0,
        confidence: e.confidence ?? 0,
        reasons: (e.reasons || []).map((r) => r.label || r.key || r.axis).filter(Boolean).slice(0, 3),
        concerns: (e.concerns || []).map((r) => r.label || r.key || r.axis).filter(Boolean).slice(0, 3),
      };
    });
    const objective = [...rows].sort((a, b) => b.objectiveScore - a.objectiveScore).map((r) => r.id);
    const personalized = rows.map((r) => r.id);
    rows.forEach((r) => { r.objectiveRank = objective.indexOf(r.id) + 1; r.movement = r.objectiveRank - r.personalizedRank; });

    out.queries.push({
      text, ms, items: rows.length, rows,
      A_tasteMovedSomething: JSON.stringify(objective) !== JSON.stringify(personalized),
      B_sameEligibleSet: objective.length === personalized.length && objective.every((k) => personalized.includes(k)),
      C_realEvidence: rows.some((r) => r.participated),
      D_withinCeiling: rows.every((r) => r.personalizedScore == null || Math.abs(r.personalizedScore - r.objectiveScore) <= 18),
    });

    console.log(`\n${text}  —  ${rows.length} items, ${ms}ms`);
    console.table(rows.map((r) => ({ title: r.title, obj: r.objectiveRank, objScore: r.objectiveScore,
      per: r.personalizedRank, perScore: r.personalizedScore, move: r.movement,
      participated: r.participated, dim: r.dimensionMatch, pref: r.preferenceNudge })));
  }

  console.log('\n=== COPY FROM HERE ===');
  console.log(JSON.stringify(out, null, 1));
  console.log('=== COPY TO HERE ===');
})();
```

### Reading the result

Per query the snippet reports four flags:

| flag | meaning |
|---|---|
| **A** `tasteMovedSomething` | at least one title changed position |
| **B** `sameEligibleSet` | the eligible set itself did not change — same ids, different order |
| **C** `realEvidence` | at least one title has `participated: true`; this is the *because*. A movement with no participation anywhere would mean something else moved the list |
| **D** `withinCeiling` | no title moved more than ±18 |

**A true with C true, on the account that has your ratings, is the proof.**

If **A is false and C is false**, that account has no stored Taste DNA reaching
these titles — the ranking is correct and honest, it simply has nothing to say
yet. Try a query closer to what you have actually rated.

### The no-DNA control (optional, ~1 minute)

Run the identical snippet signed in as an account with **no** ratings. Expect
`participated: false` everywhere and `A_tasteMovedSomething: false` — the
objective order, unchanged. (A signed-out browser is *not* this control; it
returns 401.)

## WHAT *IS* PROVEN WITHOUT A SESSION

| claim | status | evidence |
|---|---|---|
| the mechanism reorders on real DNA shapes | proven | `personalRanking.test.ts` — two profiles, same pool, different order |
| taste cannot change membership | proven | `personalizeCandidates` maps 1:1; `qualifyCandidates` order-independence pinned in `hardConstraints.test.ts` |
| no paid AI call from Ask | proven | `titleDimensions.backfill.test.ts` watches the network on the real module |
| the ±18 ceiling | proven | pinned as the empirical maximum movement |
| membership/ceiling/no-DNA control on a real deployment | proven | `taste-dna-proof` CI job, preview @ `3f9547c` |
| **a reader with DNA gets a different order** | **UNPROVEN** | no account with stored DNA was reachable |
| **any of it on PRODUCTION** | **UNPROVEN** | needs step 3 above |
