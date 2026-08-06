/**
 * AUTHENTICATED JUDGE VERIFICATION HARNESS.
 *
 * The product signs users in by magic link only, so there is no password form
 * to drive — and no way for an audit to mint a session without an authorized
 * credential. This harness closes that gap the moment one exists: an owner
 * creates ONE dedicated test user (with a password) in the Supabase dashboard,
 * exports two environment variables, and every canonical recommendation test
 * that has been blocked on auth becomes runnable.
 *
 *   TEST_USER_EMAIL=...  TEST_USER_PASSWORD=...  npx tsx scripts/searchAudit/authJudge.ts
 *
 * Optional: AUDIT_BASE_URL (defaults to production), NEXT_PUBLIC_SUPABASE_URL,
 * NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY (both public by design; required here
 * because this runner has no Next build to inline them from).
 *
 * SECURITY: credentials come only from the environment; nothing is written to
 * disk, committed, or printed. Sign-in goes through Supabase's real password
 * grant — no app authentication is weakened or bypassed; a session exists only
 * because the owner created a legitimate user. The session is then presented
 * to the app exactly the way the browser presents it: as the @supabase/ssr
 * auth cookie. Both cookie encodings (base64- and raw JSON) are attempted and
 * the harness proves which one authenticated before trusting any result.
 */
import { createClient } from '@supabase/supabase-js';

const BASE = process.env.AUDIT_BASE_URL ?? 'https://clearpath-pearl-chi.vercel.app';
const EMAIL = process.env.TEST_USER_EMAIL;
const PASSWORD = process.env.TEST_USER_PASSWORD;
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? process.env.SUPABASE_PUBLISHABLE_KEY;

/** The canonical asks that have been unverifiable without a session. */
const CANONICAL: { label: string; text: string }[] = [
  { label: 'boxing-canonical', text: 'Find me three boxing movies you think I’ll like that were released within the last five years.' },
  { label: 'boxing-filmed', text: 'Find me three boxing movies you think I’ll like that were filmed within the last five years.' },
  { label: 'rocky-canonical', text: 'I like Rocky, but I want to see other boxing movies released after 2020.' },
  { label: 'boxing-no-docs', text: 'Boxing movies after 2020, no documentaries.' },
  { label: 'like-rocky-not-stallone', text: 'Movies like Rocky, but not another Stallone movie.' },
  { label: 'underdog-not-boxing', text: 'Something with Rocky’s underdog feeling, but not boxing.' },
  { label: 'martial-arts-distinct', text: 'Three martial-arts movies from the last five years.' },
  { label: 'wrestling-distinct', text: 'Three wrestling movies from the last five years.' },
  { label: 'action-distinct', text: 'Three action movies from the last five years.' },
  { label: 'unfinished', text: 'What haven’t I finished?' },
  { label: 'unseen-recommendation', text: 'Recommend something I have not watched.' },
];

function chunkCookie(name: string, value: string): string[] {
  const MAX = 3180;
  if (value.length <= MAX) return [`${name}=${value}`];
  const parts: string[] = [];
  for (let i = 0; i * MAX < value.length; i++) {
    parts.push(`${name}.${i}=${value.slice(i * MAX, (i + 1) * MAX)}`);
  }
  return parts;
}

async function main() {
  if (!EMAIL || !PASSWORD) {
    console.log('SKIPPED (cleanly): TEST_USER_EMAIL / TEST_USER_PASSWORD are not set.');
    console.log('Provide them (plus NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY)');
    console.log('to run the full authenticated canonical recommendation suite.');
    process.exit(0);
  }
  if (!SUPABASE_URL || !SUPABASE_KEY) {
    console.error('BLOCKED: NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY are required.');
    process.exit(1);
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_KEY, { auth: { persistSession: false } });
  const { data, error } = await supabase.auth.signInWithPassword({ email: EMAIL, password: PASSWORD });
  if (error || !data.session) {
    console.error(`BLOCKED: sign-in failed — ${error?.message ?? 'no session'}. The test user must exist with a password (magic-link-only users have none).`);
    process.exit(1);
  }

  const ref = new URL(SUPABASE_URL).hostname.split('.')[0]!;
  const sessionJson = JSON.stringify(data.session);
  const encodings: [string, string][] = [
    ['base64', 'base64-' + Buffer.from(sessionJson).toString('base64url')],
    ['raw-json', sessionJson],
  ];

  // Prove which cookie encoding the deployed @supabase/ssr accepts before
  // trusting any test result: /api/ask returns 401 for an unauthenticated
  // caller, so any non-401 means the session was honoured.
  let cookieHeader: string | null = null;
  for (const [name, value] of encodings) {
    const header = chunkCookie(`sb-${ref}-auth-token`, value).join('; ');
    const probe = await fetch(`${BASE}/api/ask`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', cookie: header },
      body: JSON.stringify({ text: 'Rocky' }),
    });
    if (probe.status !== 401) {
      console.log(`auth handshake: ${name} cookie accepted (HTTP ${probe.status})`);
      cookieHeader = header;
      break;
    }
  }
  if (!cookieHeader) {
    console.error('BLOCKED: signed in, but neither cookie encoding was accepted by the app — the ssr cookie format may have changed.');
    process.exit(1);
  }

  let failures = 0;
  for (const c of CANONICAL) {
    const started = Date.now();
    const res = await fetch(`${BASE}/api/ask`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', cookie: cookieHeader },
      body: JSON.stringify({ text: c.text }),
    });
    const ms = Date.now() - started;
    let body: Record<string, unknown> = {};
    try { body = (await res.json()) as Record<string, unknown>; } catch { /* reported below */ }
    const items = Array.isArray(body.items) ? (body.items as { title?: string; year?: number; mediaType?: string }[]) : [];
    const ok = res.ok && (body.kind === 'search' || body.kind === 'title');
    if (!ok) failures++;
    console.log(`\n[${ok ? 'PASS' : 'FAIL'}] ${c.label} (HTTP ${res.status}, ${ms}ms, kind=${String(body.kind)})`);
    console.log(`  ask: ${c.text}`);
    for (const i of items.slice(0, 5)) console.log(`  → ${i.title} (${i.year ?? '?'}, ${i.mediaType ?? '?'})`);
    if (items.length === 0 && ok) console.log('  → (no items — inspect kind/query fields)');
  }
  console.log(`\n${CANONICAL.length - failures}/${CANONICAL.length} canonical authenticated asks returned a well-formed answer.`);
  process.exit(failures > 0 ? 1 : 0);
}

main().catch((e) => { console.error('harness error:', e); process.exit(1); });
