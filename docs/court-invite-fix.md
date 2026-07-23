# Court "Send invite" — reliability + layout fix

## Root cause

`src/components/LiveCourt.tsx` had an `invite()` that:
- was attached to a `<button onClick={invite}>` with **no `type`** (fragile if ever
  wrapped in a form),
- called `navigator.share()` inside a bare `try { … } catch { /* cancelled */ }`
  that **swallowed every error** — real failures looked identical to a cancel,
- on unsupported/failed share did `navigator.clipboard?.writeText(url)` with **no
  toast or any visible feedback**, so on iPhone (share cancelled, or clipboard
  blocked) the button appeared to "do nothing",
- had **no duplicate-tap guard**, **no `execCommand` fallback**, and **no manual
  modal** last resort.

Separately, the QR was rendered from a **220px** SVG injected into a fixed
**176px** (`h-44 w-44`) box, so it overflowed and the invite URL overlapped it. The
"QR code" button also re-fetched instead of toggling off.

## Files changed

- **`src/lib/courtInvite.ts`** (new) — pure, injectable `runInvite()` implementing
  the exact flow, plus `copyViaExecCommand()`. iOS-safe: `navigator.share()` is
  invoked **synchronously** (promise created before any `await`) directly in the tap
  — no `setTimeout`, no awaited network call before it.
- **`src/components/court/CourtInviteBox.tsx`** (new) — the invite panel: reliable
  button with live states, toast, manual modal, and the responsive QR/URL layout.
- **`src/components/LiveCourt.tsx`** — uses `CourtInviteBox`; old `invite()` removed;
  `showQr()` now truly toggles the QR off.
- **`src/lib/courtInvite.test.ts`** (new) — 9 unit tests.
- **`src/app/dev/court-invite/`** (new) — gated harness (`page.tsx` + `Harness.tsx`).
- **`tests/responsive/court-invite.spec.ts`** (new) — 8 Playwright tests at 390px.

## Exact behavior now

1. **Tap** → `navigator.share({title:"Join my WatchVerdict Court", text:"Join my
   WatchVerdict Court and help decide what we should watch.", url})` with the
   canonical court URL (`${origin}/court/${code}`), invoked synchronously.
2. **Share resolves** → done (native sheet handled it; no toast).
3. **User cancels** (AbortError/NotAllowedError/"cancel") → treated as a no-op: no
   error, no clipboard, no toast, label restored.
4. **Share unsupported or throws a non-cancel error** → `navigator.clipboard
   .writeText(url)`; if unavailable/throws → off-screen `<textarea>` +
   `document.execCommand('copy')`. On success → toast **"Invite link copied"**.
5. **Everything fails** → centered modal with the URL, a **Copy link** button, and a
   **Close** button.
6. **Button states:** `✉️ Send invite` → `Opening share…` (disabled) → `✅ Link
   copied`, restored to default after ~2s.
7. **Duplicate taps** are ignored while an action is in flight (a ref lock; only one
   `share()` call).
8. **Dev-only** `console.log('[court-invite]', …)` traces: clicked, generated URL,
   share supported/unsupported, success, cancelled, clipboard success, final failure.
9. **iOS:** direct-from-gesture share, no `setTimeout`, no pre-share network; URL is
   computed at render and passed in. Production is HTTPS (secure context) so
   `navigator.share`/`clipboard` are available.
10. **Layout:** `type="button"`, `pointer-events:auto`, `relative z-10`, not disabled
    except while sharing, not covered by any layer. QR is `width:min(72vw,280px);
    height:auto`, fully inside its card (the injected SVG is forced to `w-full
    h-auto`); the URL sits **below** the QR and wraps cleanly; the Send-invite and
    Hide-QR buttons share one row and wrap/stack on narrow phones.

## Test results

- **Unit (`courtInvite.test.ts`, 9):** share success (correct URL + copy), cancel =
  no-op, unsupported → clipboard, non-cancel error → clipboard, clipboard
  unavailable → execCommand, clipboard+exec fail → manual modal, rapid taps → one
  share call, empty URL guarded, exact share payload.
- **Playwright (`court-invite.spec.ts`, 8 @ 390px):** real enabled unobstructed
  `<button type=button>`; share success shares the correct court URL with no
  fallback; cancel shows no toast/modal and restores the label; unsupported →
  "Invite link copied" toast + clipboard write of the URL; share error → clipboard +
  toast; clip+exec fail → centered modal with URL/Copy/Close; rapid triple-tap →
  exactly one `share` call (button shows "Opening share…" and is disabled); QR fully
  inside the card, responsively sized, URL below it, no horizontal overflow.
- Full suites: **370 unit tests**, **49 Playwright tests**, typecheck, lint, and
  production build all pass.

## Manual / emulation

Verified via Chromium mobile emulation at 390px (screenshot:
`test-results/court-invite/court-invite-390.png`). No physical iPhone Safari device
is available in this environment; the code follows the iOS Web Share rules
(synchronous, gesture-bound, HTTPS) that were the cause of the failure.

## Redeploy?

**Yes — production must be redeployed** to pick up the change. This is a
client-component fix (`LiveCourt` + new modules); no schema/migration/env changes.
After redeploy the "Send invite" button works on iPhone/Android/desktop and inside
installed web apps.

Do not merge or deploy from here.
