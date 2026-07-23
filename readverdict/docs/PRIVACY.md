# Privacy model

## Where data lives

Today all personal data (Reader DNA, library, appeals, events, consent) lives
**locally in the browser** (`localStorage`, `src/lib/store/`). Nothing is sent to
a server until an account/Supabase is configured. The Supabase schema
(`supabase/migrations/0001_init.sql`) is **RLS-protected on every user table**;
catalog tables are public read, service-role write.

## Consent

`consent.analytics` (default **off**) and `consent.personalization` (default on),
editable in Profile → Data & privacy. The store's `track()` **no-ops unless
analytics consent is granted**, and the analytics taxonomy strips forbidden keys
regardless.

## What is never recorded

Passwords, tokens, payment details, private group exclusions, raw voice audio,
and sensitive inferred traits. Enforced in `analytics/events.ts`
(`FORBIDDEN_PROP_KEYS`) and by the event allow-list.

## User controls (implemented)

- **Export** all data as JSON.
- **Reset Reader DNA** (keeps library).
- **Delete everything** (irreversible, confirmed).

## Planned

Source-specific deletion, server-side consent records + audit logs, upload
expiration for imported files (schema field `imports.file_expires_at` exists),
and least-privilege connectors. Imported files are not retained indefinitely.

## Honesty commitments

ReadVerdict never fabricates reviews, quotes, ratings, DNF/completion rates,
reader similarity, sample sizes, availability, prices, content warnings, narrator
sentiment, or page-level hook points. Missing data is shown as *insufficient
evidence / not yet available / estimate based on your history / no reliable
cohort data / provider unavailable*.
