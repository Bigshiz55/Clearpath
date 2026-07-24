# Verdict Growth OS — Deployment Plan

> v1 is an internal tool running on mock data. It can be deployed to a private,
> access-controlled Vercel project, but **must not be public** and must not be
> connected to real financial/social providers without explicit approval.

## Prerequisites

- Node ≥ 18.18 (developed on Node 22).
- A Vercel account/project (private).
- (Next phase) A Supabase project dedicated to Growth OS — **separate** from the
  WatchVerdict and ReadVerdict Supabase projects.

## Local

```bash
cd verdict-growth-os
npm ci
npm run dev            # http://localhost:3100
npm run typecheck && npm run lint && npm test && npm run build
```

No secrets required for v1.

## Deploying v1 (mock tier) to Vercel

1. Import the `verdict-growth-os` directory as a **separate Vercel project**
   (Root Directory = `verdict-growth-os` if deploying from this monorepo, or
   from a dedicated repo after extraction).
2. Framework preset: **Next.js**. Build command `next build`, output default.
3. Set `GROWTH_OS_MODE=mock` (default). No other env vars are needed.
4. **Protect the deployment**: enable Vercel Authentication / password
   protection / SSO so only the team can reach it. This is an internal console.
5. Deploy. All data shown is labeled demo data.

## Promoting to real integrations (later phases — gated)

Each integration is enabled independently and only after its credentials and an
explicit human approval exist:

1. **Supabase persistence**: create the project, run
   `supabase/migrations/0001_init.sql`, set `NEXT_PUBLIC_SUPABASE_URL`,
   `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` (server-only),
   swap the store body for Supabase queries, enable RLS policies + auth.
2. **Analytics** (`ANALYTICS_PROVIDER`, `ANALYTICS_API_KEY`): implement the live
   `AnalyticsAdapter`, flip mode to `live`.
3. **GitHub** (`GITHUB_TOKEN`, read-only scopes): implement live `GitHubAdapter`.
4. **Billing** (`STRIPE_SECRET_KEY`): implement live `RevenueAdapter`
   (**read-only**). Never perform charges/refunds from the OS.
5. **Social**: read/draft only until an execution path is separately designed
   and approved. No `publish()` exists in v1 by design.

## Rollback & safety

- Every job honors the `emergency_stop` flag (`scheduled_jobs.emergency_stop`);
  set it to halt all automated runs immediately.
- Cost ceilings are enforced in code (`src/lib/domain/cost.ts`); a runaway job
  aborts rather than overspends.
- Because writes are service-role-only, a leaked anon key cannot mutate data.

## What must never be deployed

- A public, unauthenticated instance.
- Any build with a real social `publish` path, auto-advertising spend, or a
  billing adapter that can move money — none of which exist in v1.
