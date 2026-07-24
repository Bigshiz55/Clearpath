/**
 * SEARCH CONFIDENCE (pure). Every search internally scores how sure we are that
 * we understood it — split into the dimensions that can independently be wrong —
 * and decides whether to ask ONE clarifying question instead of guessing. Shared
 * by every retrieval path (the ask route computes it; the eval grades it), so
 * confidence is one implementation, not several. No I/O.
 */

export interface SearchSignals {
  /** Resolved high-level intent, or 'discovery' for a plain find. */
  intent: string;
  originCountries: string[];
  englishAudioRequired: boolean;
  /** Whether English audio can be VERIFIED for the pool (false until live check). */
  audioVerifiable: boolean;
  networks: string[]; // linear network keys
  platforms: number[]; // streaming provider ids
  runtimeMax: number | null;
  reference: string | null; // a "similar to" title
  ambiguities: string[]; // detected contradictions/vagueness
  /** What the user's wording actually asked for — so we only score requested dims. */
  requested: {
    origin?: boolean;
    audio?: boolean;
    platform?: boolean;
    runtime?: boolean;
    reference?: boolean;
  };
}

export interface SearchConfidence {
  intent: number; // 0..1
  metadata: number; // how much of the requested structure we captured
  provider: number; // platform/network resolution
  audio: number; // audio-language certainty
  overall: number; // conservative blend (weakest link matters)
  clarify: { needed: boolean; question: string | null };
}

const clamp = (n: number) => Math.max(0, Math.min(1, n));

/** Compute per-dimension + overall confidence and the single best follow-up. */
export function searchConfidence(s: SearchSignals, threshold = 0.55): SearchConfidence {
  // Intent: unknown is low; a resolved intent is high.
  const intent = s.intent === 'unknown' || s.intent === '' ? 0.3 : 0.85;

  // Metadata: of the dimensions the user asked for, how many did we capture?
  const asked: boolean[] = [];
  const got: boolean[] = [];
  if (s.requested.origin) { asked.push(true); got.push(s.originCountries.length > 0); }
  if (s.requested.platform) { asked.push(true); got.push(s.networks.length > 0 || s.platforms.length > 0); }
  if (s.requested.runtime) { asked.push(true); got.push(s.runtimeMax != null); }
  if (s.requested.reference) { asked.push(true); got.push(Boolean(s.reference)); }
  const metadata = asked.length === 0 ? 0.9 : clamp(got.filter(Boolean).length / asked.length);

  // Provider: if a platform/network was asked, did we resolve one?
  const provider = s.requested.platform ? (s.networks.length || s.platforms.length ? 0.9 : 0.35) : 1;

  // Audio: English-audio requests are only fully trustworthy once verifiable
  // against real availability metadata; offline we cap it (honest uncertainty).
  const audio = !s.requested.audio ? 1 : s.englishAudioRequired ? (s.audioVerifiable ? 0.9 : 0.6) : 0.5;

  // Contradiction detected → confidence collapses (we must not fabricate).
  const contradictionPenalty = s.ambiguities.length ? 0.4 : 1;

  // Overall: weakest-link biased (min-weighted average) so one broken dimension
  // can't be hidden by strong others — that's when we should ask, not guess.
  const dims = [intent, metadata, provider, audio];
  const avg = dims.reduce((a, b) => a + b, 0) / dims.length;
  const min = Math.min(...dims);
  const overall = clamp((avg * 0.5 + min * 0.5) * contradictionPenalty);

  const clarify = decideClarification(s, { intent, metadata, provider, audio, overall }, threshold);
  return { intent, metadata, provider, audio, overall, clarify };
}

function decideClarification(
  s: SearchSignals,
  c: { intent: number; metadata: number; provider: number; audio: number; overall: number },
  threshold: number,
): { needed: boolean; question: string | null } {
  if (s.ambiguities.length) {
    return { needed: true, question: `That request has a conflict (${s.ambiguities[0]}). Which one should win?` };
  }
  if (c.overall >= threshold) return { needed: false, question: null };
  // Ask about the SINGLE weakest requested dimension — one useful question only.
  if (s.requested.platform && c.provider < 0.5) return { needed: true, question: 'Which streaming service should I search — Netflix, Prime, Hulu, Max, or Disney+?' };
  if (s.requested.origin && s.originCountries.length === 0) return { needed: true, question: 'Any particular country or language you had in mind?' };
  if (s.requested.audio && c.audio < 0.5) return { needed: true, question: 'Do you need English audio (a dub), or are subtitles okay?' };
  if (c.intent < 0.5) return { needed: true, question: 'Are you after a movie or a TV series?' };
  return { needed: true, question: 'Can you tell me one more thing about what you’re in the mood for?' };
}
