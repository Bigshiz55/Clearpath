# Live Court invite — iMessage-first

Redesigns the Court invite around the native iOS share sheet so a host can send the
invitation over **iMessage** in one tap, with a polished fallback that includes an
**Open Messages** (`sms:`) deep link.

## Root cause — "why the Invite button didn't open the share sheet"

Checklist, with findings for this codebase:

| Check | Finding |
|---|---|
| `navigator.share()` called directly from the tap? | **Yes now** — `runInvite` creates the `share()` promise synchronously inside the click handler *before* any `await`, so iOS accepts the user gesture. (The pre-refactor `invite()` also called it in the tap, but…) |
| An `async`/network op before `share()`? | **No** — the invite URL is computed at render (`shareUrl`), not fetched on tap; nothing is awaited before `share()`. |
| Is the URL valid? | **Yes** — `https://<prod>/court/<code>`, an absolute HTTPS URL (`inviteShareData` passes it as `url`). An invalid/relative URL makes iOS reject the share; ours is absolute. |
| Served over HTTPS? | **Required** — `navigator.share`/`clipboard` only exist in a secure context. Production is HTTPS; on plain-HTTP or a non-secure preview the API is absent → we now fall to the modal instead of doing nothing. |
| Button disabled / covered? | **No** — `type="button"`, `pointer-events:auto`, `relative z-10`; only disabled during the brief "Opening Messages…" state. Playwright asserts it's the top element at its center and not covered. |
| Exception swallowed? | **This was the real defect.** The old handler wrapped `share()` in a bare `catch {}` and then silently `writeText`'d with no UI, so a cancel, an unsupported browser, or a thrown error all looked identical: "nothing happened." Now a cancel is a clean no-op, and any other failure **opens the visible fallback modal** — the button never silently fails. |
| Called inside an iframe? | **No** — Court renders at the top-level route `/court/[code]`, not embedded. (Web Share is blocked in cross-origin iframes without `allow="web-share"`; N/A here.) |
| Production supports Web Share? | **Yes on iOS Safari** (and Android Chrome). Desktop Firefox/older browsers don't — those now get the modal (Copy link / Open Messages / Copy full), never a dead button. |

**Summary:** the flow was already gesture-synchronous, but failures were swallowed with no fallback UI, so on any device/context where the sheet didn't open the button appeared broken. The fix makes the fallback explicit and iMessage-oriented.

## Exact behavior now

1. Tap **💬 Invite** → `navigator.share({ title: "WatchVerdict Live Court", text: <friendly message, room name woven in>, url: <prod room URL> })`, invoked synchronously in the gesture → iOS share sheet opens → user picks **Messages** → sends over iMessage. We never auto-send (browsers can't) and never show an in-app recipient picker.
2. **Cancel** (dismiss sheet) → clean no-op.
3. **Share unavailable or throws** → a polished modal:
   - **Open Messages** — an `sms:&body=<encoded message + URL>` link (iOS opens Messages prefilled).
   - **Copy invite link** — copies the room URL, confirms "Invite link copied".
   - **Copy full invitation** — copies message + URL, confirms "Invitation copied".
   - Close. Every copy shows a clear confirmation; the button never silently fails.

Copy: *"Join me in WatchVerdict Live Court (room ABCD). We'll each pick our favorites, then WatchVerdict will combine our taste and choose what we should watch tonight."*

## URL / room / auth

- **Production domain:** `NEXT_PUBLIC_SITE_URL` (inlined at build) is preferred; falls back to `window.location.origin` (which in production *is* the HTTPS production domain).
- **Secure room id:** the 8-char room code from `court_create` (`/court/<code>`).
- **Invitation preserved through login/signup + joins the exact room:** `/court/[code]` is a **top-level route, not under the `/app` auth gate**, and Court RPCs allow guests (`court_join` granted to `anon`). So opening the link lands the recipient directly in the exact room — no login wall — and if they do sign in, the code is in the URL path and preserved.

## Files changed

- `src/lib/courtInvite.ts` — iMessage-first pure logic: `inviteMessage`/`inviteShareData` (room-name aware), `fullInvitation`, `smsHref` (URL-encoded `sms:&body=`), `runInvite` (share → cancel no-op → **fallback modal**), `copyText` helper.
- `src/components/court/CourtInviteBox.tsx` — 💬 Invite button + modal with **Open Messages / Copy invite link / Copy full invitation** and clear copy confirmations; `roomName` prop.
- `src/components/LiveCourt.tsx` — production-domain invite URL (`NEXT_PUBLIC_SITE_URL` → origin) + passes `roomName` (`room <code>`).
- `src/app/dev/court-invite/Harness.tsx` — passes `roomName`.
- `src/lib/courtInvite.test.ts` — 11 unit tests (share payload, room-name copy, `smsHref` encoding, `fullInvitation`, cancel/unsupported/error → modal, dedupe, `copyText`).
- `tests/responsive/court-invite.spec.ts` — 8 Playwright tests (below).

## Automated browser verification (Chromium) — what Playwright CAN check

**8/8 pass @ 390px:** real enabled unobstructed `<button type=button>`; tap calls `navigator.share` once with the correct title + friendly message + **production URL**; cancel → no modal, label restored; unsupported/error → the polished modal with **Open Messages** (`sms:&body=` deep link carrying the encoded message + URL), Copy link, Copy full; both copies confirm and copy the right text; rapid taps → exactly one share call; QR inside its card with the URL below it, no overflow. Unit: **11/11**. Typecheck, lint, build, full suite green.

## Manual iPhone verification (required — Playwright cannot drive the iOS share sheet or Messages)

Playwright can't open the real share sheet or the Messages app, so these steps must be done on a device:

**Sender (iPhone Safari, ~390px):**
1. Open the production site over **HTTPS**, start a Live Court, reach the waiting room.
2. Tap **💬 Invite** → confirm the **native share sheet opens** immediately.
3. Confirm **Messages** appears as a target; select it → the prewritten invitation (message + room link) is prefilled in a new iMessage.
4. Send to the recipient. (Optional) tap Cancel instead → confirm nothing breaks and the button resets.
5. Fallback: in a browser without Web Share (or if the sheet is dismissed), confirm the modal's **Open Messages** opens Messages prefilled, and both Copy actions show a confirmation.

**Recipient (a second, separate user / second iPhone):**
6. Open the received link from Messages → confirm it opens **the exact same room** (same code) and can join and pick, without being forced to log in.
7. Verify sender and recipient appear together in the same waiting room and the draft proceeds.

Do not merge or deploy.
