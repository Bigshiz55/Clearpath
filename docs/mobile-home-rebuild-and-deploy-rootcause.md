# Mobile homepage — why edits never reached the phone, and the rebuild

**Date:** 2026-07-24
**Branch this landed on:** `claude/watch-verdict-app-wwbtbg` (the repo **default** branch)

## 1. Root cause: edits were pushed to a branch the deployment never serves

- The repo's **default branch is `claude/watch-verdict-app-wwbtbg`** (`git symbolic-ref refs/remotes/origin/HEAD`).
- Vercel's Production deployment serves the **Production Branch**, which defaults to
  the repo default branch. `vercel.json` pins no branch, so Production = `claude/watch-verdict-app-wwbtbg`.
- All prior mobile/responsive work was committed to **`feature/search-dna-and-search-lab`**
  (PR #3) — **34 commits that were never merged** into the default branch. Pushes to
  that branch produced only **Preview** deployments at *different URLs*.
- Proof: `git merge-base --is-ancestor origin/feature/... origin/claude/...` → **not merged**;
  the four files that render the mobile home all differed between the two branches:
  `src/app/app/page.tsx`, `src/components/BuildCaseBox.tsx`, `src/components/Logo.tsx`,
  `src/app/globals.css`.

**Net:** the phone kept showing the default-branch code (unchanged), while every fix
sat on an unmerged preview branch. This rebuild was therefore done **directly on the
deployed default branch**.

## 2. The exact render tree for the screen (traced, not inferred)

| Layer | File |
|---|---|
| Route | `/app` (authenticated home) |
| Layout | `src/app/app/layout.tsx` → `<Nav>` + `<main>` + a `build <sha> · <branch>` footer |
| Page | `src/app/app/page.tsx` (`DiscoverPage`) |
| Header wordmark | `src/components/Logo.tsx` |
| Hero input | `src/components/BuildCaseBox.tsx` |
| Secondary search | `src/components/SearchBar.tsx` |
| Bottom nav | `src/components/nav/MobileNav.tsx` |
| Styles | `src/app/globals.css` |

No duplicate/abandoned home component renders `/app` — the older `/fresh` and
`/newuser` routes only *reference* "State Your Case" in comments and redirect to `/app`.

## 3. The "WatchVERD_CT" wordmark bug

`Logo.tsx` rendered `Watch` + `VERD` + a **CSS 3D flip element** (`wv-iflip`,
globals.css:256–277: `rotateX` on `preserve-3d` faces with `backface-visibility:hidden`,
slab-serif font) + `CT`. On iOS Safari that 3D face frequently renders blank, leaving a
fixed `0.64em` gap → the brand reads **"WatchVERD_CT"**. The same gimmick was also in
`Tagline.tsx` and the `LiveCourt.tsx` header. **Fix:** all three now render a solid
`Watch``VERDICT` (pink `VERDICT`), no per-letter animation, no fixed-width slot.

## 4. What changed in the rebuild (mobile-first, per spec)

- **Wordmark:** solid **WatchVERDICT** everywhere (Logo, Tagline, LiveCourt).
- **Hero:** replaced the oversized/clipped "Stop scrolling. Get rolling." + big tagline
  with a compact **"What should we watch?"** + "Tell us what you're in the mood for.",
  and moved the ask to the **top** of the page so the input is reachable without scrolling.
- **State Your Case card:** shorter copy, textarea ~112px with the new placeholder,
  **exactly three chips** up front (What's on TV tonight? / Best movies on Netflix /
  Family movie night) + a **More ideas** toggle for the rest.
- **CTA:** full-width **"Hit the Gavel"**, ≥48px, high-contrast pink, **never looks
  disabled** — an empty tap focuses the box instead of sitting greyed out (only dims
  while "Ruling…").
- **Secondary search:** compact **"Search by title, actor, or service"**.
- **Bottom nav:** six tabs (Home / Watch / New / On TV / Saved / More), each **≥44px**,
  labels that fit 320px, safe-area bottom padding.

## 5. Verified in this environment

- `tsc` clean · `next lint` clean · **210 unit tests pass** · `next build` OK.
- **7 mobile Playwright tests pass** (`npm run test:mobile`) across 320/375/390/393/430/480px,
  driving the exact components via the gated `/dev/mobile-home` harness (MOBILE_HARNESS=1):
  solid wordmark (regression guard for "WatchVERD_CT"), compact hero unclipped, 3 chips +
  More ideas, textarea, full-width non-disabled CTA, six ≥44px nav tabs, no horizontal
  overflow, mocked submit fires once (no duplicate on double-tap). Screenshots at
  320/390/430 captured.
- No orphaned processes after the run.

## 6. How to confirm the deploy actually reaches the phone (prevents recurrence)

`src/app/app/layout.tsx` prints **`build <sha> · <branch>`** at the bottom of every
`/app` page from `VERCEL_GIT_COMMIT_SHA` / `VERCEL_GIT_COMMIT_REF` at request time.

After Vercel promotes this commit to Production:
1. Open the production URL's `/app` home on the phone.
2. The footer must read **`build <new sha> · claude/watch-verdict-app-wwbtbg`**.
3. The header must read **WatchVERDICT** (not WatchVERD_CT).

If the footer still shows an old sha, the deploy hasn't promoted — that is the branch/deploy
mismatch, not a code problem. **Guardrail:** ship mobile changes to the Production Branch
(`claude/watch-verdict-app-wwbtbg`), or change Vercel's Production Branch, so preview-only
pushes can never masquerade as "shipped" again.

## 7. Not verified here (needs the user / live env)

- The **actual live phone screen** — I cannot fetch the production URL from this sandbox
  (no URL provided) or view the device. Verification = the two checks in §6, on the phone.
- Physical iPhone pass, live TMDB/Supabase flows, and the broader RC checklist remain as
  previously documented; unchanged by this UI rebuild.
