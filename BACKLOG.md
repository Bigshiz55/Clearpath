# BACKLOG.md — living work queue

Updated at the end of every work order per the Working Agreement in
`CLAUDE.md`. Sections: **Now**, **Next**, **Blocked**, **Done**.

## Now
Nothing in flight. **Action needed from you:** open `/admin/migrations` on
production and apply pending migrations with your `MIGRATE_SECRET` — see the
"Restored: /admin/migrations" entry below for why this is currently required
and what it unblocks.

## Next
- **Turn on the AI orchestrator (owner action).** The provider-independent
  Claude discovery brain is built, tested, and shipped OFF (`AI_DISCOVERY_MODE`
  defaults to `legacy`). To evaluate it: set `ANTHROPIC_API_KEY` (server-only)
  and `AI_DISCOVERY_MODE=shadow`, watch the `ai_discovery_shadow` telemetry, then
  flip to `anthropic` once it proves out. See `docs/AI_DATA_ARCHITECTURE.md`.
- **Canonical TV data platform is shipped-dormant (owner-gated data work).**
  Migration `0044` defines the correct provenance-complete `canon_*/dist_*/
  linear_*` model, but it is fed only by fixtures and read by no production
  surface — the guide runs on legacy `tv_*` + `watchmode_availability`. Wiring a
  verified ingester into the canonical tables and bridging legacy → canonical is
  blocked on a data-licensing/credential decision (TV Media / Watchmode /
  Schedules Direct). Documented as the P1 sequence in `docs/AI_DATA_ARCHITECTURE.md`.
- **Semantic reference similarity via embeddings/pgvector.** Reference "like X"
  similarity is TMDB getSimilar + keyword/genre overlap today; `embed()` infra
  exists (powers DNA) but isn't wired into reference similarity yet.
- **Shared admin token gate across all `/admin` routes.** `/admin/content`
  and `/admin/feedback` each hand-roll the same `isAdminEmail()` +
  `notFound()` check independently — a shared gate (middleware or a small
  wrapper) would remove the risk of a future `/admin/*` route shipping
  without it.
- **Trial onboarding flow.** There's no first-run "try it before you commit"
  path for a brand-new visitor before they've built a taste profile — worth
  scoping once the accounts/feedback loop above has real usage to learn from.

## Blocked
- **Score distribution audit.** The median appears compressed: four
  recommendations scored 79-91, all reading STREAM IT. Blocked on real title
  data existing in production — the local/dev catalog is synthetic fixture
  data (`catalog_titles`), so a distribution computed against it wouldn't be
  representative.

## Done
- **Voice DNA Interview — Phase 3 (client + UI).** Built the whole browser
  experience on top of the Phase-1 engine and Phase-2 server/Realtime route,
  branch `claude/voice-interview`. Two interchangeable transports behind one
  `VoiceClient` interface (`src/lib/voice/realtime/types.ts`): the OpenAI
  Realtime **WebRTC** client (`realtime/client.ts` — mic + data channel + SDP
  handshake with the ephemeral secret, `record_signal` tool → `TasteSignal`
  with axes resolved via the engine's `categoriesFor`, mic-level analyser for
  the waveform, fully try/caught so any failure falls back) and the KEYLESS
  Web-Speech fallback (`realtime/fallback.ts` — `speechSynthesis` voice +
  `SpeechRecognition`, degrading again to a typed box), whose spoken lines are
  interpreted by the pure `realtime/deriveSignal.ts`. Orchestrator
  `components/voice/VoiceInterview.tsx` wires signal→`recordInterviewTurn`→
  directive→session-steering, serialized turn chain, resume-shows-transcript,
  and realtime→fallback→typed recovery with no dead screen. Premium mobile-first
  UI: `Waveform` (canvas, reduced-motion aware), `LiveCaptions` (ARIA live),
  `ConfidenceMeter`, `DnaConstellation` (36-axis live radar), `InterestingBeat`,
  `DnaReveal`. Rebuilt `/voice-dna` (founder-gated) + added `/voice-dna/audition`
  (founder voice preview). 21 new tests (fallback derivation, tool-args parsing,
  constellation nodes, render smoke tests for the meter + reveal). Updated
  `src/lib/taste/retired.test.ts` to reflect the sanctioned un-retirement of the
  `/voice-dna` route (dropped the "Voice DNA" name ban — the new feature's real
  name — and repointed TEST 6 at the founder-gated render; all other pins on the
  genuinely-removed OLD Taste Interview kept). Did NOT touch the scoring engine
  or AI search. Gates: typecheck / lint / vitest (3115 passed) / build all exit 0.
- **Voice DNA Interview — pure domain core.** Built the full pure, deterministic
  conversation engine under `src/lib/voice/interview/` conforming to the frozen
  `types.ts` contract (no changes to it): `categories.ts` (36-axis `CATEGORY_META`
  with core≈3× niche weights + a ~90-entry title/genre/element/people lexicon and
  `categoriesFor`), `confidence.ts` (diminishing-returns per-axis confidence +
  weighted roll-up; 0.95 bar reachable only on broad coverage), `memory.ts`,
  `contradiction.ts` (catches the flagship hate-horror→loved-Silence
  `category_vs_title`, plus `sentiment_flip` and `attribute_conflict`),
  `followup.ts` (never-accept-a-shallow-answer probe bank), `planner.ts`,
  `stateMachine.ts` (warmup→…→complete with a challenge detour + hard turn cap),
  `director.ts` (`decide`/`advance`/`createInterview`, termination-guaranteed and
  garbage-safe), `reveal.ts` (leaves predicted titles empty for the server),
  `dnaUpdate.ts` (maps title reactions to the existing `EventDraft` preference
  shape with `source:'voice_interview'`, unchanged for `recordEvents`), and
  `prompts.ts` (Realtime system prompt + `record_signal`/`acknowledge_contradiction`
  tool schema + `buildTurnInstruction`). 81 new unit tests, all pure (no key /
  network / DB). Gates: typecheck / lint / vitest / build all exit 0. FOLLOW-UP
  (not in this order): the OpenAI Realtime session layer, server persistence
  (`store.ts` + server action calling `recordEvents`), and the `/voice-dna` route
  wiring are still to be built on top of this core.
- **National-breadth TVmaze ingest (broaden-only).** Extracted the
  `MAJOR_US_NETWORKS`/`isMajorUsNetwork` allowlist out of `onTv.ts` into a
  shared pure module `src/lib/viewing/ingest/nationalNetworks.ts` (plus a
  `networkSlug` helper) so the live guide path and the new ingest share ONE
  source of truth; the live path is a byte-for-byte refactor. Added
  `runTvmazeNationalIngest` in `tvmazeWriter.ts`: same `us-national` lineup and
  reconcile machinery, but the BROADER `isMajorUsNetwork` filter (~80 networks)
  instead of `matchChannel`, synthesized `tvmaze-net:<slug>` stations, no
  per-show premiere fan-out (premiere/repeat left null), and a
  `trigger:'national'` run row. Reconciliation is scoped per station-set on
  BOTH sides (curated read now `.in(station_id, curatedStationIds)`, national
  read `.like(provider_station_id, 'tvmaze-net:%')`) so neither ingest can
  expire the other's airings. Wired into `runGatedTvIngest` on its own
  `tvmaze_national` lock + independent once-per-UTC-day gate; surfaced in
  `/api/cron/tv-ingest` and `/api/tv/refresh`. Read paths untouched (that is
  the follow-up: route Highlights + easy-tv through the ingested tables). 14
  new pure tests; typecheck/lint/vitest/build all green.
- **AI + data platform architecture audit + typed tool boundary.** Inspected
  the real data layer (two Explore agents) and wrote `docs/AI_DATA_ARCHITECTURE.md`
  — the 11-part audit (current/target maps, gap analysis, source matrix,
  canonical-DB status, changes, preserve-list, migration/AI-cost/licensing risks,
  sequence). Key finding: the data platform is already mature and largely
  compliant (linear/streaming separation, provenance, freshness, DST-correct
  time, egress control), and the canonical model (`0044`) is correct but
  shipped-dormant. Structural change: formalized the AI's data access as a named,
  bounded, telemetried **typed tool boundary** (`src/lib/ai/tools.ts`) — Claude
  never sees SQL or a service-role key — and routed `discoveryBridge` through it.
  Added §32 architectural-separation tests (TV fact paths import no LLM; the
  Anthropic SDK is confined to its one adapter; the interpreter defers exact-
  title/person/live-TV to deterministic handlers). Added the missing
  `MDBLIST_API_KEY` to `.env.example`. Gates: typecheck, lint, 2948 tests, build
  all green. (`feat(ai): architecture audit + typed tool boundary`)
- **Provider-independent AI orchestrator foundation.** `src/lib/ai/` — Claude as
  the interpreter behind a swappable `AiProvider` interface, `CanonicalDiscoveryRequest`
  + strict validation (the trust boundary), QUALIFY-FIRST canonical→query mapping,
  cost/usage telemetry (metadata only), safe degradation, `AI_DISCOVERY_MODE`
  (legacy default = zero production change). (`feat(ai): provider-independent AI
  orchestrator foundation`)
- **Restored `/admin/migrations` and `/api/admin/migrate`.** Root-caused the
  Hallmark Universe Pack showing "Nothing ingested yet" / "No premieres in
  the next 6 weeks" with every section empty and no error banner: `feat(build):
  run migrations automatically on deploy` deleted the manual migration route
  in favor of an automatic `npm run migrate && next build` step; that step
  broke five consecutive production deploys and was reverted
  (`revert(build): remove migration step from build pipeline`), but the
  manual route was never brought back. Net effect since Jul 31: no
  mechanism at all, automatic or manual, applies anything registered in
  `pendingMigrations.ts` after that point — migration 0038
  (`pack_ingest_runs` + the `pack_try_start_ingest`/`pack_finish_ingest`
  RPCs the lazy self-ingest on every Pack page depends on) is a prime
  suspect for never having reached production. Restored the route, the
  page, and the `ApplyMigrationsButton` component byte-for-byte from their
  last-known-good version (a plain request-time API route, never part of
  the build command, so not implicated in the deploy failures that caused
  the revert). **This alone doesn't fix the Pack page** — someone with the
  `MIGRATE_SECRET` needs to actually visit `/admin/migrations` and click
  Apply; verify the Pack page afterward. (`fix(admin): restore migration
  route after five-deploy-failure revert left it permanently missing`)
- **Docket badge labeling and persistent docket bar** — the "W" badge is now
  a labeled Gavel+"Docket" pill, and the corner floating Gavel button is a
  full-width bottom bar stating "N on your docket · Hit the Gavel," reviewable
  before ruling, with a one-time coach line. (`fix(docket): label the badge,
  persistent docket bar`)
- **Automatic migrations on deploy, build stamp, branch guard** —
  `npm run migrate` already ran automatically as part of `npm run build`; this
  added the missing piece: a build-time guard that fails if any
  `supabase/migrations/*.sql` file is unregistered (it caught a real, live
  instance — `0033_voice_dna` was neither registered nor excluded), a branch
  guard that fails a production build off the wrong branch, `/api/version`,
  and a footer build stamp. (`feat(build): automatic migrations, build stamp,
  branch guard`)
- **Magic-link accounts and in-app feedback reporter** — passwordless email
  sign-in, with anonymous-session data merged into (never silently replacing)
  an existing account, plus a persistent in-app feedback control. This also
  resolves the "anonymous data loss on /login sign-up" concern below — an
  anonymous session upgrading to email is an in-place link (same user id, no
  data movement), and a genuine two-account collision prompts merge-or-discard
  rather than picking one silently. Not independently re-verified against
  production since implementation — worth a quick real-world check next time
  someone touches auth. (`feat(auth): magic-link accounts and in-app feedback
  reporter`)
