/**
 * SECRETS STAY ON THE SERVER — enforced, not just intended.
 *
 * CLAUDE.md states the rule and every module currently honours it. That is
 * exactly the situation in which the rule quietly breaks: the next person to
 * add an OpenAI call to a component gets a working feature and a leaked key,
 * and nothing complains until it is public. This test reads the real source and
 * fails first.
 *
 * It checks three things, each a different way the rule can be broken.
 *
 *   1. NO SECRET IS EVER PUBLISHED. `NEXT_PUBLIC_*` is inlined into the browser
 *      bundle verbatim, so a secret behind that prefix is not a leak risk —
 *      it is a leak. No name may carry both the public prefix and a secret's
 *      identity.
 *
 *   2. EVERY MODULE THAT READS A SECRET IS SERVER-BOUND. `import 'server-only'`
 *      turns a client import into a build failure; a route handler, a `'use
 *      server'` action file and a `next.config` never reach the browser to
 *      begin with. Anything else that reads a secret has no such protection.
 *
 *   3. NO CLIENT COMPONENT READS ONE AT ALL — the direct form of the same rule,
 *      checked separately because a file could plausibly gain a `'use client'`
 *      directive without anyone rereading its env access.
 *
 * MENTIONING a secret's name is fine and common: error copy ("Set
 * FOUNDER_ACCESS_CODE in Vercel"), skip messages, doc comments. Only a READ —
 * `process.env.X` or `serverEnv.x()` — puts the value in scope, so only reads
 * are checked.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = join(__dirname, '..', '..', '..');
const SRC = join(ROOT, 'src');

/** Values that must never reach a browser. */
const SECRETS = [
  'TMDB_API_KEY',
  'SUPABASE_SERVICE_ROLE_KEY',
  'OPENAI_API_KEY',
  'FOUNDER_ACCESS_CODE',
  'CRON_SECRET',
  'VAPID_PRIVATE_KEY',
];

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const p = join(dir, entry);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (/\.tsx?$/.test(p) && !/\.test\.tsx?$/.test(p)) out.push(p);
  }
  return out;
}

interface Source {
  rel: string;
  text: string;
}

function sources(): Source[] {
  return walk(SRC).map((file) => ({ rel: file.slice(ROOT.length + 1), text: readFileSync(file, 'utf8') }));
}

/** A READ of a secret — the value enters scope. A mention in a string does not. */
function readsSecret(text: string): string[] {
  return SECRETS.filter((s) => new RegExp(`process\\.env\\.${s}\\b`).test(text));
}

/** Protections that make a module unreachable from the browser bundle. */
function isServerBound(rel: string, text: string): boolean {
  if (/^\s*import ['"]server-only['"]/m.test(text)) return true;
  if (/^\s*['"]use server['"]/m.test(text)) return true;
  // Route handlers and Next's own server files never ship to the client.
  if (/^src\/app\/.*\/route\.tsx?$/.test(rel)) return true;
  if (/^src\/middleware\.ts$/.test(rel)) return true;
  return false;
}

const isClientComponent = (text: string) => /^\s*['"]use client['"]/m.test(text);

describe('secrets stay on the server', () => {
  it('no secret hides behind the NEXT_PUBLIC prefix', () => {
    // Extract every NEXT_PUBLIC_* name first, then test each name — never run
    // an unanchored wildcard regex across whole files. (`pendingMigrations.ts`
    // embeds base64 blobs on single 100KB+ lines, and `NEXT_PUBLIC_[A-Z0-9_]*`
    // followed by an alternation backtracks across them for minutes.)
    const offenders: string[] = [];
    for (const { rel, text } of sources()) {
      const names = text.match(/NEXT_PUBLIC_[A-Z0-9_]+/g) ?? [];
      for (const name of new Set(names)) {
        for (const secret of SECRETS) {
          // The public prefix glued onto a secret's identity, whole or in part
          // (`NEXT_PUBLIC_TMDB_API_KEY`, `NEXT_PUBLIC_TMDB_API`, …).
          if (name.includes(secret) || name.includes(secret.replace(/_KEY$/, ''))) {
            offenders.push(`${rel} → ${name}`);
          }
        }
      }
    }
    expect(offenders, `secrets exposed to the browser bundle:\n  ${offenders.join('\n  ')}`).toEqual([]);
  });

  it('every module that reads a secret is unreachable from the client', () => {
    const offenders: string[] = [];
    for (const { rel, text } of sources()) {
      const found = readsSecret(text);
      if (found.length === 0) continue;
      if (!isServerBound(rel, text)) offenders.push(`${rel} reads ${found.join(', ')} with no server guard`);
    }
    expect(
      offenders,
      `add \`import 'server-only';\` to:\n  ${offenders.join('\n  ')}`,
    ).toEqual([]);
  });

  it('no client component reads a secret', () => {
    const offenders: string[] = [];
    for (const { rel, text } of sources()) {
      if (!isClientComponent(text)) continue;
      const found = readsSecret(text);
      if (found.length > 0) offenders.push(`${rel} ('use client') reads ${found.join(', ')}`);
    }
    expect(offenders, `client components reading secrets:\n  ${offenders.join('\n  ')}`).toEqual([]);
  });

  it('the guard is actually looking at the codebase', () => {
    // A walker that silently returns nothing would make all three checks above
    // pass forever. Assert it sees real files, and that it can in fact spot a
    // secret read where one legitimately exists.
    const all = sources();
    expect(all.length).toBeGreaterThan(200);
    const readers = all.filter((s) => readsSecret(s.text).length > 0);
    expect(readers.length, 'no module reads a secret — the matcher is broken').toBeGreaterThan(0);
    for (const r of readers) expect(isServerBound(r.rel, r.text), `${r.rel}`).toBe(true);
  });
});
