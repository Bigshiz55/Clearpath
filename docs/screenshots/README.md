# Baseline & Localized Screenshots

Playwright + Chromium are available in CI/dev (PLAYWRIGHT_BROWSERS_PATH=/opt/pw-browsers),
but the authenticated product (`/app/**`) needs a live Supabase session + TMDB data
and `NEXT_PUBLIC_SUPABASE_*` at runtime to render. Capture the group-23 matrix
against a seeded staging deploy (or local run with real env + a seeded demo user).

- `baseline/`  — English "before" screens, viewports 320×568 … 1920×1080.
- `localized/` — en / es / zh at 375×667, 390×844, 768×1024, 1280×800, 1440×900.

Screens: Home, Ask, recommendation cards, voice results, discovery, New Releases
(+expanded filters), On TV, TV Guide Detective, Watchlist, missing-poster, full
Verdict, Watch DNA, taste dials, Share DNA, Friends, Subscription Value, Tonight
Together, Live Taste Court, Synced Jury, on-device Jury, Profile, Court Standing,
Badge shelf, mobile nav, empty/loading/error/waiting-room states.
