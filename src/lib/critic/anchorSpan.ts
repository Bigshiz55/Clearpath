import { splitTitleQualifiers } from '@/lib/nlu/queryRepair';

/**
 * WHAT THE USER ALREADY TOLD US ABOUT THE TITLE THEY NAMED.
 *
 * THE DEFECT THIS EXISTS TO CLOSE. `AnchorRequest` has carried `year` and
 * `mediaType` since GC2 was written, `pickMatch` uses both — year as a filter
 * and a tie-break, media type as a hard narrowing — and NOTHING has ever
 * populated the year. So "something darker than Taken 2008" asked "Which Taken
 * did you mean?" while holding the answer in the sentence, and the raw span
 * went to TMDB as the search text, where "Taken 2008" matches no title at all.
 * The cues were understood by the person typing and thrown away by us.
 *
 * ONE READER, COMPOSED FROM THE ONE THAT EXISTS. `splitTitleQualifiers` already
 * strips a stated year and the qualifier forms it knows ("the original X"); it
 * is imported by the frozen search corpus, so it is reused rather than
 * modified. What it does not read is the FRAMED form — "the Taken movie", "the
 * Taken series" — where the medium wraps the title instead of trailing it, and
 * that is the one rule added here. Confined to the critic layer, so no search
 * baseline can move.
 *
 * NOTHING IS INVENTED. A span with no year yields no year; a span with no
 * medium yields no medium; and a frame is only read when a real title survives
 * it, so "the movie" alone is left exactly as it was.
 *
 * PURE. No I/O.
 */

export interface AnchorSpan {
  /** The clean title to search and match on. */
  title: string;
  /** A year the user stated, or null. */
  year: number | null;
  /** A medium the user stated for THIS title, or null. */
  mediaType: 'movie' | 'tv' | null;
  /** Exactly as the user said it — the label, and the round-trip key. */
  spokenAs: string;
}

/** "the … movie" / "… the series": the medium wrapped around the name. */
const FRAMED = /^\s*(?:the\s+)?(.+?)\s+(movie|film|series|show|tv\s+series|mini-?series|documentary)\s*$/i;
const TV_FRAME = /^(series|show|tv\s+series|mini-?series)$/i;
/** A remainder that is nothing but scaffolding — "The", "a", "this". */
const DETERMINERS_ONLY = /^(?:the|a|an|this|that|it|its)$/i;

export function readAnchorSpan(spoken: string): AnchorSpan {
  const raw = (spoken ?? '').trim();
  const base = splitTitleQualifiers(raw);
  let title = base.title.trim();
  let mediaType: 'movie' | 'tv' | null = base.mediaType;

  const framed = FRAMED.exec(title);
  /* A FRAME ONLY COUNTS WHEN A TITLE SURVIVES IT. "the Taken movie" is a name
     plus a medium; "The Movie" is a name, and reading a frame there leaves the
     article "The" as the title — which is how a guard that only checks LENGTH
     turns a real film into nothing. What has to survive is a NAME, so a
     remainder made only of determiners is not a remainder at all. */
  const survives = (t: string) => t.trim().length >= 2 && !DETERMINERS_ONLY.test(t.trim());
  if (framed && survives(framed[1] ?? '')) {
    title = framed[1]!.trim();
    if (mediaType === null) mediaType = TV_FRAME.test(framed[2]!) ? 'tv' : 'movie';
  }

  return { title, year: base.year, mediaType, spokenAs: raw };
}
