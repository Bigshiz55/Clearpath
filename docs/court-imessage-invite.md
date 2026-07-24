# Live Court "Send invite" — native iOS share sheet (final)

Tapping **Send invite** opens the native iOS share sheet (Messages/iMessage, Mail,
WhatsApp, Copy…) directly from the tap, with a reliable clipboard→modal fallback.

## Exact root cause (why the tap did nothing)

Two independent defects, fixed:

1. **A double duplicate-tap lock that ate the tap.** The component's `onInvite`
   set `lock.current = true` *before* calling `runInvite`, and `runInvite` begins
   by checking that same lock and bailing as a duplicate — so it returned
   `ignored-duplicate` and **never called `navigator.share()`**. The button looked
   tappable and produced no sheet, no toast, no error: a silent no-op. Fix: the
   component no longer pre-sets the lock; `runInvite` owns it (sets it true *after*
   its own guard, releases in `finally`). This was the concrete reason the tap did
   nothing in the harness and is the class of bug that reproduces on-device.
2. **The button could get stuck `disabled`.** The Send button was
   `disabled={state === 'sharing'}`; if a `navigator.share()` promise ever hung
   (a known iOS/PWA quirk) or a prior run left the state, the button stayed
   permanently disabled → "tapping does nothing." Fix: the button is **never**
   `disabled`; a **time-bounded** ref-lock (auto-released after 1.5s) prevents
   double-taps without ever freezing the control.

The full checklist findings: the share call is now synchronous inside the tap (no
awaited fetch/auth/room-creation before it, no `window.open` first); the URL is
prepared before the tap and validated (`isValidInviteUrl`); a real
`<button type="button">`; `pointer-events:auto`, `touch-action:manipulation`,
`z-10`, not covered (asserted via `elementFromPoint`); no nested interactive HTML;
`/court/[code]` is top-level (not an iframe). HTTPS + production Web Share support
are device/deploy conditions covered by the manual steps.

## Behavior now

Tap **📨 Send invite** →
1. `navigator.share({ title: "Join my WatchVERD1CT Court", text: "Help us decide what
   to watch tonight. Join my WatchVERD1CT Court:", url: <prod room URL> })`, invoked
   synchronously → iOS share sheet → pick Messages → send over iMessage.
2. Dismiss (AbortError) → silent no-op.
3. Share unsupported / non-cancel error → copy `"<message> <url>"` to the clipboard →
   toast **"Invite link copied — paste it into Messages."**
4. Clipboard also fails → **manual modal**: the full invitation, **Open Messages**
   (`sms:&body=<encoded message+url>`), **Copy invitation**, **Close**.
5. URL not ready/invalid → visible error toast "The invitation link is not ready yet."

Every non-cancel outcome is visible — a tap never silently does nothing.

## Layout (iPhone-first)

- **Send invite** is the full-width primary button, **≥52px**, `touch-action:
  manipulation`, active/pressed state; **QR code** is the secondary button. Stacked
  vertically with ≥12px gap on phones, side-by-side from 420px.
- The raw URL is replaced by a **compact one-line row**: 🔗 `host/court/…`
  (truncated) + a separate **Copy** control — never overlaps the buttons or escapes
  the card (asserted at 320/375/390).

## URL / room / auth

- Production origin: `NEXT_PUBLIC_SITE_URL` (inlined) → falls back to
  `window.location.origin` (which in production is the HTTPS prod domain, e.g.
  `clearpath-pearl-chi.vercel.app`).
- Secure room id: the code from `court_create` → `/court/<code>`.
- `/court/[code]` is a top-level, guest-joinable route (Court RPCs granted to
  `anon`), so the recipient's link opens the exact room with no login wall;
  preserved through login/signup because the code is in the URL path.

## Files changed

- `src/lib/courtInvite.ts` — `isValidInviteUrl`, `inviteShareData`,
  `inviteClipboardText`, `smsHref`, `displayInviteUrl`, and `runInvite`
  (share → cancel no-op → clipboard/toast → manual modal → visible error).
- `src/components/court/CourtInviteBox.tsx` — full-width 52px Send invite, QR
  secondary, compact truncated URL row + Copy, error/copied toasts, manual modal;
  time-bounded lock (never `disabled`).
- `src/components/LiveCourt.tsx` — production-domain invite URL.
- `src/app/dev/court-invite/{page,Harness}.tsx` — harness uses the prod-style URL and
  a `missing` mode for the invalid-URL path.
- `src/lib/courtInvite.test.ts` (14) + `tests/responsive/court-invite.spec.ts` (10).

## Commands run — real results

- `npm run lint` → clean · `npm run typecheck` → clean
- `npm test` → **392 passed** · `npm run build` → success
- `npx playwright test court-invite.spec.ts` → **10 passed**; full Playwright → **52 passed**
- Console: only the dev-only `[court-invite]` traces (gated to non-production).

## Automated (Chromium) vs. manual iPhone

Automated (10 Playwright): tap calls `navigator.share` once with the correct prod
URL from the click; AbortError → no error/modal; non-abort → clipboard + toast;
unsupported → clipboard + toast; clipboard fail → modal with a valid `sms:` link;
invalid URL → visible error, no share; rapid taps → one share, never permanently
disabled; no invisible element blocks the button; no overflow + ≥52px button + URL
row contained at 320/375/390.

**Manual (required — Playwright can't drive the iOS share sheet/Messages):**
1. iPhone **Safari** over HTTPS: start a Court, reach the waiting room, tap **Send
   invite** → confirm the **native share sheet opens** and Messages is selectable
   with the invitation + link prefilled; send it.
2. iPhone **installed PWA** (Add to Home Screen, standalone): repeat step 1.
3. **Android Chrome / desktop Chrome**: share sheet where supported, else the
   copied toast. **Desktop Safari / Firefox**: copied toast or modal.
4. Dismiss the sheet → nothing breaks, button resets.
5. **Recipient (second user / second phone):** open the link from Messages → lands
   in the **same room**, joins and picks without a login wall.

## Remaining limitation

The actual iOS share-sheet → Messages hand-off and the installed-PWA path can only be
confirmed on a physical device (Playwright/Chromium can't invoke the OS sheet). The
code satisfies the iOS rules (synchronous, gesture-bound, HTTPS, validated absolute
URL); step-through above is the on-device confirmation. Do not merge or deploy.
