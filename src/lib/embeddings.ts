import 'server-only';
import { serverEnv } from '@/lib/env';

/**
 * Text → embedding vector, via OpenAI's `text-embedding-3-small` (1536 dims).
 * Deterministic for a given input+model, so it's safe to treat as a stable
 * fingerprint and cache. Server-only (uses the secret key). Returns null when
 * `OPENAI_API_KEY` is unset or the call fails, so callers degrade gracefully.
 *
 * This is the backbone of the WatchVrdikt DNA Score: a title's "vibe vector"
 * and a user's Taste-DNA both live in this same 1536-d space.
 */
export async function embed(text: string): Promise<number[] | null> {
  const key = serverEnv.openaiKey();
  const input = text.replace(/\s+/g, ' ').trim();
  if (!key || !input) return null;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8000);
  try {
    const res = await fetch('https://api.openai.com/v1/embeddings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
      signal: controller.signal,
      body: JSON.stringify({ model: 'text-embedding-3-small', input: input.slice(0, 8000) }),
    });
    if (!res.ok) return null;
    const data = (await res.json()) as { data?: Array<{ embedding?: number[] }> };
    const v = data.data?.[0]?.embedding;
    return Array.isArray(v) && v.length > 0 ? v : null;
  } catch {
    return null;
  } finally {
    clearTimeout(timeout);
  }
}
