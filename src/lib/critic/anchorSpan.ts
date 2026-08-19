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
 * A FRAME IS OFFERED, NEVER APPLIED. "The Truman Show" has exactly the shape
 * of "the Taken movie" — article, name, medium noun — and stripping it yields
 * the title "Truman" under a hard `tv` filter, which resolves to nothing. So do
 * "Scary Movie", "Silent Movie", "The Daily Show" and "The Rocky Horror Picture
 * Show". No lexical rule separates them: "the scary movie" and "Scary Movie"
 * differ by an article and a capital letter, and neither survives being typed
 * mid-sentence. The catalog is the only witness, and this module has no I/O, so
 * it returns BOTH readings and lets `orchestrate` decide on evidence — the same
 * call `/api/search` already makes ("Both readings are searched and exact
 * catalog evidence decides").
 *
 * NOTHING IS INVENTED. A span with no year yields no year; a span with no
 * medium yields no medium; and a frame is only offered when a real name
 * survives it, so "the movie" alone is left exactly as it was.
 *
 * PURE. No I/O.
 */

export interface AnchorSpan {
  /** The clean title to search and match on, taking the span at its word. */
  title: string;
  /** A year the user stated, or null. */
  year: number | null;
  /** A medium the user stated for THIS title, or null. */
  mediaType: 'movie' | 'tv' | null;
  /** Exactly as the user said it — the label, and the round-trip key. */
  spokenAs: string;
  /**
   * The OTHER reading, when the span could be a medium wrapped around a name.
   * Null when no frame is even possible. The caller adopts it only if the
   * catalog has no title matching `title` as written — see the docblock.
   */
  framed: { title: string; mediaType: 'movie' | 'tv' } | null;
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

  const m = FRAMED.exec(title);
  /* A FRAME IS ONLY WORTH OFFERING WHEN A NAME SURVIVES IT. "the Taken movie"
     leaves "Taken"; "The Movie" leaves the article, which is how a guard that
     checks only LENGTH turns a real film into nothing. */
  const survives = (t: string) => t.trim().length >= 2 && !DETERMINERS_ONLY.test(t.trim());
  const framed =
    m && survives(m[1] ?? '')
      ? { title: m[1]!.trim(), mediaType: (TV_FRAME.test(m[2]!) ? 'tv' : 'movie') as 'movie' | 'tv' }
      : null;

  return { title, year: base.year, mediaType, spokenAs: raw, framed };
}
