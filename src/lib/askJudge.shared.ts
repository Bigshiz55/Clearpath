/**
 * PURE (no I/O, no server-only) helpers shared between the server-only ask flow
 * (src/lib/askJudge.ts) and the pure retrieval pipeline
 * (src/lib/search/retrieval/*). Kept here so the retrieval core can be unit-tested
 * offline without importing a `server-only` module.
 */

const REF_CUE =
  /\b(?:in the vein of|reminds me of|if i (?:really )?(?:like|liked|enjoy|enjoyed|love|loved)|similar to|(?:something|stuff|shows?|movies?|a show|a movie|more|kinda|kind of|sort of|just|a lot) like|like the (?:show|movie)|like watching|like)\b/gi;

/**
 * Pull the reference title out of a "more like X" ask. Takes what follows the
 * LAST comparison cue (so "shows I'd like if I like Fargo" → "Fargo"), then
 * strips leading filler. Returns null when there's no comparison in the text.
 */
export function extractReference(text: string): string | null {
  REF_CUE.lastIndex = 0;
  let last: RegExpExecArray | null = null;
  let m: RegExpExecArray | null;
  while ((m = REF_CUE.exec(text)) !== null) {
    last = m;
    if (m.index === REF_CUE.lastIndex) REF_CUE.lastIndex++;
  }
  if (!last) return null;
  const tail = text
    .slice(last.index + last[0].length)
    .replace(/^\s*(?:to|the|a|an|watch|watching|some|something)\s+/i, '')
    .replace(/[?!.]+\s*$/, '')
    .trim();
  return tail.length >= 2 ? tail : null;
}
