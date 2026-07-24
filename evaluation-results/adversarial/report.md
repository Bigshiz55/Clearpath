# Independent Adversarial Semantic Suite

- Commit `00b59b8` · 17/17 passed
- Expectations hand-authored here; oracle shares no code with the generator.

## contradiction

- ✅ `A 2026 movie from 1985.`
- ✅ `English audio required, but original-language audio only.`

## impossible

- ✅ `A Hallmark movie exactly as violent as The Silence of the Lambs.`

## ambiguous_provider

- ✅ `A Paramount movie.`
  - _Bare "Paramount" is the studio OR Paramount+. Conservative detector returns no platform rather than a wrong one._
- ✅ `An Apple show.`
  - _Bare "Apple" (the company) must not silently become a platform filter without an "on"/"TV+" cue._
- ✅ `A sci-fi show on Apple TV+.`

## misspelling

- ✅ `A Korean thriler on Netflx under two hours.`

## same_name_title

- ✅ `Fargo.`
  - _Fargo is a 1996 film AND a TV series. Offline the bare title resolves nothing; live disambiguation + a clarifying prompt are the retrieval layer’s job. Assert only that nothing false is invented._

## movie_tv_ambiguity

- ✅ `Show me Fargo the movie, not the series.`

## country_vs_language

- ✅ `An English movie.`
  - _"English" is a LANGUAGE cue, not necessarily British ORIGIN — must not force GB origin._
- ✅ `A recent British detective series without supernatural elements.`

## origlang_vs_audio

- ✅ `A movie in Spanish with English audio.`

## provider_vs_network

- ✅ `An HBO show.`
- ✅ `A movie on Hulu.`

## similarity_plus_hard

- ✅ `A movie like Rocky on Prime, not animated.`

## negative_constraints

- ✅ `A recent thriller, no animation, not slow, no supernatural.`

## zero_match

- ✅ `A live-action documentary about real unicorns filmed on Mars.`
  - _Impossible-to-satisfy at the CATALOG level; an honest no-match must come from the (live) retrieval layer, never a fabricated title. Offline: assert nothing false is minted._
