import { NextResponse } from 'next/server';
import { revalidatePath, revalidateTag } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { serverEnv } from '@/lib/env';
import { DIMENSIONS, DIMENSION_KEYS } from '@/lib/scoring/dimensions';
import { searchTitles } from '@/lib/tmdb/client';
import { rateQuizTitle } from '@/lib/actions/quiz';

export const dynamic = 'force-dynamic';
export const maxDuration = 30;

interface AxisSig { key: string; target: number; confidence: number }
interface Parsed { axes: AxisSig[]; likedTitles: string[]; avoidTitles: string[] }

const UNIT = 3; // evidence weight per unit of confidence (saturates in dimensionMatch)

/** LLM parse of a free-text taste statement → axis targets + named titles. */
async function parseWithAi(text: string): Promise<Parsed | null> {
  const key = serverEnv.openaiKey();
  if (!key) return null;
  const axes = DIMENSIONS.map((d) => `${d.key} (0 = ${d.low}, 100 = ${d.high})`).join('; ');
  const system =
    `Convert a person's description of their movie/TV taste into JSON. They may say what they LOVE and what they AVOID/dislike. Return ONLY:\n` +
    `{"axes":[{"key":<axis key>,"target":0-100,"confidence":0-1}],"likedTitles":[".."],"avoidTitles":[".."]}\n` +
    `Axis keys and meaning: ${axes}.\n` +
    `target = where their preference sits on that axis; include an axis ONLY when the text clearly implies it. ` +
    `"avoid supernatural / no supernatural" -> realism high; "too slow / hate slow" -> pacing high; "dark/gritty" -> darkness high; ` +
    `"light/feel-good" -> darkness low; "no violence" -> violence low; "intelligent/smart/complex" -> complexity high; "funny" -> humor high. ` +
    `likedTitles / avoidTitles = specific show/movie names they name.\n` +
    `Example: "I love intelligent crime mysteries, but I avoid supernatural stories and anything too slow" -> ` +
    `{"axes":[{"key":"complexity","target":72,"confidence":0.7},{"key":"realism","target":82,"confidence":0.8},{"key":"pacing","target":70,"confidence":0.7}],"likedTitles":[],"avoidTitles":[]}`;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 12000);
  try {
    const res = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
      signal: controller.signal,
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        temperature: 0,
        max_tokens: 400,
        response_format: { type: 'json_object' },
        messages: [
          { role: 'system', content: system },
          { role: 'user', content: text.slice(0, 600) },
        ],
      }),
    });
    if (!res.ok) return null;
    const data = (await res.json()) as { choices?: Array<{ message?: { content?: string } }> };
    const raw = JSON.parse(data.choices?.[0]?.message?.content ?? 'null');
    return normalize(raw);
  } catch {
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

function normalize(raw: unknown): Parsed | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  const axes: AxisSig[] = [];
  for (const a of Array.isArray(r.axes) ? r.axes : []) {
    const o = a as Record<string, unknown>;
    const key = String(o.key ?? '');
    const target = Number(o.target);
    const confidence = Number(o.confidence);
    if (DIMENSION_KEYS.includes(key) && Number.isFinite(target) && Number.isFinite(confidence)) {
      axes.push({ key, target: Math.max(0, Math.min(100, target)), confidence: Math.max(0, Math.min(1, confidence)) });
    }
  }
  const strs = (v: unknown) => (Array.isArray(v) ? v.map(String).map((s) => s.trim()).filter(Boolean).slice(0, 6) : []);
  return { axes, likedTitles: strs(r.likedTitles), avoidTitles: strs(r.avoidTitles) };
}

/** Regex fallback when the AI key is absent — directional but honest. */
function parseNaive(text: string): Parsed {
  const t = ` ${text.toLowerCase()} `;
  const axes: AxisSig[] = [];
  const add = (key: string, target: number) => axes.push({ key, target, confidence: 0.5 });
  if (/supernatural|paranormal|ghost|zombie|vampire|witch/.test(t)) add('realism', 80);
  if (/(science fiction|sci-?fi)/.test(t) && /(avoid|no |not |hate|dislike|too much)/.test(t)) add('realism', 76);
  if (/too slow|\bslow\b|boring|drags?|plodding/.test(t)) add('pacing', 72);
  if (/fast[- ]?paced|action[- ]?packed|adrenaline|thrilling|edge of/.test(t)) add('pacing', 72);
  if (/\bdark\b|gritty|bleak|heavy|grim/.test(t)) add('darkness', 72);
  if (/light|feel[- ]?good|uplifting|cozy|comfort|wholesome/.test(t)) add('darkness', 28);
  if (/intelligent|smart|clever|complex|cerebral|thought[- ]?provoking|mind[- ]?bend/.test(t)) add('complexity', 72);
  if (/funny|comed|hilarious|humou?r/.test(t)) add('humor', 68);
  if (/(no |not |avoid|too much|hate|less )\s*(violen|gore|brutal)/.test(t)) add('violence', 20);
  if (/(no |not |avoid|too )\s*(scary|horror|frighten)/.test(t)) add('suspense', 30);
  if (/character[- ]?driven|deep characters|great characters/.test(t)) add('character', 72);
  return { axes, likedTitles: [], avoidTitles: [] };
}

const AXIS_LEAN: Record<string, [string, string]> = {
  pacing: ['a slower burn', 'a faster pace'],
  darkness: ['a lighter tone', 'a darker tone'],
  humor: ['less comedy', 'more comedy'],
  complexity: ['an easier watch', 'more cerebral'],
  realism: ['more fantastical', 'grounded over supernatural'],
  violence: ['tamer content', 'a harder edge'],
  suspense: ['lower tension', 'high tension'],
  character: ['plot-driven', 'character-driven'],
  emotion: ['a breezier feel', 'more emotional weight'],
};

export async function POST(request: Request) {
  try {
    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Not signed in.' }, { status: 401 });

    const body = (await request.json().catch(() => ({}))) as { text?: unknown };
    const text = typeof body.text === 'string' ? body.text.slice(0, 600).trim() : '';
    if (text.length < 4) return NextResponse.json({ error: 'Tell us a bit about what you like.' }, { status: 400 });

    const parsed = (await parseWithAi(text)) ?? parseNaive(text);

    // 1) Fold the inferred axis targets into the user's DNA signals.
    const byAxis = new Map<string, { w: number; wv: number }>();
    for (const a of parsed.axes) {
      const w = a.confidence * UNIT;
      const e = byAxis.get(a.key) ?? { w: 0, wv: 0 };
      e.w += w;
      e.wv += w * a.target;
      byAxis.set(a.key, e);
    }
    if (byAxis.size > 0) {
      try {
        const axesKeys = [...byAxis.keys()];
        const { data: existing } = await supabase
          .from('dimension_signals')
          .select('dimension_key, w_sum, wv_sum')
          .eq('user_id', user.id)
          .in('dimension_key', axesKeys);
        const prev = new Map((existing ?? []).map((r) => [r.dimension_key as string, { w: r.w_sum as number, wv: r.wv_sum as number }]));
        const now = new Date().toISOString();
        const rows = axesKeys.map((k) => {
          const addv = byAxis.get(k)!;
          const p = prev.get(k) ?? { w: 0, wv: 0 };
          return { user_id: user.id, dimension_key: k, w_sum: p.w + addv.w, wv_sum: p.wv + addv.wv, updated_at: now };
        });
        await supabase.from('dimension_signals').upsert(rows, { onConflict: 'user_id,dimension_key' });
      } catch {
        /* dimension_signals table not applied yet — degrade */
      }
    }

    // 2) Honest title seeds — the user explicitly asserted these, so a rating is legit.
    const seedTitle = async (name: string, rating: number) => {
      const hits = await searchTitles(name).catch(() => []);
      const top = hits[0];
      if (top) await rateQuizTitle({ tmdbId: top.id, mediaType: top.mediaType, title: top.title, year: top.year, posterPath: top.posterPath, rating }).catch(() => {});
    };
    await Promise.all([
      ...parsed.likedTitles.slice(0, 6).map((n) => seedTitle(n, 9)),
      ...parsed.avoidTitles.slice(0, 6).map((n) => seedTitle(n, 2)),
    ]);

    revalidateTag(`dim-profile:${user.id}`);
    revalidatePath('/app');
    revalidatePath('/app/watch');

    // Read-back so it never feels like a black box.
    const phrases = parsed.axes
      .map((a) => AXIS_LEAN[a.key]?.[a.target >= 50 ? 1 : 0])
      .filter((x): x is string => Boolean(x));
    const uniquePhrases = [...new Set(phrases)].slice(0, 4);
    const parts: string[] = [];
    if (uniquePhrases.length) parts.push(uniquePhrases.join(', '));
    if (parsed.likedTitles.length) parts.push(`loves ${parsed.likedTitles.slice(0, 3).join(', ')}`);
    const summary = parts.length ? `Locked in: ${parts.join(' · ')}.` : 'Got it — building your Taste DNA.';
    const learned = byAxis.size > 0 || parsed.likedTitles.length > 0 || parsed.avoidTitles.length > 0;

    return NextResponse.json({ ok: true, summary, learned });
  } catch {
    return NextResponse.json({ error: 'Could not read that — try again.' }, { status: 500 });
  }
}
