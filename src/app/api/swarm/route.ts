import { NextResponse } from 'next/server';
import { z } from 'zod';
import { serverEnv } from '@/lib/env';

export const dynamic = 'force-dynamic';

const schema = z.object({
  title: z.string().min(1).max(200),
  year: z.number().int().nullable().optional(),
  watchVerdictScore: z.number().int(),
  tier: z.string().max(40),
  panelists: z
    .array(
      z.object({
        name: z.string().max(40),
        stance: z.enum(['love', 'mixed', 'pass']),
        line: z.string().max(300),
        basis: z.string().max(120),
      }),
    )
    .min(1)
    .max(6),
});

/**
 * Rewrites the deterministic panel takes as a short, in-voice debate. Grounded:
 * the model is given ONLY the panelists' stances and the data behind them, and
 * is instructed never to invent plot, cast, production stories, or awards, and
 * never to state a different score. Returns { debate: null } when no key is set
 * so the UI simply falls back to the plain panel cards.
 */
export async function POST(req: Request) {
  const key = serverEnv.openaiKey();
  if (!key) return NextResponse.json({ debate: null });

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Bad request.' }, { status: 400 });
  }
  const parsed = schema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: 'Invalid.' }, { status: 400 });
  const v = parsed.data;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 9000);
  try {
    const res = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
      signal: controller.signal,
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        temperature: 0.8,
        max_tokens: 320,
        response_format: { type: 'json_object' },
        messages: [
          {
            role: 'system',
            content:
              'You are the moderator of a film-critics panel. You are given several panelists, each with a fixed STANCE (love/mixed/pass) and the DATA their stance is based on. Write a short, lively back-and-forth where they react to each other, staying fully in each persona\'s voice. HARD RULES: use ONLY the supplied data points; NEVER invent plot details, characters, cast, directors, production stories, box office, or awards; NEVER state a numeric score different from the ones given; keep each turn under 24 words; do not add panelists. Return JSON: {"turns":[{"name":"<panelist name>","text":"<their line>"}]} with 4 to 6 turns.',
          },
          { role: 'user', content: JSON.stringify(v) },
        ],
      }),
    });
    if (!res.ok) return NextResponse.json({ debate: null });
    const data = (await res.json()) as { choices?: Array<{ message?: { content?: string } }> };
    const raw = data.choices?.[0]?.message?.content;
    if (!raw) return NextResponse.json({ debate: null });
    let turns: { name: string; text: string }[] = [];
    try {
      const obj = JSON.parse(raw) as { turns?: { name?: unknown; text?: unknown }[] };
      turns = (obj.turns ?? [])
        .map((t) => ({ name: String(t.name ?? ''), text: String(t.text ?? '') }))
        .filter((t) => t.name && t.text)
        .slice(0, 6);
    } catch {
      return NextResponse.json({ debate: null });
    }
    return NextResponse.json({ debate: turns.length ? turns : null });
  } catch {
    return NextResponse.json({ debate: null });
  } finally {
    clearTimeout(timeout);
  }
}
