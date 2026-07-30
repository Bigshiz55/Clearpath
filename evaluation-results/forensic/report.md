# Forensic Live Validation — BLOCKED

- Commit `ebc2579`
- **Status: NOT RUN — `TMDB_API_KEY` is not configured in this environment.**
- The forensic runner is complete and ready. It will execute a budgeted,
  cached sweep (default 400 calls) across every category the moment a
  key is provided, verify each RETURNED TITLE against its hard constraints,
  and append any failing case to eval/live/regressions.json (self-testing).

## Categories it validates
- Similar movies / similar TV (recommendations overlap)
- Actor & director filmography (person in the returned title’s credits)
- Genre combinations · all streaming services · foreign origin · original language
- English audio → **UNAVAILABLE from TMDB by design** (needs a real audio source)
- Year & runtime filters · family/kids/horror/romance/christmas/crime/documentary/animation
- Movie-vs-TV · misspellings · partial/alternate titles · sequels · franchises

## To run
```
TMDB_API_KEY=… node eval/live/forensic.mjs --budget 400 --region US --per 3
```