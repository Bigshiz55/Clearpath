# PHASE 1 PRODUCTION PROOF — THE PROCEDURE, AND WHY THIS SESSION COULD NOT RUN IT

## STATUS: **NOT PRODUCTION-PROVEN.** Two halves; one is closed.

Phase 1 is merged and deployed. A real deployment has now been measured as a
real signed-in user (see **DEPLOYED-RUNTIME EVIDENCE** below), which closes the
safety and control half. What remains unproven is the half that matters most to
the product: that a reader with stored Taste DNA gets a *different order*.
Nothing here should be read as claiming otherwise.

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

## WHAT THE OWNER RUNS TO CLOSE IT

The response makes this a **single call**, because `/api/ask` spreads the whole
`FinderItem`: each item carries `matchScore` (the objective score, i.e. the
order *before* taste) alongside `personal.rankScore` (the order *after*), plus
the evidence that moved it. Before and after arrive together.

### 1 · Get a session cookie

Sign in at https://clearpath-pearl-chi.vercel.app with an account that has rated
titles. In DevTools → Application → Cookies, copy the `sb-*-auth-token` cookie
(name and value). Everything below assumes:

```bash
BASE=https://clearpath-pearl-chi.vercel.app
COOKIE='sb-xxxx-auth-token=PASTE_VALUE_HERE'
```

Do not paste that cookie into an issue, a PR, or a chat window — it is a live
credential.

### 2 · Confirm the deployment you are testing

```bash
curl -sS "$BASE/api/version" | python3 -m json.tool | head -5
```

Expect `"sha"` to equal the merged Phase 1 SHA and `"vercelEnv": "production"`.

### 3 · The broad query — ordering, evidence, and the eligible set

```bash
curl -sS -X POST "$BASE/api/ask" \
  -H 'Content-Type: application/json' -H "Cookie: $COOKIE" \
  -d '{"text":"a good thriller"}' > /tmp/dna-on.json

python3 - <<'PY'
import json
d = json.load(open('/tmp/dna-on.json'))
items = d['items']
print('serving sha:', d.get('sha'))
print(f"{'title':38} {'objective':>9} {'ranked':>7} {'part?':>6}  evidence")
for i in items:
    p = i.get('personal') or {}
    ev = p.get('evidence') or {}
    reasons = ', '.join(r.get('label', str(r)) for r in (ev.get('reasons') or [])[:2])
    print(f"{i['title'][:37]:38} {i['matchScore']:>9} "
          f"{p.get('rankScore','-'):>7} {str(p.get('participated')):>6}  "
          f"dim={ev.get('dimensionMatch')} pref={ev.get('preferenceNudge')} {reasons}")

# THE FOUR ASSERTIONS
objective_order = [i['id'] for i in sorted(items, key=lambda x: -x['matchScore'])]
actual_order    = [i['id'] for i in items]
print('\nA. taste moved at least one title:', objective_order != actual_order)
print('B. same eligible set:', set(objective_order) == set(actual_order))
print('C. at least one item has real evidence:',
      any((i.get('personal') or {}).get('participated') for i in items))
print('D. every movement is within +/-18:',
      all(abs((i.get('personal') or {}).get('rankScore', i['matchScore']) - i['matchScore']) <= 18
          for i in items))
PY
```

- **A** is "at least one title changed position."
- **B** is "the eligible set itself did not change" — same ids, different order.
- **C** is the *because*: a position change with `participated: false` everywhere
  would mean something else moved the list, and the proof would have failed.
- **D** is the ceiling holding in production.

### 4 · The no-DNA control

Repeat step 3 **signed in as an account with no ratings and no preferences**.
Expect `participated: false` on every item and `actual_order == objective_order`
— the objective sort, unchanged.

(A signed-out request is *not* this control. It returns 401.)

### 5 · Hard-constraint protection

```bash
curl -sS -X POST "$BASE/api/ask" \
  -H 'Content-Type: application/json' -H "Cookie: $COOKIE" \
  -d '{"text":"Looking for a good Samuel L Jackson movie"}' > /tmp/dna-constraint.json
```

Every returned title must actually feature Samuel L. Jackson (TMDB person
`2231`). Taste may reorder them; it may not introduce one he is not in. This is
the query whose failure started the hard-constraint work, so it is the one worth
re-running by hand.

### 6 · Record the result

Paste the table and the four assertion lines into `docs/TASTE-DNA-SHIP.md` under
a new **PRODUCTION PROOF** heading, with the serving SHA and the date. Only then
is Phase 1 production-proven.

---

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
