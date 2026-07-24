# WatchVerdict — Device Validation Checklist (two physical iPhones)

**Purpose:** These are the checks that a headless CI environment **cannot**
perform — real iOS Safari rendering, the native iMessage share sheet, PWA install
behavior, touch targets under a real thumb, and true two-device Live Court. Run
every step on **two different physical iPhones** (ideally different sizes/iOS
versions) and record the actual result. **Do not mark PASS unless you personally
observed it.**

## Setup

- **Device A:** _model ______ · iOS ______ · Safari / installed PWA (circle one)_
- **Device B:** _model ______ · iOS ______ · Safari / installed PWA (circle one)_
- **Deployment URL under test:** `https://__________________________`
- Both devices on the **same** deployment URL (critical for Court invites).
- Test account email/password (for signed-in flows): `__________________`
- Result key per step: **PASS** / **FAIL** / **N/A**. Add a note on every FAIL.

> Fill the deployment URL and account **before** starting; a wrong/stale URL is
> the #1 cause of "friends can't join."

---

## 1. First load & install

| # | Step | Device A | Device B |
|---|------|----------|----------|
| 1.1 | Open the URL in Safari; landing page paints < 3s, no layout jump | ☐ | ☐ |
| 1.2 | No horizontal scroll anywhere on the landing page | ☐ | ☐ |
| 1.3 | Logo wordmark reads full "WatchVERDICT", not clipped | ☐ | ☐ |
| 1.4 | "Add to Home Screen" installs; icon + name correct | ☐ | ☐ |
| 1.5 | Launch from home-screen icon: opens standalone (no Safari chrome) | ☐ | ☐ |
| 1.6 | Offline: enable Airplane mode, reopen → `/offline` fallback, not a crash | ☐ | ☐ |

## 2. Auth

| # | Step | Device A | Device B |
|---|------|----------|----------|
| 2.1 | Tap into `/app` while logged out → login screen (or guest session mints) | ☐ | ☐ |
| 2.2 | Magic-link: enter email, receive email, tap link, land in `/app` | ☐ | ☐ |
| 2.3 | Password sign-in works (if account has a password) | ☐ | ☐ |
| 2.4 | Session persists after closing/reopening the app | ☐ | ☐ |
| 2.5 | Sign out returns to a logged-out state cleanly | ☐ | ☐ |

## 3. Search, verdict & providers

| # | Step | Device A | Device B |
|---|------|----------|----------|
| 3.1 | Search "matrix" → real results appear, tappable | ☐ | ☐ |
| 3.2 | Open a title → Watchability verdict + score render | ☐ | ☐ |
| 3.3 | Ratings row: IMDb shows a real number **or is hidden** — never "IMDb —/0.0" | ☐ | ☐ |
| 3.4 | Streaming providers shown; missing availability labeled, **not fabricated** | ☐ | ☐ |
| 3.5 | Add to watchlist → appears in watchlist; remove works | ☐ | ☐ |
| 3.6 | Watchlist persists after reopening the app | ☐ | ☐ |

## 4. Recommendations & DNA

| # | Step | Device A | Device B |
|---|------|----------|----------|
| 4.1 | Home/recommendations show ranked titles (no empty grid, no spinner-forever) | ☐ | ☐ |
| 4.2 | Rate/interact with a few titles; Watch DNA updates | ☐ | ☐ |
| 4.3 | Reopen later: DNA/personalization persisted | ☐ | ☐ |
| 4.4 | Judge Verdict / "State Your Case" flow completes with a result | ☐ | ☐ |

## 5. Live Court — the two-device test (the whole point)

Do this with **both** phones together.

| # | Step | Device A (host) | Device B (guest) |
|---|------|-----------------|------------------|
| 5.1 | Device A: create a Court room; "Send invite" is visible on the first screen | ☐ | — |
| 5.2 | Tap "Send invite": the **native iOS share sheet opens** (iMessage first) | ☐ | — |
| 5.3 | Send the invite to Device B via iMessage | ☐ | — |
| 5.4 | Device B: tap the received link → opens the app on the **same room** | — | ☐ |
| 5.5 | Device B joins; **Device A sees Device B appear** (both show 2 people) | ☐ | ☐ |
| 5.6 | Re-open the same link on Device B again → **same seat, no duplicate/ghost** | — | ☐ |
| 5.7 | Both make picks; the group result reflects both sets of picks | ☐ | ☐ |
| 5.8 | Host closes the room → Device B sees a clear "room ended" state, not a spinner | ☐ | ☐ |
| 5.9 | Open a made-up room code → clear "doesn't exist" recovery, never endless "Connecting…" | ☐ | ☐ |
| 5.10 | QR path: Device B scans the QR from Device A → same room joins | ☐ | ☐ |

> If 5.4/5.5 fail, first confirm both phones are on the **same deployment URL**
> and that Court migration `0023` is applied on the target Supabase project
> (`/api/court/health` should report `has_guest_id: true`).

## 6. Touch, layout & accessibility (real hardware)

| # | Step | Device A | Device B |
|---|------|----------|----------|
| 6.1 | Every primary button is comfortably tappable (no mis-taps, ≥44px) | ☐ | ☐ |
| 6.2 | Fixed bottom nav never covers the last row of content | ☐ | ☐ |
| 6.3 | Rotate to landscape: no overflow, controls still reachable | ☐ | ☐ |
| 6.4 | iOS Dynamic Type at a large setting: text reflows, nothing clipped | ☐ | ☐ |
| 6.5 | VoiceOver: can navigate landing + a title page; labels make sense | ☐ | ☐ |
| 6.6 | Safe-area: content clears the notch/Dynamic Island and home indicator | ☐ | ☐ |
| 6.7 | Dark environment / low brightness: text remains legible | ☐ | ☐ |

## 7. Resilience

| # | Step | Device A | Device B |
|---|------|----------|----------|
| 7.1 | Drop to a slow network (throttle): no infinite spinners; timeouts recover | ☐ | ☐ |
| 7.2 | Background the app mid-Court, return: state re-syncs, no stuck screen | ☐ | ☐ |
| 7.3 | Kill and relaunch mid-flow: no data loss beyond expected | ☐ | ☐ |

---

## Sign-off

- Tester name: ______________________  Date: ____________
- Device A overall: **PASS / FAIL** — notes: ______________________
- Device B overall: **PASS / FAIL** — notes: ______________________
- **Any FAIL here blocks release** until fixed and re-verified on hardware.
