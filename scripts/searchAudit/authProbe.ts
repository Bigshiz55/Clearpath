/**
 * Extended authenticated probes — full-JSON evidence for semantic judgment.
 * Credentials come ONLY from env; nothing secret is printed or persisted.
 * Output: one JSON file per probe under scratchpad/authprobe/.
 */
import { createClient } from '@supabase/supabase-js';
import { mkdirSync, writeFileSync } from 'node:fs';

const BASE = process.env.AUDIT_BASE_URL ?? 'https://clearpath-pearl-chi.vercel.app';
const OUT = process.env.PROBE_OUT ?? 'artifacts/search-audit/authprobe';
const EMAIL = process.env.TEST_USER_EMAIL!;
const PASSWORD = process.env.TEST_USER_PASSWORD!;
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SUPABASE_KEY = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!;

const PROBES: { label: string; text: string }[] = [
  { label: 'boxing-canonical', text: 'Find me three boxing movies you think I’ll like that were released within the last five years.' },
  { label: 'rocky-canonical', text: 'I like Rocky, but I want to see other boxing movies released after 2020.' },
  { label: 'boxing-no-docs', text: 'Boxing movies after 2020, no documentaries.' },
  { label: 'like-rocky-not-stallone', text: 'Movies like Rocky, but not another Stallone movie.' },
  { label: 'wrestling', text: 'Three wrestling movies from the last five years.' },
  { label: 'martial-arts', text: 'Three martial-arts movies from the last five years.' },
  { label: 'action', text: 'Three action movies from the last five years.' },
  { label: 'unfinished', text: 'What haven’t I finished?' },
  { label: 'clarify-vague', text: 'something good' },
  { label: 'title-availability', text: 'Rocky' },
  { label: 'similar-explanations', text: 'shows like Mindhunter' },
  { label: 'dangling-reference', text: 'more shows like that' },
];

function chunkCookie(name: string, value: string): string[] {
  const MAX = 3180;
  if (value.length <= MAX) return [`${name}=${value}`];
  const parts: string[] = [];
  for (let i = 0; i * MAX < value.length; i++) parts.push(`${name}.${i}=${value.slice(i * MAX, (i + 1) * MAX)}`);
  return parts;
}

async function main() {
  const supabase = createClient(SUPABASE_URL, SUPABASE_KEY, { auth: { persistSession: false } });
  const { data, error } = await supabase.auth.signInWithPassword({ email: EMAIL, password: PASSWORD });
  if (error || !data.session) { console.error('sign-in failed:', error?.message); process.exit(1); }
  const ref = new URL(SUPABASE_URL).hostname.split('.')[0]!;
  const sessionJson = JSON.stringify(data.session);
  let cookieHeader: string | null = null;
  for (const value of ['base64-' + Buffer.from(sessionJson).toString('base64url'), sessionJson]) {
    const header = chunkCookie(`sb-${ref}-auth-token`, value).join('; ');
    const probe = await fetch(`${BASE}/api/ask`, {
      method: 'POST', headers: { 'content-type': 'application/json', cookie: header },
      body: JSON.stringify({ text: 'Rocky' }),
    });
    if (probe.status !== 401) { cookieHeader = header; break; }
  }
  if (!cookieHeader) { console.error('no cookie encoding accepted'); process.exit(1); }

  mkdirSync(OUT, { recursive: true });
  for (const p of PROBES) {
    const started = Date.now();
    const res = await fetch(`${BASE}/api/ask`, {
      method: 'POST', headers: { 'content-type': 'application/json', cookie: cookieHeader },
      body: JSON.stringify({ text: p.text }),
    });
    let body: unknown = null;
    try { body = await res.json(); } catch { body = { parseError: true }; }
    writeFileSync(`${OUT}/${p.label}.json`, JSON.stringify({ status: res.status, ms: Date.now() - started, ask: p.text, body }, null, 1));
    console.log(`${p.label}: HTTP ${res.status} (${Date.now() - started}ms)`);
  }
}
main().catch((e) => { console.error('probe error:', e?.message ?? e); process.exit(1); });
