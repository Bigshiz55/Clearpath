# Environment variables

The app **builds and runs with no configuration**. Env is validated at runtime
(`validateEnv()` in `src/lib/env.ts`), never at import/build time, and returns
issues instead of throwing so partial configuration degrades gracefully.

| Variable | Scope | Required | Purpose |
| --- | --- | --- | --- |
| `NEXT_PUBLIC_SITE_URL` | public | no | Absolute links / share URLs (defaults to localhost) |
| `NEXT_PUBLIC_SUPABASE_URL` | public | no* | Supabase project URL (auth/persistence) |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | public | no* | Supabase anon key |
| `SUPABASE_SERVICE_ROLE_KEY` | **server** | no | Server-only; never `NEXT_PUBLIC_` |
| `OPENAI_API_KEY` | **server** | no | Future LLM interview parsing (`READVERDICT_AI_INTERVIEW`) |
| `GOOGLE_BOOKS_API_KEY` | server | no | Optional future provider |
| `OPENLIBRARY_CONTACT` | server | no | Contact string for the OL User-Agent |

\* Supabase is all-or-nothing: set the URL **and** anon key together, or auth
stays disabled (a partial config is reported as a warning).

## Feature flags (`src/lib/flags.ts`)

| Flag env | Default | Effect |
| --- | --- | --- |
| `READVERDICT_FORCE_MOCK` | off | Force the mock provider (offline/dev) |
| `READVERDICT_AI_INTERVIEW` | off | Enable LLM free-text interview parsing (needs `OPENAI_API_KEY`) |
| `READVERDICT_SHOW_STYLEGUIDE` | off | Surface `/style-guide` in navigation |

See [`.env.example`](../.env.example).
