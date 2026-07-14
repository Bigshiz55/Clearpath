# WatchVerdict — Decision Log

Decisions made autonomously during the build. Each entry: decision, rationale, alternatives considered.

### D1 — Build fresh (no source existed)
No WatchVerdict source/zip existed anywhere in the workspace or container (see AUDIT §1). Decided to build from scratch on the specified preferred stack rather than wait. Nothing functional was discarded.

### D2 — Next.js 14 App Router + TypeScript strict
Matches the required stack. `strict: true` plus additional safety flags (`noUncheckedIndexedAccess`) for robustness.

### D3 — Tailwind CSS for styling
Fastest path to a consistent, premium dark cinematic UI with reusable component classes. No external UI kit dependency (keeps bundle lean, avoids branding conflicts).

### D4 — Supabase SSR via `@supabase/ssr`
Current supported pattern: separate browser client, server client, and `middleware.ts` for cookie-based session refresh. Server-side identity verified with `supabase.auth.getUser()` (not `getSession()`) on protected paths.

### D5 — Deterministic scoring engine is the source of truth; AI is optional
Per spec §15, the scoring engine is pure, deterministic, fully unit-tested TypeScript. OpenAI is an optional enhancement for prose only and can never override hard preference penalties or invent data. App is fully functional with `OPENAI_API_KEY` unset.

### D6 — Scott preference penalties applied only when trait is a *defining* characteristic
Spec §5 requires major penalties only for defining traits, not secondary tags. Implemented a "signal strength" model: TMDB genre membership + keyword density + primary-vs-secondary weighting determine whether a trait is "defining." A single secondary keyword does not trigger the full penalty; it must clear a dominance threshold. Noir is treated as full −20 whenever it is a significant defining style (per explicit spec instruction).

### D7 — Env vars validated at runtime, not build time
So `next build` succeeds in CI/sandbox without real secrets. A typed `env` accessor throws a clear, user-friendly error only when a feature that needs a key is actually invoked at request time. Placeholder-safe Supabase client construction prevents import-time crashes.

### D8 — SQLite starter removed
The vanilla Express/SQLite files created earlier in the session (before the full spec) were removed; the spec mandates Supabase Postgres.

### D9 — Share tokens: 22-char base62 random, revocable, optional expiry
Unguessable, not derived from user id or row id (prevents enumeration). Stored in a `shares` table with `is_active` and `expires_at`. Public pages resolve by token and return only whitelisted fields.

### D10 — Personal Match label is per-user, stored on profile
Default label derived from first name + " Match" (e.g. "Scott Match"). Falls back to "My Match". The Scott permanent rules are seeded for the owner but every user can create/edit their own `preference_rules`.

### D11 — Vitest for unit tests
Zero-config TS support, fast, standard. Scoring/preference/clamping/tier tests run in-session and must pass before commit.

### D12 — Deployment left as a documented handoff
Vercel deploy, live Supabase migration application, and Auth URL config require credentials/logins not present in this sandbox. The code is turnkey: `vercel.json`, `.env.example`, env validation, and a step-by-step deploy runbook are provided so the user completes deployment in minutes. This is the only class of work deferred, and only because it is genuinely external.

### D13 — PWA icons generated as SVG/PNG placeholders
No copyrighted artwork shipped. Icons are a branded "WV" mark generated deterministically. User can swap later.

### D15 — Dependency audit: stay on Next 14.2.x (latest patch), don't force Next 16
`npm audit` flags advisories that the DB only marks "fixed" in Next 15/16 (a
breaking major). Rather than destabilize a fully-working, tested build at the
finish line, I upgraded within the stable line (Next 14.2.35 — latest 14.x) and
upgraded Vitest to v3, which **removed the only critical finding** (Vitest UI
server, which this project never launches) and cut totals from 10 → 5.

The 5 remaining are all either:
- **dev/build-only** and never shipped to production runtime: `glob` (CLI
  command-injection — we don't invoke the glob CLI), `postcss` (build-time CSS
  only), `eslint-config-next` / `@next/eslint-plugin-next` (linting); or
- **Next.js advisories that don't apply to this app's architecture**: no
  `next/image` component (we use plain `<img>`), no i18n, no `rewrites`, no
  WebSocket upgrades, no CSP nonces, App Router only (not Pages Router).

Recorded as an assessed, accepted risk. Revisit by upgrading to Next 16 in a
dedicated follow-up with full re-verification. `npm audit` is **not** claimed to
be clean — see this entry for the honest state.

### D16 — Protected routes redirect (never 500) when auth env is absent
Server pages under `/app` run concurrently with their layout, so a missing
Supabase env could make a page throw before the layout redirects. Middleware now
redirects protected paths to `/login` whenever auth can't be verified (no user
*or* no config), so a misconfigured deploy degrades to the login screen instead
of a 500. Verified at runtime (307 → /login).

### D14 — TMDB "watch providers" shown with attribution and no availability fabrication
Provider data is displayed exactly as returned by TMDB for the user's region, with TMDB/JustWatch attribution. No claim of "currently streaming" beyond what the API supplies; a note indicates data may change. No embedding/proxying of copyrighted media — only deep links to legal providers.
