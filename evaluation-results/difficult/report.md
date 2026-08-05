# Difficult-Search Inspection (offline)

- Commit `e6469be` · 12 queries
- Parse-level fields are verified here; candidate counts / final titles / per-constraint metadata evidence are **LIVE-only** and require a TMDB key (see eval/live/audit.mjs).

## A Spanish film with English audio similar to A Christmas Story

- **Parsed intent:** similar_to
- **Reference title:** Christmas Story · resolved title id: _live only_
- **Hard constraints:** media_type=movie (parse), origin_country=ES (parse), original_language=es (parse), english_audio=required (live_tmdb)
- **Soft preferences:** —
- **Confidence:** intent 85% · metadata 100% · provider 100% · audio 60% · overall 73%
- **Follow-up:** none needed
- **Candidate funnel:** before — → after — (Live candidate retrieval requires TMDB_API_KEY (not configured).)

## A Hallmark-style movie similar to The Silence of the Lambs

- **Parsed intent:** similar_to
- **Reference title:** Silence of the Lambs · resolved title id: _live only_
- **Hard constraints:** media_type=movie (parse), network=hallmark (live_tmdb)
- **Soft preferences:** —
- **Confidence:** intent 85% · metadata 100% · provider 90% · audio 100% · overall 89%
- **Follow-up:** none needed
- **Candidate funnel:** before — → after — (Live candidate retrieval requires TMDB_API_KEY (not configured).)

  **Similarity decomposition**
  - Transfer: investigation / procedural spine; psychological cat-and-mouse tension; a driven investigator protagonist
  - Replace: graphic on-screen violence → implied / off-screen; serial-killer horror → cozy-thriller stakes; bleak tone → hopeful Hallmark resolution
  - Not "random Hallmark title" nor "crime film": transfer the tension + procedure, replace the intensity to fit the safe catalog. If no strong verified match exists, ask one clarifying question or say so — never fabricate.

## A Korean crime movie with English audio on Netflix under two hours

- **Parsed intent:** personalized_content_discovery
- **Reference title:** — · resolved title id: _live only_
- **Hard constraints:** media_type=movie (parse), origin_country=KR (parse), original_language=ko (parse), english_audio=required (live_tmdb), platform=Netflix (live_tmdb), runtime_max=120m (live_tmdb)
- **Soft preferences:** genre_id=80
- **Confidence:** intent 85% · metadata 100% · provider 90% · audio 60% · overall 72%
- **Follow-up:** none needed
- **Candidate funnel:** before — → after — (Live candidate retrieval requires TMDB_API_KEY (not configured).)

## A funny detective movie on Prime Video

- **Parsed intent:** personalized_content_discovery
- **Reference title:** — · resolved title id: _live only_
- **Hard constraints:** media_type=movie (parse), platform=Prime Video (live_tmdb)
- **Soft preferences:** —
- **Confidence:** intent 85% · metadata 100% · provider 90% · audio 100% · overall 89%
- **Follow-up:** none needed
- **Candidate funnel:** before — → after — (Live candidate retrieval requires TMDB_API_KEY (not configured).)

## A movie like Rocky on Prime Video

- **Parsed intent:** similar_to
- **Reference title:** Rocky on Prime Video · resolved title id: _live only_
- **Hard constraints:** media_type=movie (parse), platform=Prime Video (live_tmdb)
- **Soft preferences:** —
- **Confidence:** intent 85% · metadata 100% · provider 90% · audio 100% · overall 89%
- **Follow-up:** none needed
- **Candidate funnel:** before — → after — (Live candidate retrieval requires TMDB_API_KEY (not configured).)

## A French mystery under 100 minutes with English audio

- **Parsed intent:** personalized_content_discovery
- **Reference title:** — · resolved title id: _live only_
- **Hard constraints:** origin_country=FR (parse), original_language=fr (parse), english_audio=required (live_tmdb), runtime_max=100m (live_tmdb)
- **Soft preferences:** genre_id=9648
- **Confidence:** intent 85% · metadata 100% · provider 100% · audio 60% · overall 73%
- **Follow-up:** none needed
- **Candidate funnel:** before — → after — (Live candidate retrieval requires TMDB_API_KEY (not configured).)

## A German psychological thriller on Hulu

- **Parsed intent:** personalized_content_discovery
- **Reference title:** — · resolved title id: _live only_
- **Hard constraints:** origin_country=DE (parse), original_language=de (parse), platform=Hulu (live_tmdb)
- **Soft preferences:** genre_id=53
- **Confidence:** intent 85% · metadata 100% · provider 90% · audio 100% · overall 89%
- **Follow-up:** none needed
- **Candidate funnel:** before — → after — (Live candidate retrieval requires TMDB_API_KEY (not configured).)

## A family Christmas mystery that is not animated

- **Parsed intent:** personalized_content_discovery
- **Reference title:** — · resolved title id: _live only_
- **Hard constraints:** —
- **Soft preferences:** genre_id=9648, genre_id=10751
- **Confidence:** intent 85% · metadata 90% · provider 100% · audio 100% · overall 89%
- **Follow-up:** none needed
- **Candidate funnel:** before — → after — (Live candidate retrieval requires TMDB_API_KEY (not configured).)

## A non-supernatural thriller similar to The Conjuring

- **Parsed intent:** similar_to
- **Reference title:** Conjuring · resolved title id: _live only_
- **Hard constraints:** —
- **Soft preferences:** genre_id=53
- **Confidence:** intent 85% · metadata 100% · provider 100% · audio 100% · overall 91%
- **Follow-up:** none needed
- **Candidate funnel:** before — → after — (Live candidate retrieval requires TMDB_API_KEY (not configured).)

  **Similarity decomposition**
  - Transfer: dread / slow-build suspense; a family-in-peril premise; investigator uncovering a threat
  - Replace: supernatural/demonic cause → human/grounded threat (home invasion, stalker); jump-scare horror → psychological thriller
  - The hard "no supernatural" exclusion must survive; similarity is transferred on tone/structure, not the paranormal mechanism.

## A lighthearted movie similar to Se7en

- **Parsed intent:** similar_to
- **Reference title:** Se7en · resolved title id: _live only_
- **Hard constraints:** media_type=movie (parse)
- **Soft preferences:** —
- **Confidence:** intent 85% · metadata 100% · provider 100% · audio 100% · overall 91%
- **Follow-up:** none needed
- **Candidate funnel:** before — → after — (Live candidate retrieval requires TMDB_API_KEY (not configured).)

  **Similarity decomposition**
  - Transfer: detective-duo dynamic; a mystery to unravel; urban noir texture
  - Replace: grim, nihilistic tone → comedic / lighthearted; gruesome content → PG-ish stakes
  - A near-contradiction: the reference’s essence is its darkness. Transfer the buddy-detective structure, replace the tone; if confidence is low, ask whether tone or plot matters more.

## A British detective series on BritBox under one hour per episode

- **Parsed intent:** personalized_content_discovery
- **Reference title:** — · resolved title id: _live only_
- **Hard constraints:** media_type=tv (parse), origin_country=GB (parse), platform=BritBox (live_tmdb), runtime_max=60m (live_tmdb)
- **Soft preferences:** —
- **Confidence:** intent 85% · metadata 100% · provider 90% · audio 100% · overall 89%
- **Follow-up:** none needed
- **Candidate funnel:** before — → after — (Live candidate retrieval requires TMDB_API_KEY (not configured).)

## A 1990s action movie on Max with English audio

- **Parsed intent:** personalized_content_discovery
- **Reference title:** — · resolved title id: _live only_
- **Hard constraints:** media_type=movie (parse), english_audio=required (live_tmdb), platform=Max (live_tmdb)
- **Soft preferences:** genre_id=28
- **Confidence:** intent 85% · metadata 100% · provider 90% · audio 60% · overall 72%
- **Follow-up:** none needed
- **Candidate funnel:** before — → after — (Live candidate retrieval requires TMDB_API_KEY (not configured).)
