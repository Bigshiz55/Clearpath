import { NextResponse } from 'next/server';
import { Client } from 'pg';
import { createAdminClient } from '@/lib/supabase/admin';
import { SCHEMA_CONTRACT, migrationFor } from '@/lib/schemaContract';
import { serverEnv } from '@/lib/env';
import { sanitizeDbUrl, validateDbUrl } from '@/lib/adminMigrateUrl';
import { sanitizedErrorCode } from '@/lib/appliedMigration';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

/**
 * DOES THIS DEPLOYMENT'S DATABASE HAVE WHAT THIS DEPLOYMENT'S CODE NEEDS?
 *
 * The question nothing in the pipeline was asking. Migration 0041 shipped as
 * code, was never applied, and production served cards that read four tables
 * which did not exist — for days, silently, because the honest "availability
 * not confirmed" fallback looks identical whether a title is unchecked or its
 * table is absent.
 *
 * TWO PROBE CHANNELS, for the same reason the ledger reader has two
 * (2026-08-20): production holds a working direct Postgres connection and no
 * REST service key, and this probe was REST-only — so the deployment that
 * most needed to prove "was 0049 actually applied?" answered 503 about a
 * database it could reach. The direct channel is also simply better evidence:
 * one read-only catalog query answers presence AND row-level-security state
 * for every object at once, instead of 100+ sequential PostgREST calls.
 *
 *   1. DIRECT DB (preferred when configured): pg_class/pg_namespace catalog
 *      read — relation names, kinds, and `relrowsecurity`.
 *   2. REST admin client (fallback): the original per-object
 *      `select … limit 1`, unchanged, for deployments configured with a
 *      privileged API key instead of a DB URL. PostgREST cannot see RLS
 *      state, so `rlsDisabled` is only reported on the direct channel.
 *
 * Deliberately UNAUTHENTICATED, and deliberately safe to be:
 *   - it returns object NAMES, which are already public in this repository,
 *   - RLS flags are schema facts the security advisor already surfaces,
 *   - it returns no row data, no counts, no credentials, no environment
 *     values — only booleans about whether configuration exists, and
 *     failure reasons as closed-vocabulary codes (never a message, which
 *     for a pg connect error contains the hostname),
 *   - and a deploy gate that requires a human to authenticate is a deploy
 *     gate that gets skipped.
 */

interface CatalogRow {
  name: string;
  relkind: string;
  relrowsecurity: boolean;
}

type DirectProbe =
  | { ok: true; rows: CatalogRow[]; ledgerTable: LedgerTableReport }
  | { ok: false; reason: string };

/**
 * The application ledger's own shape — schema facts only (columns, RLS,
 * counts, and migration NAMES, which are public in this repository). Exists
 * because the one table the contract deliberately leaves unmapped is also
 * the one whose form drifted for months without any endpoint able to say so:
 * the legacy bare `(name, applied_at)` ledger sat RLS-off in production
 * while every diagnostic looked elsewhere.
 */
interface LedgerTableReport {
  exists: boolean;
  columns: string[];
  rlsEnabled: boolean | null;
  rowCount: number | null;
  successCount: number | null;
  /** Newest migration NAME in the ledger — a filename, not data. */
  latestName: string | null;
}

async function readLedgerTable(client: Client): Promise<LedgerTableReport> {
  try {
    const cols = await client.query(
      `select column_name from information_schema.columns
        where table_schema = 'public' and table_name = 'schema_migrations'
        order by ordinal_position`,
    );
    const columns = (cols.rows ?? []).map((r: { column_name: string }) => r.column_name);
    if (columns.length === 0) {
      return { exists: false, columns: [], rlsEnabled: null, rowCount: null, successCount: null, latestName: null };
    }
    const rls = await client.query(
      `select relrowsecurity from pg_class c join pg_namespace n on n.oid = c.relnamespace
        where n.nspname = 'public' and c.relname = 'schema_migrations'`,
    );
    const hasSuccess = columns.includes('success');
    const counts = await client.query(
      hasSuccess
        ? `select count(*)::int as total, count(*) filter (where success)::int as ok, max(name) as latest from public.schema_migrations`
        : `select count(*)::int as total, null::int as ok, max(name) as latest from public.schema_migrations`,
    );
    const row = counts.rows?.[0] as { total?: number; ok?: number | null; latest?: string | null } | undefined;
    return {
      exists: true,
      columns,
      rlsEnabled: Boolean(rls.rows?.[0]?.relrowsecurity),
      rowCount: row?.total ?? null,
      successCount: row?.ok ?? null,
      latestName: row?.latest ?? null,
    };
  } catch {
    return { exists: false, columns: [], rlsEnabled: null, rowCount: null, successCount: null, latestName: null };
  }
}

async function probeViaDirectDb(rawUrl: string): Promise<DirectProbe> {
  const dbUrl = sanitizeDbUrl(rawUrl);
  if (!validateDbUrl(dbUrl).ok) return { ok: false, reason: 'validate_rejected' };
  let client: Client | null = null;
  try {
    client = new Client({
      connectionString: dbUrl,
      ssl: { rejectUnauthorized: false },
      connectionTimeoutMillis: 5000,
    });
    await client.connect();
    const res = await client.query(
      `select c.relname as name, c.relkind, c.relrowsecurity
         from pg_class c
         join pg_namespace n on n.oid = c.relnamespace
        where n.nspname = 'public'
          and c.relkind in ('r', 'p', 'v', 'm')`,
    );
    const ledgerTable = await readLedgerTable(client);
    return { ok: true, rows: (res.rows ?? []) as CatalogRow[], ledgerTable };
  } catch (err) {
    return { ok: false, reason: sanitizedErrorCode(err) };
  } finally {
    await client?.end().catch(() => {});
  }
}

export async function GET() {
  const objects = [...new Set(SCHEMA_CONTRACT.map((r) => r.object))].sort();
  const missing: { object: string; migration: string; error: string }[] = [];
  const present: string[] = [];
  /** Contract TABLES the direct channel saw with row-level security off —
   *  the exact class of finding the 2026-08-21 ledger-table exposure was. */
  const rlsDisabled: string[] = [];
  let probeFailed: string | null = null;
  let probeChannel: 'direct_db' | 'rest' | null = null;
  let ledgerTable: LedgerTableReport | null = null;
  const channels: { directDb?: string; rest?: string } = {};

  const rawDbUrl = serverEnv.migrationsDbUrl();
  if (rawDbUrl) {
    const direct = await probeViaDirectDb(rawDbUrl);
    if (direct.ok) {
      probeChannel = 'direct_db';
      ledgerTable = direct.ledgerTable;
      const byName = new Map(direct.rows.map((r) => [r.name, r]));
      for (const object of objects) {
        const row = byName.get(object);
        if (!row) {
          missing.push({ object, migration: migrationFor(object) ?? 'unknown', error: 'not present in pg_class' });
        } else {
          present.push(object);
          if ((row.relkind === 'r' || row.relkind === 'p') && row.relrowsecurity === false) {
            rlsDisabled.push(object);
          }
        }
      }
    } else {
      channels.directDb = direct.reason;
    }
  } else {
    channels.directDb = 'not_configured';
  }

  if (probeChannel === null) {
    try {
      const admin = createAdminClient();
      probeChannel = 'rest';
      // Sequential on purpose: a burst of 100+ concurrent PostgREST calls from
      // a health check is a self-inflicted load spike, and this runs rarely.
      for (const object of objects) {
        const { error } = await admin.from(object).select('*').limit(1);
        if (error) {
          missing.push({ object, migration: migrationFor(object) ?? 'unknown', error: error.message });
        } else {
          present.push(object);
        }
      }
    } catch {
      channels.rest = 'missing_key';
      probeFailed = `no probe channel could answer (directDb: ${channels.directDb ?? 'not_tried'}, rest: ${channels.rest})`;
    }
  }

  // Which migrations the missing objects belong to — the actionable summary.
  const migrations = [...new Set(missing.map((m) => m.migration))].sort();

  const ok = probeFailed === null && missing.length === 0;
  return NextResponse.json(
    {
      ok,
      checked: objects.length,
      probeChannel,
      presentCount: present.length,
      missingCount: missing.length,
      /** The migrations an operator needs to apply, in order. */
      unappliedMigrations: migrations,
      missing,
      /** Direct channel only; [] on REST, which cannot see RLS state. */
      rlsDisabled,
      /** The application ledger's own shape (direct channel only) — columns,
       *  RLS, counts, newest migration NAME. Null on the REST fallback. */
      ledgerTable,
      probeFailed,
      /** Booleans only — never the values. Says whether a runner COULD run. */
      runner: {
        databaseUrlConfigured: Boolean(serverEnv.migrationsDbUrl()),
        adminAllowlistConfigured: serverEnv.adminEmails().length > 0,
        migrateSecretConfigured: Boolean(serverEnv.migrateSecret()),
      },
    },
    { status: ok ? 200 : 503, headers: { 'Cache-Control': 'no-store' } },
  );
}
