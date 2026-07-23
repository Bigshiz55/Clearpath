# WatchVerdict Voice-Search Evaluation & Optimization

A reusable framework that tests the **whole** voice-search experience at scale —
from a spoken/typed request to the returned results — offline, deterministic, and
reproducible. It generates thousands of realistic voice searches, runs them
through the **real** WatchVerdict parsers + a faithful pipeline reference, grades
six layers, and reports exactly where the system fails.

- **Architecture trace:** `docs/watch-verdict-evaluation-architecture.md`
- **Design:** `docs/watch-verdict-evaluation-design.md`
- **Skill:** `/watch-verdict-eval` (`.claude/skills/watch-verdict-eval/SKILL.md`)

## Quick start

```bash
npm ci
npm run eval:watchverdict:smoke        # ~50 cases, seconds
npm run eval:watchverdict:standard     # ~500 cases
open evaluation-results/runs/<id>/report.html
```

No secrets are required for deterministic mode. `TMDB_API_KEY` (+ optional
`OPENAI_API_KEY`) are only needed for `live` mode.

## Commands

```bash
npm run eval:watchverdict:smoke        # ~50 cases
npm run eval:watchverdict:standard     # ~500 cases
npm run eval:watchverdict:full         # ~5000 cases
npm run eval:watchverdict:stress       # 25k cases
npm run eval:watchverdict:regression   # frozen gold + confirmed failures; asserts thresholds
npm run eval:watchverdict:holdout      # unseen split (generalization check)
npm run eval:watchverdict:baseline     # run + save as the tracked baseline
npm run eval:watchverdict:compare      # current vs committed baseline
npm run eval:watchverdict:live         # small budgeted run vs real TMDB/schedule
npm run eval:watchverdict:optimize     # cluster failures + write a fix proposal (no code edits)
npm run eval:selftest                  # tests for the evaluator itself
```

Direct CLI (pass options through):

```bash
node eval/cli.mjs standard --seed 12345 --cases 500 --profile scott --network lifetime
node eval/cli.mjs analyze  --intent platform_browse
node eval/cli.mjs live     --max-api-calls 100 --max-cost 10
```

Options: `--seed --cases --profile --intent --network --concurrency --max-api-calls --max-cost --baseline --out`.
(They can also be passed as `EVAL_*` env vars — see `eval/runner/options.ts`.)

## Layout

```
eval/
  contract.ts             normalized query + hard/soft constraint model (Phase 2)
  fixtures/               frozen catalog / schedule / profiles / history (Phase 4)
  generator/              seeded synthetic voice-query generator (Phase 3)
  gold/seed.ts            hand-authored gold cases (Phase 14)
  normalize/              real parsers → NormalizedQuery
  pipeline/fixtureFinder  faithful reference of the runFinder contract (real buildVerdict)
  evaluator/              layers A–F, taxonomy, judge, scorecard (Phases 5–7)
  runner/                 run, report (JSON+HTML), compare, optimize, cli (Phases 8,10,11)
  shims/server-only.ts    lets pipeline modules load under vitest
  selftest.test.ts        tests for the evaluator itself (deliverable 19)
docs/                     architecture + design docs
.github/workflows/watch-verdict-eval.yml   CI regression gate (Phase 13)
evaluation-results/       run outputs (runs/ gitignored; baseline/ committed)
```

## How it stays honest

- Grades the **real** production parsers (`src/lib/nlu/detectors.ts`,
  `naiveParseQuery`, `parseRequestedCount`) — not copies.
- Runs the **real** deterministic scoring engine (`buildVerdict`) over frozen
  fixtures.
- **Layer B independently verifies** every returned title against fixture facts —
  it never trusts the pipeline's own filtering.
- **Never weakens a test to pass, never deletes failed cases, never deploys.**
  Confirmed failures become permanent regression cases.

## Production touch-points

Making the system testable required exactly two behavior-preserving changes,
both frozen by `src/lib/nlu/detectors.test.ts`:

1. The build-case intent detectors were extracted verbatim into
   `src/lib/nlu/detectors.ts` (the route now imports them).
2. `parseRequestedCount` moved to that module and is re-exported from
   `src/lib/askParse.ts`.

No ranking or scoring logic was changed.
