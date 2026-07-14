# Known Issues

| # | Severity | Issue | Status / Mitigation |
|---|----------|-------|---------------------|
| 1 | Blocker (external) | Not deployed to a public URL | Needs owner's TMDB/Supabase keys + Vercel login. Everything else complete. See OWNER_INSTRUCTIONS.md. |
| 2 | Info | End-to-end flows (live search, sign-up, providers, OMDb) not exercised in-sandbox | No API keys available here. Code paths are unit/build-verified; verify live after deploy using the TEST_MATRIX. |
| 3 | Low | `npm audit`: 5 findings, 0 critical | All dev/build-only (glob, postcss, eslint tooling) or Next advisories not applicable to this app (no next/image component, no i18n/rewrites/websocket/CSP-nonce, App Router only). Revisit via a Next 16 upgrade in a dedicated pass. DECISION_LOG D15. |
| 4 | Low | Voice search unsupported in some browsers (e.g. Firefox) | Feature-detected; the mic button only appears where the Web Speech API exists. Typing always works. |
| 5 | Low | Critic ratings absent unless `OMDB_API_KEY` is set | By design — optional provider. Verdicts still compute from TMDB audience data and clearly label critic scores as unavailable. |
| 6 | Low | Provider/availability data can change and may lag | Shown exactly as TMDB/JustWatch report it, with attribution and a "may change" note. Never claimed as guaranteed-current. |
