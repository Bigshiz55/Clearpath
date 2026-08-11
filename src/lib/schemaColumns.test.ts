import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

/**
 * DOES EVERY COLUMN THE CODE SELECTS ACTUALLY EXIST?
 *
 * `schemaContract.ts` put "the code needs this TABLE" and "the database has
 * this table" in the same room, after migration 0041 shipped against tables
 * production did not have. One level down, the same two facts were still
 * strangers: a `.select('id, name, lineup_id')` is a string, so nothing —
 * typecheck, lint, build, unit tests — can tell that `tv_stations` has no
 * `lineup_id`.
 *
 * That is not hypothetical. The station diagnostic added to end a round of
 * guessing about what was stored shipped asking for `lineup_id`; PostgREST
 * rejects the whole select when one column is unknown, so the endpoint built
 * to stop the guessing returned `{"error":"column tv_stations.lineup_id does
 * not exist"}` and answered nothing. It cost a deploy to find out, which is
 * exactly the cost this file removes.
 *
 * Deliberately conservative — it only checks what it can read with certainty:
 *
 *   • tables whose `create table` it parsed out of a migration;
 *   • plain column lists, since `*` and PostgREST's embedded-resource syntax
 *     (`foo(bar)`) name things this parser has no business adjudicating.
 *
 * A column it cannot classify is skipped, never guessed at. The goal is zero
 * false alarms, because a schema gate that cries wolf gets muted and then the
 * next 0041 walks straight through it.
 */

const MIGRATIONS_DIR = join(process.cwd(), 'supabase/migrations');
const SRC_DIR = join(process.cwd(), 'src');

/** Every column each `public.<table>` has, per the migrations as committed. */
function columnsByTable(): Map<string, Set<string>> {
  const out = new Map<string, Set<string>>();
  const files = readdirSync(MIGRATIONS_DIR).filter((f) => f.endsWith('.sql')).sort();

  for (const f of files) {
    const sql = readFileSync(join(MIGRATIONS_DIR, f), 'utf8')
      .replace(/--[^\n]*/g, '') // strip line comments; they contain commas
      .toLowerCase();

    // create table [if not exists] public.x ( ...body... );
    const create = /create\s+table\s+(?:if\s+not\s+exists\s+)?public\.(\w+)\s*\(([\s\S]*?)\n\s*\);/g;
    for (const m of sql.matchAll(create)) {
      const table = m[1]!;
      const cols = out.get(table) ?? new Set<string>();
      // Split the body on top-level commas only — a `numeric(10,2)` or a
      // multi-column `unique (a, b)` must not look like a column boundary.
      let depth = 0;
      let buf = '';
      const parts: string[] = [];
      for (const ch of m[2]!) {
        if (ch === '(') depth++;
        else if (ch === ')') depth--;
        if (ch === ',' && depth === 0) { parts.push(buf); buf = ''; continue; }
        buf += ch;
      }
      parts.push(buf);

      for (const raw of parts) {
        const line = raw.trim();
        if (!line) continue;
        // Table-level constraints are not columns.
        if (/^(primary\s+key|unique|check|constraint|foreign\s+key|exclude|like)\b/.test(line)) continue;
        const name = /^(\w+)/.exec(line)?.[1];
        if (name) cols.add(name);
      }
      out.set(table, cols);
    }

    /* alter table public.x add column [if not exists] y ...
       ONE STATEMENT CAN ADD MANY COLUMNS:
         alter table public.court_participants
           add column if not exists ready     boolean ...,
           add column if not exists tonight   jsonb   ...,
           add column if not exists reactions jsonb   ...;
       An earlier version of this parser took only the first `add column` after
       the table name and reported `tonight` as missing — a false alarm, and
       the fastest way to get a schema gate switched off. Match the statement,
       then every `add column` inside it. */
    const alter = /alter\s+table\s+(?:if\s+exists\s+)?public\.(\w+)([\s\S]*?);/g;
    for (const m of sql.matchAll(alter)) {
      const adds = [...m[2]!.matchAll(/add\s+column\s+(?:if\s+not\s+exists\s+)?(\w+)/g)];
      if (adds.length === 0) continue;
      const cols = out.get(m[1]!) ?? new Set<string>();
      for (const a of adds) cols.add(a[1]!);
      out.set(m[1]!, cols);
    }

    // alter table public.x drop column [if exists] y — a dropped column is
    // gone, and treating it as present would make this gate lie in the one
    // direction that matters.
    const drop = /alter\s+table\s+(?:if\s+exists\s+)?public\.(\w+)\s+drop\s+column\s+(?:if\s+exists\s+)?(\w+)/g;
    for (const m of sql.matchAll(drop)) {
      out.get(m[1]!)?.delete(m[2]!);
    }

    // alter table public.x rename column a to b
    const rename = /alter\s+table\s+(?:if\s+exists\s+)?public\.(\w+)\s+rename\s+column\s+(\w+)\s+to\s+(\w+)/g;
    for (const m of sql.matchAll(rename)) {
      const cols = out.get(m[1]!);
      if (cols) { cols.delete(m[2]!); cols.add(m[3]!); }
    }
  }
  return out;
}

function sourceFiles(dir: string, acc: string[] = []): string[] {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, e.name);
    if (e.isDirectory()) sourceFiles(p, acc);
    else if (/\.tsx?$/.test(e.name) && !/\.test\.tsx?$/.test(e.name)) acc.push(p);
  }
  return acc;
}

interface Selection { file: string; table: string; columns: string[]; raw: string }

/**
 * Find `.from('table')` … `.select('a, b, c')` pairs.
 *
 * Anchored on `.from(` and looking ahead a bounded distance for the nearest
 * `.select(` — that is how these chains are written throughout the codebase,
 * and a bounded window keeps an unrelated later `.select` on a different query
 * from being attributed to this table.
 */
function selections(): Selection[] {
  const found: Selection[] = [];
  for (const file of sourceFiles(SRC_DIR)) {
    const src = readFileSync(file, 'utf8');
    for (const m of src.matchAll(/\.from\(\s*['"](\w+)['"]\s*\)/g)) {
      const window = src.slice(m.index! + m[0].length, m.index! + m[0].length + 300);
      const sel = /^\s*(?:\r?\n\s*)?\.select\(\s*(['"])([^'"]*)\1/.exec(window);
      if (!sel) continue;
      const raw = sel[2]!;
      if (raw.includes('*') || raw.includes('(')) continue; // wildcards / embedded resources
      const columns = raw.split(',').map((c) => c.trim()).filter(Boolean);
      if (columns.length === 0) continue;
      found.push({ file: file.replace(`${process.cwd()}/`, ''), table: m[1]!, columns, raw });
    }
  }
  return found;
}

describe('every selected column exists in the schema', () => {
  const schema = columnsByTable();
  const sels = selections();

  it('parsed the migrations — otherwise this suite proves nothing', () => {
    expect(schema.size).toBeGreaterThan(20);
    // The table this test was written for, with the columns the incident named.
    const st = schema.get('tv_stations');
    expect(st, 'tv_stations was not parsed out of the migrations').toBeDefined();
    expect([...st!].sort()).toEqual(
      ['call_sign', 'created_at', 'id', 'logo_url', 'name', 'network', 'provider_id', 'provider_station_id', 'updated_at'],
    );
    // …and the column that caused the incident is genuinely absent.
    expect(st!.has('lineup_id')).toBe(false);
  });

  it('found real .from().select() pairs to check', () => {
    expect(sels.length).toBeGreaterThan(20);
  });

  it('no query selects a column its table does not have', () => {
    const offenders: string[] = [];
    for (const s of sels) {
      const cols = schema.get(s.table);
      if (!cols) continue; // not a table we parsed; the table-level contract covers existence
      for (const c of s.columns) {
        if (!cols.has(c)) offenders.push(`${s.file}: ${s.table}.${c}  (in select "${s.raw}")`);
      }
    }
    expect(offenders, 'a select names a column that does not exist in any migration').toEqual([]);
  });
});
