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

/**
 * Detect when the case text is (also) an actionable "what's coming on / airing
 * in the next N hours / tonight" request, and return the horizon in hours (so we
 * can route to the live TV guide windowed to it). Null = no live-TV ask, so we
 * fall through to the normal "build DNA → Watch Now" behaviour. Conservative on
 * purpose: only an explicit airing cue or an explicit hour window routes away.
 */
function detectAiringHorizon(text: string): number | null {
  const t = ` ${text.toLowerCase()} `;
  // Explicit "(in the) next / within N hours" — almost always means scheduling.
  const m =
    t.match(/(?:next|within|in the next|coming up in)\s+(\d{1,2})\s*(?:hour|hr|h)\b/) ||
    t.match(/\bnext\s+(\d{1,2})\s*(?:hour|hr|h)/);
  if (m && m[1]) return Math.max(1, Math.min(48, Number(m[1])));
  // A clear "on the air" cue, without a number.
  const airing = /(coming on|what'?s on|whats on|on tv|on t\.v\.|\bairing\b|on right now|on the air|on later|live tv|on tonight|what'?s airing|on air)/.test(t);
  if (airing) {
    if (/\btonight\b|\bthis evening\b|\blater tonight\b/.test(t)) return 6; // the rest of the evening
    return 24; // generic "what's on"
  }
  return null;
}

/**
 * Extract a specific title from a "where can I watch/stream X" or "is X on …"
 * question, so we can route to that title's page (which shows every provider).
 * Null when the text isn't a where-to-watch lookup, or the "title" is generic
 * (e.g. "is there anything good on Netflix" → that's a platform browse, not a title).
 */
function extractWatchTitle(text: string): string | null {
  const raw = text.trim().replace(/[?!.]+$/, '');
  const low = ` ${raw.toLowerCase()} `;
  const clean = (s: string): string | null => {
    let title = s.trim().replace(/\s+on(\s+.*)?$/i, '').trim(); // drop trailing "on <platform>"
    title = title.replace(/^(the movie|the show|the film)\s+/i, '').trim();
    if (title.length < 2) return null;
    if (/^(there|anything|something|any|a|an|some|it)\b/i.test(title)) return null; // generic, not a title
    return title;
  };
  // "is <title> on <somewhere>" — availability check for a named title.
  let m = raw.match(/^\s*is\s+(.+?)\s+on\s+[a-z0-9+.\s]+$/i);
  if (m && m[1]) return clean(m[1]);
  // "where/what/how/which can I (watch|stream|see|find) <title> [on …]"
  const gate = /(where can i (watch|stream|see|find|get)|what (network|channel|service|platform|streaming)|how can i (watch|stream|see|get)|which (service|platform|channel|network))/i;
  if (!gate.test(low)) return null;
  m = raw.match(/(?:watch|stream|see|find|get)\s+(.+)$/i);
  if (!m || !m[1]) return null;
  return clean(m[1]);
}

/** Named streaming service → the TMDB provider id we filter on. Strong aliases
 *  match anywhere; "bare" aliases (amazon/max/apple — risky words) only count
 *  when used as a platform, i.e. right after "on". */
function detectPlatform(text: string): { id: number; name: string } | null {
  const t = ` ${text.toLowerCase()} `;
  const table: { id: number; name: string; strong: RegExp; bare?: RegExp }[] = [
    { id: 8, name: 'Netflix', strong: /\bnetflix\b/ },
    { id: 9, name: 'Prime Video', strong: /\b(amazon prime|prime video|amazon video)\b/, bare: /\b(amazon|prime)\b/ },
    { id: 337, name: 'Disney+', strong: /\b(disney\s*\+|disney plus)\b/, bare: /\bdisney\b/ },
    { id: 1899, name: 'Max', strong: /\b(hbo max|hbo)\b/, bare: /\bmax\b/ },
    { id: 15, name: 'Hulu', strong: /\bhulu\b/ },
    { id: 531, name: 'Paramount+', strong: /\b(paramount\s*\+|paramount plus)\b/, bare: /\bparamount\b/ },
    { id: 386, name: 'Peacock', strong: /\bpeacock\b/ },
    { id: 350, name: 'Apple TV+', strong: /\b(apple tv\s*\+?|appletv)\b/, bare: /\bapple\b/ },
    { id: 43, name: 'Starz', strong: /\bstarz\b/ },
    { id: 37, name: 'Showtime', strong: /\bshowtime\b/ },
    { id: 526, name: 'AMC+', strong: /\bamc\s*\+/ },
    { id: 73, name: 'Tubi', strong: /\btubi\b/ },
    { id: 300, name: 'Pluto TV', strong: /\bpluto\b/ },
    { id: 207, name: 'The Roku Channel', strong: /\broku\b/ },
  ];
  for (const p of table) if (p.strong.test(t)) return { id: p.id, name: p.name };
  for (const p of table) if (p.bare && new RegExp(`\\bon\\s+(?:the\\s+)?${p.bare.source}`).test(t)) return { id: p.id, name: p.name };
  return null;
}

/** Canonical service name (as emitted by the multilingual intent parser) → TMDB id. */
const SERVICE_IDS: Record<string, number> = {
  netflix: 8, 'prime video': 9, 'disney+': 337, max: 1899, hulu: 15, 'paramount+': 531,
  peacock: 386, 'apple tv+': 350, starz: 43, showtime: 37, 'amc+': 526, tubi: 73,
  'pluto tv': 300, 'the roku channel': 207,
};
function platformByName(name: string | null | undefined): { id: number; name: string } | null {
  if (!name) return null;
  const id = SERVICE_IDS[name.toLowerCase().trim()];
  return id ? { id, name } : null;
}

interface Intent {
  kind: 'where_to_watch' | 'platform_find' | 'airing' | 'taste';
  title: string | null;
  platform: string | null;
  horizonHours: number | null;
}

/**
 * Language-agnostic intent classifier — the multilingual counterpart to the
 * English regex fast-paths. gpt-4o-mini reads a request in ANY language (e.g.
 * Simplified Chinese) and returns which action it is + the slots, so the same
 * router can serve non-English input without brittle per-language keyword lists.
 * Returns null on no key / timeout / bad output (caller then falls back to taste).
 */
async function parseIntentWithAi(text: string): Promise<Intent | null> {
  const key = serverEnv.openaiKey();
  if (!key) return null;
  const system =
    `Classify a movie/TV request (written in ANY language) into JSON. Return ONLY:\n` +
    `{"kind":"where_to_watch"|"platform_find"|"airing"|"taste","title":string|null,"platform":string|null,"horizonHours":number|null}\n` +
    `- where_to_watch: they ask where/how to stream a SPECIFIC named title. Put the title in "title", using its common ENGLISH title when you know it.\n` +
    `- platform_find: they want something to watch ON a named streaming service. Set "platform" to EXACTLY one of: Netflix, Prime Video, Disney+, Max, Hulu, Paramount+, Peacock, Apple TV+, Starz, Showtime, AMC+, Tubi, Pluto TV, The Roku Channel.\n` +
    `- airing: they want what's coming on / on TV within some hours. Set "horizonHours" (a number; "tonight" -> 6, unspecified -> 24).\n` +
    `- taste: anything else (describing what they like or dislike).\n` +
    `Examples:\n` +
    `"在亚马逊上找点东西看" -> {"kind":"platform_find","title":null,"platform":"Prime Video","horizonHours":null}\n` +
    `"大白鲨在哪个平台可以看" -> {"kind":"where_to_watch","title":"Jaws","platform":null,"horizonHours":null}\n` +
    `"接下来3小时电视上有什么" -> {"kind":"airing","title":null,"platform":null,"horizonHours":3}\n` +
    `"我喜欢烧脑的悬疑片，不喜欢太慢的" -> {"kind":"taste","title":null,"platform":null,"horizonHours":null}`;
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
        max_tokens: 120,
        response_format: { type: 'json_object' },
        messages: [
          { role: 'system', content: system },
          { role: 'user', content: text.slice(0, 400) },
        ],
      }),
    });
    if (!res.ok) return null;
    const data = (await res.json()) as { choices?: Array<{ message?: { content?: string } }> };
    const r = JSON.parse(data.choices?.[0]?.message?.content ?? 'null') as Record<string, unknown> | null;
    if (!r || typeof r !== 'object') return null;
    const kind = r.kind;
    if (kind !== 'where_to_watch' && kind !== 'platform_find' && kind !== 'airing' && kind !== 'taste') return null;
    const hz = Number(r.horizonHours);
    return {
      kind,
      title: typeof r.title === 'string' && r.title.trim() ? r.title.trim() : null,
      platform: typeof r.platform === 'string' && r.platform.trim() ? r.platform.trim() : null,
      horizonHours: Number.isFinite(hz) && hz > 0 ? Math.max(1, Math.min(48, hz)) : null,
    };
  } catch {
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

/** Cheap check for non-Latin scripts (CJK here) — when present we let the LLM
 *  classify intent, since the English regex fast-paths can't. Keeps the English
 *  path byte-for-byte unchanged. */
function hasNonLatinScript(text: string): boolean {
  return /[㐀-鿿぀-ヿ가-힯]/.test(text);
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

    const body = (await request.json().catch(() => ({}))) as { text?: unknown; source?: unknown; lang?: unknown; priorCaseId?: unknown };
    const text = typeof body.text === 'string' ? body.text.slice(0, 600).trim() : '';
    if (text.length < 4) return NextResponse.json({ error: 'Tell us a bit about what you like.' }, { status: 400 });

    // ── Step 1 of the voice/intent flywheel ────────────────────────────────
    // Log what we parsed a request as and how we routed it, plus a weak
    // "reworded" label when a request is resubmitted quickly (a likely miss).
    // This is the labeled substrate later steps mine (prompt few-shots, an alias
    // table, a fine-tune) — collect now, improve later. Guarded so a missing
    // table never blocks a response. NOTE: props include the raw text, so before
    // scaling this needs a retention/consent policy (it can carry personal phrasing).
    const caseId = crypto.randomUUID();
    const source = body.source === 'voice' ? 'voice' : 'text';
    const lang = typeof body.lang === 'string' ? body.lang.slice(0, 8) : 'en';
    const priorCaseId = typeof body.priorCaseId === 'string' ? body.priorCaseId.slice(0, 64) : null;
    const logCase = async (intentKind: string, route: string, extra: Record<string, unknown> = {}) => {
      try {
        const rows: { user_id: string; name: string; props: Record<string, unknown> }[] = [
          { user_id: user.id, name: 'case_parsed', props: { caseId, source, lang, cjk: hasNonLatinScript(text), len: text.length, text: text.slice(0, 300), intentKind, route, ...extra } },
        ];
        if (priorCaseId) rows.push({ user_id: user.id, name: 'case_reworded', props: { caseId: priorCaseId, nextCaseId: caseId } });
        await supabase.from('analytics_events').insert(rows);
      } catch {
        /* analytics_events missing (pre-migration) → skip logging */
      }
    };

    // Non-Latin input (e.g. Simplified Chinese) can't hit the English regex
    // fast-paths, so classify its intent with the LLM. English is untouched.
    const aiIntent = hasNonLatinScript(text) ? await parseIntentWithAi(text) : null;

    // ── Pure lookup: "where can I stream <title>?" ──────────────────────────
    // Answer it by opening that title's page (which lists every provider). No
    // DNA writes — a where-to-watch question is not a statement of taste, so we
    // must never mark the queried title as "loved".
    const whereTitle = extractWatchTitle(text) ?? (aiIntent?.kind === 'where_to_watch' ? aiIntent.title : null);
    if (whereTitle) {
      const hits = await searchTitles(whereTitle).catch(() => []);
      const top = hits[0];
      if (top) {
        await logCase('where_to_watch', `/app/title/${top.mediaType}/${top.id}`, { title: whereTitle });
        return NextResponse.json({
          ok: true,
          learned: false,
          caseId,
          redirect: `/app/title/${top.mediaType}/${top.id}`,
          summary: `Here’s where to stream ${top.title}${top.year ? ` (${top.year})` : ''}.`,
        });
      }
      await logCase('where_to_watch_miss', 'stay', { title: whereTitle });
      return NextResponse.json({
        ok: true,
        learned: false,
        stay: true,
        caseId,
        summary: `Couldn’t find “${whereTitle}” — try the 🔎 search up top.`,
      });
    }

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
    const learned = byAxis.size > 0 || parsed.likedTitles.length > 0 || parsed.avoidTitles.length > 0;
    const tasteLead = parts.length ? `Locked in ${parts.join(' · ')}. ` : '';

    // If they named a streaming service ("find me something on Amazon Prime"),
    // route to Forensic Search pre-filtered to that provider and auto-run. Their
    // stated taste is folded in above and the results are still scored for them.
    const engPlatform = detectPlatform(text);
    const wantsFind = /\b(find|show me|recommend|suggest|something|anything|browse|watch|good|what should i watch|what can i watch)\b/.test(` ${text.toLowerCase()} `) || /\bon\s+/.test(` ${text.toLowerCase()} `);
    // An explicit LLM platform_find needs no English "find" cue.
    const platform = (aiIntent?.kind === 'platform_find' ? platformByName(aiIntent.platform) : null) ?? (engPlatform && wantsFind ? engPlatform : null);
    if (platform) {
      await logCase('platform_find', `/app/finder?providers=${platform.id}`, { platform: platform.name });
      return NextResponse.json({
        ok: true,
        learned,
        caseId,
        redirect: `/app/finder?providers=${platform.id}&q=${encodeURIComponent(text.slice(0, 200))}&run=1`,
        summary: `${tasteLead}Finding something on ${platform.name}, scored for you.`,
      });
    }

    // If they asked for something *coming on* soon, honour that constraint: send
    // them to the live TV guide windowed to the horizon they named, rather than
    // the generic Watch Now grid. Their stated taste is still folded in above.
    const horizon = detectAiringHorizon(text) ?? (aiIntent?.kind === 'airing' ? aiIntent.horizonHours : null);
    if (horizon != null) {
      await logCase('airing', `/app/tv?within=${horizon}`, { horizon });
      return NextResponse.json({
        ok: true,
        learned,
        caseId,
        redirect: `/app/tv?within=${horizon}`,
        summary: `${tasteLead}Here’s what’s coming on in the next ${horizon} hours.`,
      });
    }

    const summary = parts.length ? `Locked in: ${parts.join(' · ')}.` : 'Got it — building your Taste DNA.';
    await logCase('taste', 'watch', { axes: parsed.axes.length, liked: parsed.likedTitles.length, avoid: parsed.avoidTitles.length });
    return NextResponse.json({ ok: true, summary, learned, caseId });
  } catch {
    return NextResponse.json({ error: 'Could not read that — try again.' }, { status: 500 });
  }
}
