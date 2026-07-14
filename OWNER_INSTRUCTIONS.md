# WatchVerdict — Owner Instructions (plain-English)

This is the non-technical guide for you (Scott) and your friends.

## A. Getting it live (one-time, ~15 min)

You've already done the hard part (the database is set up). Remaining:

1. **Get a free TMDB key** → https://www.themoviedb.org/settings/api → copy the
   **API Read Access Token**.
2. **Get your Supabase keys** → https://supabase.com/dashboard/project/vajgviraxigkwlvysxfz/settings/api
   - `anon`/`publishable` key
   - `service_role` key (secret)
   - Project URL is: `https://vajgviraxigkwlvysxfz.supabase.co`
3. **Run the digest migration too**: in the Supabase SQL Editor, also run
   `supabase/migrations/0002_digest.sql` (adds the daily "New for you" digest).
4. **Deploy on Vercel** → https://vercel.com → sign in with GitHub → **Add New →
   Project** → import **Bigshiz55/Clearpath** → add these Environment Variables:
   - `NEXT_PUBLIC_SUPABASE_URL` = the Project URL above
   - `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` = anon key
   - `SUPABASE_SERVICE_ROLE_KEY` = service_role key
   - `TMDB_API_KEY` = your TMDB token
   - `CRON_SECRET` = any long random string (turns on the daily scan)
   - `NEXT_PUBLIC_SITE_URL` = (leave blank; set to your Vercel URL after first deploy, then Redeploy)
   - *(optional)* `OMDB_API_KEY` = free key from https://www.omdbapi.com/apikey.aspx for critic ratings (IMDb/RT/Metacritic)
   - *(optional)* `RESEND_API_KEY` = free key from https://resend.com to email the daily digest
4. **Deploy**, copy your URL, set `NEXT_PUBLIC_SITE_URL` to it, **Redeploy**.
5. **Supabase → Authentication → URL Configuration**: set Site URL to your Vercel
   URL and add `https://<your-url>/auth/callback` to Redirect URLs. (Optional: turn
   off "Confirm email" so friends can sign up instantly.)

## B. Everyday use

- **Open the app**: your Vercel URL. Add it to your phone home screen to install it.
- **Sign in**: enter email + password, or tap "Email me a sign-in link".
- **Search**: type (or tap the 🎤 mic to speak) a movie/show name. Tap a result.
- **The verdict**: the big **WATCH IT / MAYBE / SKIP IT** is at the top, with your
  personal match score and the reasons under it.
- **Save & track**: use the buttons — Strict/Possible Watchlist, Watching, Watched,
  rate 1–10, add notes. Your watchlist is under the **Watchlist** tab and persists.
- **Share**: tap **Share** on any verdict → create a link → send it. Friends can
  open it without an account. Your personal score is hidden unless you opt in.

## B2. Daily new-release digest & notifications

- Once `CRON_SECRET` is set and migration `0002` is applied, Vercel runs a **daily
  scan** (13:00 UTC) that checks new movie & TV releases and saves the ones that
  match your taste to **"New for you"** on your home screen.
- Control it in **Settings → Daily new-release digest**: turn the scan on/off and
  set the match threshold (e.g. only show 72%+ matches).
- **Phone/email notifications**: the in-app "New for you" list needs nothing
  extra. To also get an **email** each morning, add a free `RESEND_API_KEY`
  (resend.com). True push notifications to a phone would need a push provider —
  ask me and I can wire it up.
- Want to test the scan now instead of waiting for morning? Visit
  `https://<your-url>/api/cron/daily-scan?key=<your CRON_SECRET>` once.

## C. Friends / other users

- Each friend just visits your URL and signs up — they get their own private
  account, preferences, watchlist, and match score. Nobody can see anyone else's
  private data.
- Each person sets their taste during onboarding (or later in **Settings**). Your
  "Scott" preset is available to you; friends pick their own.

## D. Editing your preferences

**Settings** tab → Taste & preferences → toggle what you avoid / love → **Save**.
Change your display name, region, or personal-match label there too.

## E. Updating an API key later

Vercel → your project → **Settings → Environment Variables** → edit the value →
**Save** → then **Deployments → ⋯ → Redeploy**.

## F. Deploying an update to the app

Any change pushed to the `claude/watch-verdict-app-wwbtbg` branch (or merged to
`main`) triggers Vercel to build and deploy automatically. No manual step needed.

## G. If something breaks

- **App won't load / errors**: open `https://<your-url>/api/health`. It shows which
  keys are missing. Fix the matching env var in Vercel and redeploy.
- **"Configuration" error on a page**: a key is missing — same fix as above.
- **Bad deploy**: Vercel → **Deployments** → find the last good one → **⋯ → Promote
  to Production** (instant rollback).
- **Database issue**: your data lives in Supabase; the app can be redeployed
  without touching it. Never re-run the migration on a database with real data
  (it resets the app tables) — see `supabase/migrations/0001_init.sql` header.
