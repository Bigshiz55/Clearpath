/**
 * Pure helpers for the AI adjustment layer — no I/O, no `server-only`, so they're
 * unit-tested. The network call that produces the raw text lives in `aiAdjust.ts`.
 */

export const MAX_ADJUSTMENT = 15;

export interface AiAdjustment {
  adjustment: number; // clamped to [-MAX_ADJUSTMENT, +MAX_ADJUSTMENT]
  reasoning: string; // one short sentence, human-facing
}

/** Pull the first JSON object out of a model response, tolerating ```json fences
 *  and prose around it (models return these even when told not to). Returns null
 *  on anything unparseable or missing a numeric adjustment. */
export function parseAdjustment(raw: string): AiAdjustment | null {
  if (!raw) return null;
  let text = raw.trim();
  const fence = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fence && fence[1]) text = fence[1].trim();
  if (!text.startsWith('{')) {
    const brace = text.match(/\{[\s\S]*\}/);
    if (brace) text = brace[0];
  }
  try {
    const obj = JSON.parse(text) as { adjustment?: unknown; reasoning?: unknown };
    const n = typeof obj.adjustment === 'number' ? obj.adjustment : Number(obj.adjustment);
    if (!Number.isFinite(n)) return null;
    const adjustment = Math.max(-MAX_ADJUSTMENT, Math.min(MAX_ADJUSTMENT, Math.round(n)));
    const reasoning = typeof obj.reasoning === 'string' ? obj.reasoning.trim().slice(0, 240) : '';
    return { adjustment, reasoning };
  } catch {
    return null;
  }
}
