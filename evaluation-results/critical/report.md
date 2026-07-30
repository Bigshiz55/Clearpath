# Search Quality — Curated Critical Suite

- Commit: `06e7554` · Branch: `claude/watch-verdict-app-wwbtbg`
- Cases: 23 (20 curated + 3 impossible)
- **Passed: 23/23 (100%)**

## Failure categories (most frequent first)

None — every hard constraint captured.

## Per-case results

### ✅ crit-01-spanish-english-audio-christmas-story
> Show me a Spanish film with English audio similar to A Christmas Story.
- ✓ content_type=movie
- ✓ origin=ES
- ✓ english_audio
- ✓ reference:A Christmas Story

### ✅ crit-02-silence-lambs-on-hallmark
> I want a movie like The Silence of the Lambs, but it is on the Hallmark Channel.
- ✓ content_type=movie
- ✓ network=hallmark
- ✓ reference:The Silence of the Lambs

### ✅ crit-03-foreign-crime-english-audio-couple
> Find me a foreign crime film with English audio for my wife and me.
- ✓ content_type=movie
- ✓ english_audio
- ✓ household=family

### ✅ crit-04-rocky-like-prime-no-animation
> Something like Rocky, but not animated, available on Prime.
- ✓ platform=9
- ✓ exclude:animation
- ✓ reference:Rocky

### ✅ crit-05-three-netflix-three-prime
> Three Netflix thrillers and three Prime Video mysteries for my wife and me.
- ✓ platform=8
- ✓ household=family

### ✅ crit-06-korean-thriller-under-2h-english-dub
> A Korean thriller under two hours with an English dub.
- ✓ content_type=movie
- ✓ origin=KR
- ✓ english_audio
- ✓ english_dub
- ✓ runtime<=120

### ✅ crit-07-british-detective-no-supernatural
> A recent British detective series without supernatural elements.
- ✓ content_type=tv
- ✓ origin=GB
- ✓ exclude:supernatural

### ✅ crit-08-family-movie-not-animated
> A family movie that is not animated.
- ✓ content_type=movie
- ✓ exclude:animation

### ✅ crit-09-psych-thriller-no-slow-burn
> A recent psychological thriller with no slow burn.
- ✓ content_type=movie
- ✓ exclude:slow_burn

### ✅ crit-10-hallmark-mystery-stronger-suspense
> A Hallmark mystery with the psychological tension of Gone Girl.
- ✓ network=hallmark
- ✓ reference:Gone Girl

### ✅ crit-11-foreign-christmas-english-dub
> A French Christmas comedy with English audio, appropriate for teenagers.
- ✓ content_type=movie
- ✓ origin=FR
- ✓ english_audio

### ✅ crit-12-netflix-included-not-rental
> A Netflix thriller included with my subscription, not a rental.
- ✓ platform=8

### ✅ crit-13-movie-not-a-show
> Show me a good crime movie, not a TV series.
- ✓ content_type=movie

### ✅ crit-14-under-100-minutes
> A tense crime movie under 100 minutes.
- ✓ content_type=movie
- ✓ runtime<=100

### ✅ crit-15-no-violence-against-children
> A fast-paced crime movie from Spain, English dubbed, under 110 minutes, no violence against children.
- ✓ content_type=movie
- ✓ origin=ES
- ✓ english_audio
- ✓ english_dub
- ✓ runtime<=110
- ✓ exclude:violence_against_children

### ✅ crit-16-gone-girl-but-lighter
> Something like Gone Girl but lighter.
- ✓ reference:Gone Girl

### ✅ crit-17-home-alone-for-adults
> A movie similar to Home Alone but for adults.
- ✓ reference:Home Alone

### ✅ crit-18-crime-for-teenagers
> A crime movie appropriate for teenagers.
- ✓ content_type=movie

### ✅ crit-19-spanish-thriller-tonight
> A Spanish thriller I can watch tonight.
- ✓ origin=ES

### ✅ crit-20-multiturn-hallmark-newer-included-no-supernatural
> Find me something like Silence of the Lambs on Hallmark.
- ✓ network=hallmark
- ✓ exclude:supernatural
- ✓ reference:Silence of the Lambs
- ✓ household=family

### ✅ imp-01-hallmark-as-violent-as-silence
> A Hallmark movie exactly as violent as The Silence of the Lambs.
- ✓ network=hallmark
- ✓ detects_contradiction

### ✅ imp-02-2026-from-1985
> A 2026 movie from 1985.
- ✓ detects_contradiction

### ✅ imp-03-english-audio-but-original-only
> English audio required, but original-language audio only.
- ✓ detects_contradiction
