# BACKLOG.md — living work queue

Updated at the end of every work order per the Working Agreement in
`CLAUDE.md`. Sections: **Now**, **Next**, **Blocked**, **Done**.

## Now
- **Voice DNA preview authentication — diagnosed with live evidence; the
  reported localhost redirect is NOT reproducible from the current
  configuration.** A magic link requested on the preview was reported to land
  on `http://localhost:3000`. Three independent probes from a GitHub runner
  (this agent container has no egress — `CONNECT` 403 to `supabase.com`,
  `api.vercel.com` and `*.vercel.app`) say that cannot happen today:
  1. `/auth/v1/verify` validates `redirect_to` before it reads the token, so
     an invalid token reveals the routing. The **preview deployment URL** and
     the **branch alias** are both echoed back — allow-listed. **`http://localhost:3000`
     is REJECTED** and falls back to Site URL `https://clearpath-pearl-chi.vercel.app`.
     Supabase has no route that sends anyone to localhost.
  2. No app code can produce it either: every `emailRedirectTo` in the repo
     (`LoginForm`, `GuestSaveButton`) is built from `window.location.origin`,
     `/auth/callback` redirects using the request origin, and
     `next.config.mjs` self-heals `NEXT_PUBLIC_SITE_URL` from Vercel system
     env on any real deployment.
  3. A **real magic link** sent to a disposable mailbox arrives on the DEFAULT
     Supabase template (`{{ .ConfirmationURL }}` → `/auth/v1/verify`), so the
     template is not hardcoding a host — the one mechanism the redirect probe
     cannot see. Runs
     [31389040960](https://github.com/Bigshiz55/Clearpath/actions/runs/31389040960)
     and [31389678546](https://github.com/Bigshiz55/Clearpath/actions/runs/31389678546).
  Most likely explanation for what was seen: a link from an older email,
  generated when the project's URL configuration differed. A magic link carries
  the `redirect_to` validated **at send time**, so an old email keeps going to
  an old place regardless of today's dashboard. Not provable after the fact,
  and not fixable in code.
- **`/voice-dna` needs no sign-in at all.** `POST /auth/v1/signup` with an empty
  body returns 200, so anonymous sign-ins are ENABLED; middleware mints a guest
  session on the way in. Email login is only for attaching the resulting DNA to
  a named account.
- **Shipped anyway, because the failure mode was silent:** `/login` now runs a
  server-side preflight (`src/lib/auth/redirectCheck.ts`) asking Supabase where
  a link from this exact origin would land, and refuses to send one that would
  strand the person — naming the destination instead. Supabase substitutes the
  Site URL rather than erroring, so without this the app cannot tell a good
  deployment from a bad one. Fails OPEN on every ambiguous outcome; memoised
  per origin; a negative is held 60s so correcting an allow-list needs no
  redeploy. 11 unit tests pin the asymmetry.
- **Still blocked on ONE owner action for automated live verification: Vercel
  Deployment Protection.** Every path on both the preview URL and the branch
  alias 302s to `vercel.com/sso-api`, so the 15-row matrix asserts against
  Vercel's login page (row `A0`, other 14 skipped). Confirmed again on
  [31389041030](https://github.com/Bigshiz55/Clearpath/actions/runs/31389041030).
  No repository secrets exist (`VERCEL_TOKEN`, `VERCEL_AUTOMATION_BYPASS_SECRET`,
  `VOICE_DNA_SHARE_TOKEN`, `PREVIEW_TEST_SECRET` all report `false`), and this
  container holds a `VERCEL_TOKEN` it cannot use because it has no network.
  A human signed into Vercel passes the wall in a browser and is unaffected.
- **Cleanup owed:** one disposable Supabase user (`wv-authprobe-*@emalupe.com`)
  was created by the end-to-end email proof and cannot be removed without the
  service-role key. It holds no data. The temporary preview-test auth, the
  matrix harness and both probe workflows are still pending removal — checklist
  in `docs/VOICE_DNA_LIVE_VERIFICATION.md` §7.
- **Standing action needed from you:** open `/admin/migrations` on
  production and apply pending migrations with your `MIGRATE_SECRET` — see
  the "Restored: /admin/migrations" entry below for why this is currently
  required and what it unblocks. (Now also gates Voice DNA persistence and
  resume: migration 0047.)

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
- **The quiz now covers thirty axes, not twenty — westerns, superheroes,
  cartoons and the rest.** Reported: it asked about crime, comedy and sci-fi and
  never about the things half a real watchlist is made of, so those tastes were
  unaskable, unlearnable, and absent from every Verd1ct. Ten axes added to
  `QUICK_TRAITS` (animation, superhero, western, musical, sport, war, period,
  martialArts, family, reality) — chosen because NO combination of the existing
  twenty can express them: "loves cartoons" is not comedy plus fantasy. The
  decision bank roughly triples (25 → 60 choices, 8 → 21 dealbreakers, 6 → 10
  vibes) and 16 diagnostic titles cover the new ground. Three tests pin it:
  ≥30 axes reachable from the bank, every new axis has both a way to want it
  and a way to refuse it (a taste you can only agree with is a leading
  question — this caught `martialArts` having no "no"), and every family holds
  ≥8 options so replays do not run dry.
  **Trade-off, stated plainly:** thirty axes over 25–35 decisions is thinner
  per axis than twenty was, so one play reads broader but less deep — which is
  what the replay accumulation above is for. Three existing tests broke and all
  three were measuring the wrong quantity once a trait can be touched exactly
  once: the weighted mean sits AT the target on a first observation by design,
  so persona separation now compares confidence-weighted preference (what
  ranking actually multiplies by) and "one film is not a settled fact" now
  asserts confidence rather than preference.
- **Verd1ct Rush is replayable, and a replay is all new ground.** The DNA a
  play builds now outlives it (`src/lib/dnagame/persist.ts` — localStorage, so
  it works for a guest; degrades to a fresh game on any failure). A later run
  starts from the profile earlier runs learned and NEVER re-asks anything it
  has already put on screen. That last part needed a distinction the engine did
  not have: `usedChoiceIds` is what a run CONSUMED, and inside one run an option
  passed over is deliberately left in the bank (retiring everything shown
  emptied it after eighteen decisions). Across runs the opposite is right, so
  `everShown` reports everything displayed and that is what persistence folds
  in — a unit test proved options really did repeat before this. `startGame`
  now recycles an exhausted bank rather than handing a returning player a game
  with nothing in it. The ready screen tells a returning player what they are
  carrying (rounds, decisions, % known).
- **The Docket coach mark no longer covers the poster it is explaining.**
  Reported from a phone. It hung off the W button's own rect, which put a 216px
  panel over that poster and the next one along in a rail. It now docks to the
  bottom of the viewport above the tab bar — measured from `[data-app-bottomnav]`
  rather than assumed, since that bar's height moves with the safe-area inset —
  and a browser test asserts it overlaps no poster on screen.
- **Wheel buttons sat off their wedges whenever a round dealt fewer than six
  choices.** Reported live from a phone: five labels on a six-wedge wheel, two of
  them straddling a seam. The buttons were laid out across `slots.length` while
  the picture always draws six segments, so a five-choice round spaced them at
  72° over a 60° wheel and everything after the first drifted. A round can
  legally deal four or five (a family runs out of unused options), so a slot now
  takes ITS OWN FAMILY'S seat rather than its position in the array, and a wedge
  with nothing dealt to it is dimmed instead of painted at full strength — six
  full-strength colours promised six buttons when only five were pressable. New
  browser test pins the invariant without duplicating the family order: every
  bisector is 30° modulo 60, and a family never changes seat mid-game. Verified
  it FAILS on the old code ("thrill moved seats") before taking the fix.
- **VERD1CT RUSH is now played inside the wheel, and it keeps score.** The
  question moved from a heading above the circle into the hub, and the six
  answers moved from a card grid below the circle into the wedges themselves —
  one glance, one thumb, no scrolling between the question and the options.
  Each wedge is a real `<button>` clipped to its own sector (`clip-path`) and
  sized to that sector's bounding box, so the tap area is the whole wedge, a
  neighbouring wedge can never steal a tap, and the element's centre lands
  inside its own sector for pointer hit-testing. Labels, reading order,
  keyboard focus and the focus ring survive intact — the ring is drawn on the
  label because an outline on the button would be clipped away. The six faces
  are painted in full accent with a real angular gap and a dark seam between
  them, and lettered in whichever ink clears WCAG contrast on that accent
  (computed per wedge, not chosen by eye — white on amber and near-black on
  purple are both about 2:1). That pushed CONFIDENCE off the fill and onto its
  own arc around the rim: the rule is that affinity and confidence never share
  a channel, and dimming an unknown wedge honoured it while making half the
  buttons unreadable. The picture-mode wheel (opening screen, reveal) has no
  buttons to keep legible, so there the fill still carries confidence across
  its full range. Label type size steps down for long words and long labels,
  because a fixed-width box inside a 56-degree sector is bounded by its corners
  and a word wider than the box gets sliced by the clip rather than wrapped —
  a browser test now measures every label against its own wedge so that cannot
  regress silently. Label type is sized in `cqw` against the wheel itself: a
  breakpoint step cannot hold, because the desktop wheel is only a tenth wider
  than the phone's while an `sm:` bump that reads as a real increase is far
  more — which is how "documentary" became 92px of word in an 87px box.
  The hub is deliberately small (37% of the wheel, not 45%): every unit it gives
  back goes into the ring, which is where the game is actually played, and the
  hub's own type scales in `cqw` so the question still fills the smaller circle.
  New pure scoring layer (`src/lib/dnagame/score.ts`, 20 unit tests): points reward the
  UNCERTAINTY A DECISION RESOLVED — never a "right" answer — with bounded speed
  and streak multipliers (best tap ≤ 7.5× the worst, so a 30-decision game is
  not decided by two lucky moments) and a flat acknowledgement for "haven't
  seen it". Score, streak and per-decision points live in `GameState`, so they
  survive a reload and a resumed pre-scoring session reads as 0 rather than
  NaN. Selection snap tightened 180ms → 140ms.
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
