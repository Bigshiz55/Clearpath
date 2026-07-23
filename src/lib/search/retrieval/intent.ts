/**
 * Stage 1 — Intent Understanding. PURE, rule-based, works with NO OpenAI key
 * (per the architecture rule that the app must build/run without secrets). A
 * higher layer may enrich this with the LLM parser, but the deterministic core
 * always stands alone and degrades gracefully.
 */
import {
  extractWatchTitle, detectGenre, detectNetwork, detectPlatform,
  detectAiringHorizon, detectTemporalHorizon, extractCount, normalizeTitleAlias,
} from '@/lib/nlu/detectors';
import { extractReference } from '@/lib/askJudge.shared';
// (pure module — safe to import into the offline-testable pipeline)
import type { Intent, IntentKind, DetectedEntities } from './types';

const CONVERSATIONAL = /\b(hey|hi|yo|ok|okay|umm+|uh+|hmm+|please|pls|thanks|lol|bored|i'?m|i am|dunno|idk|whatever|ugh|help me|can you|could you|would you|i want|i wanna|i feel like|in the mood)\b/i;
const RECOMMEND = /\b(recommend|suggest|surprise me|something (good|to watch|fun)|anything good|what should i watch|ideas?|options?)\b/i;
const UPCOMING = /\b(coming (out|soon)|upcoming|new releases?|releasing|comes out|about to (drop|release)|premier(e|ing))\b/i;
const SCHEDULE = /\b(tonight|on (tv|now|live|air)|what'?s on|airing|schedule|live tv|right now on)\b/i;
const SIMILAR = /\b(like|similar to|reminds me of|in the vein of|same (vibe|energy) as|more like)\b/i;
const ACTOR = /\b(with|starring|featuring|movies? of|films? of|by the actor|played by|the guy from|the woman from|actor|actress)\b/i;
const FRANCHISE = /\b(franchise|saga|series of|all the .* (movies|films)|collection|sequels?|trilogy|cinematic universe)\b/i;

const GREETING = /^(?:hey|hi|yo|um+|uh+|ok(?:ay)?(?:\s+so)?|ugh|please|pls|so|i\s+wanna\s+find|i\s+want\s+to\s+find|i'?d\s+like\s+to\s+(?:find|watch|see)|find\s+me|looking\s+for|i\s+wanna|i\s+want\s+to)\s+/i;
const TRAILING_FILLER = /\s+(?:please|pls|lol|thanks|thx|tonight|tho|though)\s*$/i;

/** Strip leading/trailing conversational filler that is never part of a title
 *  ("hey inception" → "inception", "watch rocky tonight" → "watch rocky").
 *  Exported so expansion strips identically. A schedule cue like "what's on
 *  tonight" keeps its meaning because its intent regex matches "what's on". */
export function stripGreeting(text: string): string {
  let work = text.trim();
  while (GREETING.test(work)) work = work.replace(GREETING, '').trim();
  while (TRAILING_FILLER.test(work)) work = work.replace(TRAILING_FILLER, '').trim();
  return work;
}

/** A trailing preposition / cut-off phrase → the user stopped mid-sentence. */
function looksIncomplete(text: string): boolean {
  const t = text.trim().toLowerCase();
  if (t.length === 0) return true;
  if (/\b(with|from|like|the guy from|starring|about|where|that one|the one)\s*$/.test(t)) return true;
  if (/\b(and|or|but|with|for|to|of|in|on)\s*$/.test(t)) return true;
  // A dangling "the … from" style reference with no object.
  if (/\bthe (guy|woman|actor|actress|one|movie|show)\b/.test(t) && t.split(/\s+/).length <= 6 && !/\bwith\b.*\w{3,}$/.test(t)) return true;
  return false;
}

export function understandIntent(rawText: string): Intent {
  const text = stripGreeting(rawText.trim());
  const low = text.toLowerCase();
  // Greeting presence and casual phrasing both count as conversational for telemetry.
  const conversational = rawText.trim() !== text || CONVERSATIONAL.test(low);
  const incomplete = looksIncomplete(text);

  const watchTitle = extractWatchTitle(text);
  const reference = extractReference(text);
  const genre = detectGenre(text);
  const network = detectNetwork(text);
  const platform = detectPlatform(text);
  const count = extractCount(text);
  const horizonMonths = detectAiringHorizon(text) ?? detectTemporalHorizon(text);

  const entities: DetectedEntities = {
    // For a similar-to ask the reference title IS the key entity (the seed).
    title: watchTitle ?? (SIMILAR.test(low) ? reference : null),
    person: null, // person resolution is an async/TMDB step; the entity slot is here for the pipeline
    franchise: FRANCHISE.test(low) ? (reference ?? null) : null,
    genre,
    network: network?.name ?? null,
    platform: platform?.name ?? null,
    count,
    horizonMonths,
  };

  // Rank candidate intents by specificity of signal.
  const votes: { kind: IntentKind; weight: number }[] = [];
  if (reference && SIMILAR.test(low)) votes.push({ kind: 'similar_to', weight: 0.9 });
  if (watchTitle) votes.push({ kind: 'availability', weight: 0.85 });
  if (UPCOMING.test(low)) votes.push({ kind: 'upcoming', weight: 0.8 });
  if (SCHEDULE.test(low) || network) votes.push({ kind: 'schedule', weight: 0.75 });
  if (FRANCHISE.test(low)) votes.push({ kind: 'franchise', weight: 0.7 });
  if (ACTOR.test(low)) votes.push({ kind: 'actor', weight: 0.6 });
  if (genre) votes.push({ kind: 'genre', weight: 0.6 });
  if (RECOMMEND.test(low)) votes.push({ kind: 'recommendation', weight: 0.55 });

  // A bare-ish phrase that normalizes to a known alias or a short noun phrase → title lookup.
  const normalized = normalizeTitleAlias(low.replace(/[?.!]+$/, ''));
  const wordCount = low.split(/\s+/).filter(Boolean).length;
  // After greeting-stripping, a clean short noun phrase that isn't a mood/command
  // phrase is a title lookup (so "hey inception" still resolves the title).
  const commandy = RECOMMEND.test(low) || CONVERSATIONAL.test(low);
  if (!votes.length && wordCount > 0 && wordCount <= 6 && !commandy) {
    votes.push({ kind: 'title_lookup', weight: 0.5 });
    if (!entities.title) entities.title = normalized;
  }

  votes.sort((a, b) => b.weight - a.weight);
  let kind: IntentKind = votes[0]?.kind ?? 'unknown';
  let confidence = votes[0]?.weight ?? 0.2;

  if (incomplete && confidence < 0.7) { kind = 'incomplete'; confidence = Math.max(confidence, 0.5); }
  else if (conversational && !votes.length) { kind = 'conversational'; confidence = 0.4; }

  const implied = !incomplete && !conversational && votes.length === 0 && wordCount > 0;
  const also = votes.slice(1, 4).map((v) => v.kind);

  return { kind, also, entities, incomplete, conversational, implied, confidence: round(confidence) };
}

function round(x: number): number { return Math.round(x * 100) / 100; }
