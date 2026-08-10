# Voice DNA — live verification report

> **UPDATE — share-link support added; channel still requires a repo secret.**
>
> The harness now accepts a Vercel authenticated **share link** as an
> alternative to a Protection-Bypass secret: `globalSetup` redeems a
> `_vercel_share` token once into the `_vercel_jwt` cookie and every context
> inherits it via `storageState`. The token is read only from
> `VOICE_DNA_SHARE_TOKEN` or from a share URL passed as
> `VOICE_DNA_PREVIEW_URL`, and is stripped from `baseURL` so it cannot reach a
> reporter, trace, or failure message.
>
> **It still cannot be delivered to GitHub Actions without a repository
> secret**, because `Bigshiz55/Clearpath` is a **PUBLIC** repository:
> committed files, `workflow_dispatch` inputs (recorded in the run's event
> payload and shown in the public Actions UI/API), and job logs are all
> world-readable. A repository or environment secret is the only encrypted,
> masked, non-public channel into a run.
>
> **Security fix in the same change.** `previewTestAuth.ts` previously
> hard-coded the preview-test secret, justified by "the repo is private" —
> which was false. That published a working credential. It is now read from
> `PREVIEW_TEST_SECRET` in the deployment environment, the mechanism is off
> when it is absent, and a test guards against a literal being reintroduced.
> The old value is retired, not rotated in place: it remains in git history on
> a public repo, so it must never be reused. This also makes the earlier
> "disable Deployment Protection for previews" suggestion unsafe as written —
> it was only that protection which kept the published secret unusable.

**Status: BLOCKED on one owner action (Vercel Deployment Protection).**
Everything that can be verified without reaching the deployed preview is done
and green. No Voice DNA product defect has been observed, because no product
assertion has yet been allowed to reach the app.

- Branch: `claude/voice-dna-live-verify-n3788j` (never merged; `main` untouched)
- Head at time of writing: `526479d`
- Production untouched. No pull request opened.

---

## 1. The blocker, with evidence

Every request to the preview deployment is redirected off-site to Vercel's SSO
login, so all fifteen matrix rows would be asserting against Vercel's login
page rather than WatchVerd1ct.

From GitHub Actions run **31267183217** (commit `526479d`, deployment
`clearpath-65mur42q2-bigshiz56.vercel.app`):

```
A0 the app answers, not the platform (no Deployment Protection wall)
  Vercel Deployment Protection is enabled: GET /api/health returned 302
  → https://vercel.com/sso-api?url=https%3A%2F%2Fclearpath-65mur42q2-bigshiz56
    .vercel.app%2Fapi%2Fhealth&nonce=e186e7fff7dba69106717e80c20c061ed
1 failed, 14 skipped
```

The workflow attempts Vercel's supported automation path first and reports
what it found:

```
VOICE_DNA_BYPASS: (empty)
```

No `VERCEL_AUTOMATION_BYPASS_SECRET` repository secret exists, and no usable
`protectionBypass` was retrievable, so the run has no way through the wall.

### Why the agent could not resolve this itself

- The agent environment's egress policy denies `api.vercel.com` and
  `*.vercel.app` (proxy `CONNECT` → 403, re-confirmed over a 10-minute probe
  after the policy was widened — the change applies only to containers
  provisioned after it, not to a running one). So the provided `VERCEL_TOKEN`
  is unusable from the agent.
- Execution was therefore moved to GitHub Actions runners, which do have
  network access. That solved reaching the preview — but a runner can only
  receive `VERCEL_TOKEN` as a repository secret, which the agent cannot
  create. Committing a token to hand it to CI is never acceptable, so this
  stops here rather than working around it.

---

## 2. THE OWNER ACTION (one thing, ~2 minutes, phone-friendly)

Give the automated run a way past Deployment Protection. **Option A is
preferred** — it keeps protection on for humans and scopes the exception to
automation.

### Option A — Protection Bypass for Automation (recommended)

1. Open **vercel.com** → project **clearpath** → **Settings** →
   **Deployment Protection**.
2. Find **Protection Bypass for Automation** → enable it → **copy the secret**.
3. Open **github.com/Bigshiz55/Clearpath** → **Settings** → **Secrets and
   variables** → **Actions** → **New repository secret**.
4. Name it exactly `VERCEL_AUTOMATION_BYPASS_SECRET`, paste the secret, save.

Nothing else. The workflow already reads that secret, sends it as
`x-vercel-protection-bypass` with `x-vercel-set-bypass-cookie`, and masks it in
logs. Re-run **Actions → Voice DNA live matrix → Run workflow**, or just tell
the agent to continue and it will re-trigger.

### Option B — turn protection off for previews

Vercel → project **clearpath** → **Settings** → **Deployment Protection** →
set **Vercel Authentication** to **Disabled** for **Preview**. Faster, but it
makes every preview URL publicly reachable.

---

## 3. SUPERSEDED — migration 0047 is applied

**Migration `0047` (`voice_interviews`) has been applied to the WatchVerd1ct
Supabase project.** It is not remaining work, and it is not an owner action.
Persistence and resume are now a verification step like any other. The section
below is kept only because the D0-vs-D1 discriminator it describes is still the
right way to attribute a persistence failure if one appears.

### Original note (retained for the diagnostic technique)

Not yet reached, so **not yet proven** — recorded here so it is not a surprise
on the next run.

Rows D1/D2/D3/E1 round-trip every interview turn through the
`voice_interviews` table created by migration `0047_voice_interviews`. It is
registered in `PENDING_MIGRATIONS`, and per BACKLOG no migration registered
since ~Jul 31 has been applied, so the table is very likely absent. If it is,
those rows fail with "confidence never moved" / "Interview not found."

The matrix is built so this cannot be mistaken for a code defect: row **D0**
asserts the user's caption appears after a typed answer, which the transport
appends *before* any server action runs. D0 green + D1 red isolates the loss to
server-side persistence, i.e. the migration.

**If that happens, the owner action is** (also phone-friendly):
github.com/Bigshiz55/Clearpath → **Actions** → **Apply database migrations** →
**Run workflow** → type `APPLY` → Run. It applies only what is genuinely
missing (idempotent, ledger-tracked) and runs a schema verification job after.
Alternative: sign in at `/login` with an `ADMIN_EMAILS` address, open
`/admin/migrations`, tap **Apply pending migrations** → **Yes, apply them**;
that page collects no credentials.

This was deliberately left to the owner: it writes DDL to the shared/production
schema.

---

## 4. Matrix rows and their current state

15 rows. None has been allowed to reach the app.

| Row | What it proves | State |
| --- | --- | --- |
| A0 | The app answers, not the platform | **FAIL — platform blocker** |
| A1 | Anonymous `/voice-dna` is a hidden 404 | blocked (skipped) |
| A2 | Anonymous `/voice-dna/audition` is a hidden 404 | blocked |
| A3 | Anonymous `POST /api/voice/session` is a hidden 404 | blocked |
| A4 | Test login without/with wrong secret is a hidden 404 | blocked |
| B1 | Preview test login mints a real Supabase session | blocked |
| C1 | Authed `/voice-dna` renders the idle screen | blocked |
| C2 | Authed `/voice-dna/audition` renders | blocked |
| C3 | `/api/voice/session` answers 200 with an honest mode | blocked |
| D0 | Typed transport is live and ingests client-side | blocked |
| D1 | Signals advance confidence (server round-trip) | blocked |
| D2 | Flagship contradiction is caught and surfaced | blocked |
| D3 | Interview completes and reveals DNA | blocked |
| E1 | Reload mid-interview resumes with transcript | blocked |
| F1 | Session route is `no-store` and leaks no key material | blocked |

**Realtime transport: UNEXERCISED.** Whether `OPENAI_API_KEY` and
`VOICE_INTERVIEW_ENABLED=1` are set for the Preview target could not be read
(same egress block). C3 records the mode it observes, so the next unblocked run
will report `realtime` or `fallback` as fact rather than assumption.

---

## 5. Defects found and fixed

All three were in the verification harness, and each would have produced a
*false* product verdict. Found by reading, before they could mislead a run.

1. **`d9de57c` — the typed ladder dropped every answer.** The harness stubbed
   `speechSynthesis` as a getter returning `undefined`; `'speechSynthesis' in
   window` stays true for an accessor, so `connectFallback` passed its guard
   and threw on `getVoices()`. That rejection took the component's *error*
   path, which shows a typed box but leaves `clientRef` null — so
   `submitText()` was never called. Rows D1/D2/D3/E1 would have failed with
   exactly the signature of the migration-0047 blocker: a harness bug reported
   to the owner as an owner action. Fixed by removing only the recognition
   constructors (the *capability* path, where the client is constructed), and
   by adding row D0 to separate client-side ingest from server persistence.

2. **`03de098` — login depended on a grant this project may not have.** The
   route signed in with `signInWithPassword`, but product sign-in here is
   magic-link only and a Supabase project can disable the password grant
   outright. Now falls back to an admin-generated magic link redeemed via
   `verifyOtp`, and reports which grant established the session.

3. **`3b4174a` — one red row erased the matrix.** `test.describe.configure({
   mode: 'serial' })` at top level meant the first failure aborted the other
   13 rows (run 1: *1 failed, 13 did not run*). Serial is now scoped to the
   interview group, the only rows that genuinely share state.

Plus **`526479d`**, which fixed a canary that lied: A0 originally scanned the
interstitial for `"Authentication Required"` / `"vercel.com/sso"` and **passed**
against the real `vercel.com/login?next=%2Fsso-api` redirect — reporting
all-clear while the wall was up. Detection is now by redirect target, not by
guessing at wording.

**No Voice DNA product defect has been found.** That is not a clean bill of
health — it is the honest consequence of never having reached the product.

---

## 6. Gates

Run locally in the agent container at `526479d`, real exit codes, unpiped:

| Gate | Exit | Result |
| --- | --- | --- |
| `npm run typecheck` | 0 | clean |
| `npm run lint` | 0 | no warnings or errors |
| `npx vitest run` | 0 | 3130 passed, 24 skipped (249 files) |
| `npm run build` | 0 | production build succeeds without secrets |

---

## 7. The temporary mechanism is still in place — deliberately

Cleanup was **not** performed, because verification is not complete: removing
the preview-only auth now would mean rebuilding it when the blocker clears.
It stays until the matrix has actually run, then goes.

It cannot activate in production. Four independent reasons, any one sufficient:

1. **Environment gate.** `isPreviewTestAuthActive()` returns true only when
   `VERCEL_ENV === 'preview'` (or a local `next dev` with no `VERCEL_ENV`).
   Production sets `VERCEL_ENV=production`.
2. **Secret gate.** The route additionally requires `x-preview-test-secret`
   matched with a fixed-length timing-safe digest comparison; every deny path
   is the same hidden 404.
3. **Never on the production deploy path.** Production deploys from
   `claude/watch-verdict-app-wwbtbg`; `scripts/checkBranch.ts` fails a
   production build from any other branch (`process.exit(1)`). This branch is
   not merged to `main` and is not that branch.
4. **Asserted, not just intended.** `src/lib/previewTestAuth.test.ts` pins that
   the mechanism is inert under `VERCEL_ENV=production` and under test, and
   that it grants only the one synthetic RFC-2606 address.

### Cleanup checklist (run after the matrix is green)

1. `DELETE <preview-url>/api/preview-test/founder-login` with the secret header
   — disposes of the synthetic Supabase user and its RLS-scoped rows. **Do this
   before deleting the route**, or the user is orphaned.
2. Delete `src/lib/previewTestAuth.ts`, `src/lib/previewTestAuth.test.ts`,
   `src/app/api/preview-test/`, `playwright.voicedna.config.ts`,
   `tests/voicedna-live/`, `.github/workflows/voice-dna-live-matrix.yml`.
3. Revert the preview-only branch in `isFounderEmail` (`src/lib/admin.ts`) so
   it imports no `previewTestAuth`.
4. Re-run all four gates; push.
5. Prove removal on the redeployed preview: `POST
   /api/preview-test/founder-login` **with** the correct secret must be 404.

---

## 7b. Preview authentication — the localhost magic link

A magic link requested on the preview was reported to land the user on
`http://localhost:3000`. Three independent probes, all run from a GitHub
runner (this agent's container answers `CONNECT` with 403 for `supabase.com`,
`api.vercel.com` and `*.vercel.app`), say the current configuration cannot
produce that.

**Probe 1 — where does Supabase route a preview redirect?**
`/auth/v1/verify` validates `redirect_to` against Site URL + Additional
Redirect URLs *before* it looks at the token, so an invalid token is enough to
read the routing without sending anything or creating a session.

| asked for | Location came back as | verdict |
| --- | --- | --- |
| `https://clearpath-<id>-bigshiz56.vercel.app/auth/callback?next=/voice-dna` | the same URL | ALLOW-LISTED |
| `https://clearpath-git-claude-voice-dna-live-verify-n3788j-bigshiz56.vercel.app/auth/callback?next=/voice-dna` | the same URL | ALLOW-LISTED |
| `http://localhost:3000/auth/callback?next=/voice-dna` | `https://clearpath-pearl-chi.vercel.app` | REJECTED |

So the project's Site URL is production, a wildcard already covers preview
hostnames, and `http://localhost:3000` is not on the allow-list at all —
Supabase has no route that sends anyone there.

**Probe 2 — can the app produce it?** No. Every `emailRedirectTo` in the repo
(`LoginForm`, `GuestSaveButton`) is built from `window.location.origin`;
`/auth/callback` redirects using the request's own origin; and
`next.config.mjs` self-heals `NEXT_PUBLIC_SITE_URL` from Vercel's system env
on any real deployment, so a stale or wrong value cannot reach the browser.

**Probe 3 — the email template.** This is the one thing probe 1 cannot see:
the template is free text, and a hardcoded host in it would bypass redirect
validation entirely. So a real magic link was sent to a disposable mailbox and
read back. Run
[31390039900](https://github.com/Bigshiz55/Clearpath/actions/runs/31390039900):

```
══ LINK REQUESTED FROM THE PREVIEW DEPLOYMENT ══
  link host   : vajgviraxigkwlvysxfz.supabase.co/auth/v1/verify
  type        : magiclink
  redirect_to : https://clearpath-gwxngi7n0-bigshiz56.vercel.app/auth/callback?next=%2Fvoice-dna
  VERDICT     : RETURNS TO clearpath-gwxngi7n0-bigshiz56.vercel.app
```

The DEFAULT template, and `redirect_to` is the preview that asked for it. The
token is never printed — this repository is public and a live token is a
working session. A second send aimed at the branch alias came back `429
over_email_send_rate_limit` (Supabase allows one request per address per 60s);
the alias is separately proven allow-listed by probe 1.

**Probe 4 — is a magic link needed at all?** No. `POST /auth/v1/signup` with an
empty body — the same call `src/lib/supabase/middleware.ts` makes — returns
`200`, so **anonymous sign-ins are ENABLED** on this project. `/voice-dna` is in
`PROTECTED_PREFIXES`, so opening it mints a guest session and drops straight
into the interview. Email sign-in is only needed to attach the resulting DNA to
a named account.

**Conclusion.** The redirect is correct today. The most likely explanation for
what was seen is a link from an older email, generated when the project's URL
configuration differed; a magic link carries the `redirect_to` that was
validated *at send time*, so an old email keeps sending you to an old place no
matter what the dashboard says now. That is not provable after the fact and not
fixable in code.

**What was fixed anyway.** The failure mode was silent: Supabase substitutes
the Site URL rather than returning an error, so a misconfigured deployment
sends a link that works perfectly and lands the person somewhere else, with
nothing in the UI to explain it. `/login` now runs the same question as a
server-side preflight (`src/lib/auth/redirectCheck.ts`) and refuses to send a
link it knows will strand someone, naming the destination instead. It fails
OPEN on every ambiguous outcome — timeout, network error, no `Location`
header, Supabase unconfigured — because a diagnostic that can lock a real
person out is worse than the bug it was written for. Results are memoised per
origin; a negative is held only 60s, so correcting an allow-list takes effect
without a redeploy. `src/lib/auth/redirectCheck.test.ts` pins that asymmetry.

**Residue.** The end-to-end proof created THREE disposable Supabase users
(`wv-authprobe-*@emalupe.com`). They hold no data and cannot be removed without
the service-role key. The third was an accident worth recording: the step was
gated `contains(head_commit.message, '[probe-email]')`, and
`head_commit.message` is subject *and* body — so the commit that introduced the
gate fired it, because its body explained the marker and therefore contained
it. Now gated `startsWith(..., 'probe-email:')` on the subject, which prose
cannot trip.

That third run is not wasted evidence: it re-proved the redirect against the
newest deployment (`redirect_to` → `clearpath-5qrg3mobo-bigshiz56.vercel.app`)
and re-confirmed anonymous sign-in is enabled.

## 8. Run history

| Run | Commit | Deployment | Outcome |
| --- | --- | --- | --- |
| [31266610607](https://github.com/Bigshiz55/Clearpath/actions/runs/31266610607) | `afad88f` | `clearpath-194u3j0l2` | 1 failed, 13 did not run — A1 got 200; serial mode erased the rest |
| [31266870870](https://github.com/Bigshiz55/Clearpath/actions/runs/31266870870) | `3b4174a` | `clearpath-7lgjafajn` | 1 passed (falsely), 10 failed, 4 blocked — revealed the SSO redirect |
| [31267183217](https://github.com/Bigshiz55/Clearpath/actions/runs/31267183217) | `526479d` | `clearpath-65mur42q2` | 1 failed, 14 skipped — single correct verdict: platform config |

Each deployment was located by **commit SHA** via the GitHub Deployments API,
so "the deployed SHA corresponds to this branch" holds by construction rather
than by string-matching after the fact.
