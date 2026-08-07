/**
 * TEXT → TASTE SIGNAL (the keyless fallback's interpreter).
 *
 * When there is no OpenAI key, the interviewer's ears are the browser's Web
 * Speech recogniser: it hands us a plain string, not a structured tool call. So
 * this pure function does, in miniature, what the Realtime model's
 * `record_signal` tool does — read a spoken line and turn it into a
 * `TasteSignal`: a subject, how they feel about it, how strongly, and (crucially)
 * the taste axes it informs, resolved through the engine's own `categoriesFor`
 * lexicon so the fallback moves the SAME confidence dimensions the model would.
 *
 * Deliberately lightweight: a small sentiment lexicon over adverbs/verbs and a
 * longest-match scan of the known-subject lexicon. It is honest about its
 * limits — an unrecognised subject still yields a signal (so the transcript and
 * a claim exist) but resolves to no axes rather than guessing.
 *
 * PURE. No browser globals, no clock — `turn` and `index` come from the caller.
 * Lives beside the fallback (not in the engine) because only the fallback needs
 * it; the engine already owns the shared lexicon it leans on.
 */
import {
  categoriesFor,
  normalizeSubject,
  SUBJECT_LEXICON,
  TITLE_LEXICON,
  type TasteSignal,
  type Sentiment,
  type SignalKind,
} from '@/lib/voice/interview';

interface SentimentRule {
  re: RegExp;
  sentiment: Sentiment;
  strength: number;
}

/**
 * Sentiment cues, strongest/most-specific first — the first hit wins, so
 * "absolutely loved" beats the bare "love" inside it. Strengths follow the
 * engine's convention: an emphatic love is ~1, a lukewarm "it was fine" ~0.2.
 */
const SENTIMENT_RULES: SentimentRule[] = [
  { re: /\b(absolutely|totally|really)\s+(loved?|adore)/, sentiment: 'love', strength: 0.97 },
  { re: /\b(obsessed with|all[- ]time favou?rite|favou?rite)/, sentiment: 'love', strength: 0.95 },
  { re: /\bcan'?t stand|\b(hate|despise|loathe)\b/, sentiment: 'hate', strength: 0.9 },
  { re: /\b(loved?|adore)\b/, sentiment: 'love', strength: 0.85 },
  { re: /\b(really enjoy|big fan of|so good)\b/, sentiment: 'like', strength: 0.72 },
  { re: /\b(don'?t (really )?(like|enjoy)|not (a fan|into|my thing)|can'?t get into)\b/, sentiment: 'dislike', strength: 0.62 },
  { re: /\b(bored|boring|switch(ed)? off|couldn'?t finish)\b/, sentiment: 'dislike', strength: 0.55 },
  { re: /\b(like|enjoy|into|dig|fun|good)\b/, sentiment: 'like', strength: 0.6 },
  { re: /\b(fine|okay|ok|alright|meh|so-so)\b/, sentiment: 'neutral', strength: 0.2 },
];

/** Softeners and boosters nudge conviction a touch, the way a human would hear it. */
const BOOST = /\b(so|really|absolutely|totally|honestly|genuinely)\b/;
const SOFTEN = /\b(kind of|kinda|sort of|a bit|a little|somewhat|i guess|maybe)\b/;

/** Directors/actors in the lexicon resolve to the `person` kind. */
const PEOPLE = new Set<string>(
  Object.keys(SUBJECT_LEXICON).filter((k) => {
    const cats = SUBJECT_LEXICON[k] ?? [];
    return cats.includes('actors') || cats.includes('directors');
  }),
);

/** Hard presentational attributes resolve to the `attribute` kind. */
const ATTRIBUTES = new Set<string>(['black and white', 'black-and-white', 'monochrome', 'subtitles', 'subtitled']);

const clamp01 = (n: number): number => Math.max(0, Math.min(1, n));

/** Does `key` appear in `norm` on word boundaries (so "it" ≠ "with")? */
function containsPhrase(norm: string, key: string): boolean {
  if (key.includes(' ') || key.includes('-')) return norm.includes(key);
  return new RegExp(`(?:^|\\s)${key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?:\\s|$)`).test(norm);
}

interface SubjectHit {
  subject: string;
  kind: SignalKind;
}

/**
 * Find the best-known subject in the line: titles are preferred (a title carries
 * more taste than a bare genre word), then the longest generic-lexicon match, so
 * "science fiction" beats the "fiction" inside it. Returns `null` when nothing
 * known is named.
 */
function findSubject(norm: string): SubjectHit | null {
  const titleKeys = Object.keys(TITLE_LEXICON).sort((a, b) => b.length - a.length);
  for (const key of titleKeys) {
    if (containsPhrase(norm, key)) return { subject: key, kind: 'title' };
  }
  const genericKeys = Object.keys(SUBJECT_LEXICON).sort((a, b) => b.length - a.length);
  for (const key of genericKeys) {
    if (!containsPhrase(norm, key)) continue;
    const kind: SignalKind = PEOPLE.has(key) ? 'person' : ATTRIBUTES.has(key) ? 'attribute' : 'genre';
    return { subject: key, kind };
  }
  return null;
}

/** Read the sentiment + base strength out of a line, or `null` if none is voiced. */
function readSentiment(norm: string): { sentiment: Sentiment; strength: number } | null {
  for (const rule of SENTIMENT_RULES) {
    if (rule.re.test(norm)) {
      let strength = rule.strength;
      if (BOOST.test(norm)) strength += 0.08;
      if (SOFTEN.test(norm)) strength -= 0.18;
      return { sentiment: rule.sentiment, strength: clamp01(strength) };
    }
  }
  return null;
}

/**
 * Turn one recognised utterance into a `TasteSignal`, or `null` when the line
 * says nothing about taste (no known subject AND no sentiment cue). `raw` is
 * always the user's own words, so the transcript and contradiction memory stay
 * faithful even when the axes could not be resolved.
 */
export function deriveSignal(text: string, turn: number, index = 0): TasteSignal | null {
  const trimmed = (text ?? '').trim();
  if (!trimmed) return null;
  const norm = normalizeSubject(trimmed);

  const subjectHit = findSubject(norm);
  const senti = readSentiment(norm);

  // Nothing to learn from — don't manufacture a signal.
  if (!subjectHit && !senti) return null;

  // Naming something with no explicit feeling reads as a mild, shallow positive
  // (people volunteer what they lean toward) — shallow enough to earn a follow-up.
  const sentiment: Sentiment = senti?.sentiment ?? 'like';
  const strength = senti?.strength ?? 0.3;

  const subject = subjectHit?.subject ?? trimmed;
  const kind: SignalKind = subjectHit?.kind ?? 'element';
  const categories = categoriesFor(subject, kind);

  return {
    id: `fb:${turn}:${index}`,
    turn,
    kind,
    subject,
    sentiment,
    strength,
    categories,
    raw: trimmed,
  };
}
