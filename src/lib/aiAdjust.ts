import 'server-only';
import { serverEnv } from '@/lib/env';
import type { MediaType } from '@/lib/types';
import { parseAdjustment, MAX_ADJUSTMENT, type AiAdjustment } from '@/lib/aiAdjustParse';

export { parseAdjustment, MAX_ADJUSTMENT, type AiAdjustment };

/**
 * The bounded AI adjustment layer.
 *
 * The deterministic pipeline (DNA taste-fit → Quality → blended Watchability) is
 * authoritative and lives in `src/lib/scoring/`. This layer sits STRICTLY on top
 * of it: an LLM reads the already-computed numbers plus the user's taste profile
 * and the candidate title, and returns a small bounded nudge (|adjustment| ≤ 15)
 * with one sentence of reasoning — the nuance a formula can't see (franchise
 * fatigue, a format mismatch, a beloved niche). It NEVER recomputes the score.
 *
 * Every failure mode returns null, so the caller falls back to the deterministic
 * score untouched: no key, a bad/absent API response, a timeout, or unparseable
 * output. A bad AI call must never take down a recommendation.
 */

export interface AiAdjustInput {
  title: string;
  year: number | null;
  mediaType: MediaType;
  genres: string[];
  /** Pure taste-fit (0–100). */
  dnaScore: number;
  /** Objective quality blend (0–100). */
  qualityScore: number;
  /** The deterministic blended Watchability (0–100) we're refining. */
  baseScore: number;
  /** A short human-readable summary of what this user loves and avoids. */
  tasteProfile: string;
}

const SYSTEM_PROMPT = [
  'You refine a 0–100 "how much will THIS user like it" score for one movie or TV show.',
  'You are given the deterministic base score and its two parts — DNA (pure taste fit) and Quality (objective critic/audience) — plus the user\'s taste profile and the candidate title.',
  'Return a SMALL bounded adjustment that captures nuance the formula misses: franchise fatigue, a format/length mismatch (e.g. a 20-season procedural vs. a limited-series lover), tone, or a beloved niche the numbers underrate.',
  `The adjustment MUST be an integer between -${MAX_ADJUSTMENT} and +${MAX_ADJUSTMENT}. Use 0 when the numbers already look right — most titles need little or none.`,
  'Never restate or recompute the score. Never invent ratings, cast, plot, or availability. Base the reasoning only on the supplied taste profile and title facts.',
  'Respond with ONLY a JSON object, no prose, no code fence: {"adjustment": <int>, "reasoning": "<one short sentence>"}.',
].join(' ');

export async function aiAdjustScore(input: AiAdjustInput): Promise<AiAdjustment | null> {
  const key = serverEnv.openaiKey();
  if (!key) return null;

  const payload = {
    candidate: {
      title: input.title,
      year: input.year,
      type: input.mediaType === 'tv' ? 'TV series' : 'movie',
      genres: input.genres.slice(0, 6),
    },
    scores: {
      base_watchability: input.baseScore,
      dna_taste_fit: input.dnaScore,
      objective_quality: input.qualityScore,
    },
    user_taste_profile: input.tasteProfile,
  };

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8000);
  try {
    const res = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
      signal: controller.signal,
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        temperature: 0.2,
        max_tokens: 120,
        response_format: { type: 'json_object' },
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
          { role: 'user', content: JSON.stringify(payload) },
        ],
      }),
    });
    if (!res.ok) return null;
    const data = (await res.json()) as { choices?: Array<{ message?: { content?: string } }> };
    const content = data.choices?.[0]?.message?.content ?? '';
    return parseAdjustment(content);
  } catch {
    return null;
  } finally {
    clearTimeout(timeout);
  }
}
