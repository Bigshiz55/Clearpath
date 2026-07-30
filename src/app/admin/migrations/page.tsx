import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import type { SupabaseClient } from '@supabase/supabase-js';
import { createClient } from '@/lib/supabase/server';
import { isAdminEmail } from '@/lib/admin';
import { PENDING_MIGRATIONS } from '@/lib/pendingMigrations';
import { ApplyMigrationsButton } from '@/components/admin/ApplyMigrationsButton';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = {
  title: 'Migrations · WatchVerd1ct admin',
  robots: { index: false, follow: false },
};

interface MigrationRow {
  name: string;
  markerTable: string | null;
  status: 'applied' | 'pending' | 'unknown';
}

/** Every registered migration's first `create table` (or `alter table`, for
 *  migrations that only add columns to an existing table) target — a real,
 *  lightweight signal of whether it has run, with no separate migrations-log
 *  table to maintain. */
function markerTableFor(sqlB64: string): string | null {
  const sql = Buffer.from(sqlB64, 'base64').toString('utf8');
  const created = sql.match(/create table if not exists public\.(\w+)/i);
  if (created?.[1]) return created[1];
  const altered = sql.match(/alter table public\.(\w+)/i);
  return altered?.[1] ?? null;
}

/** Existence probe, not a content read: a head-only count against the table.
 *  RLS may filter every row away for this admin's own account, but the query
 *  itself still succeeds when the table exists — only a missing relation
 *  throws (PostgREST's "Could not find the table ... in the schema cache"). */
async function tableExists(supabase: SupabaseClient, table: string): Promise<boolean> {
  const { error } = await supabase.from(table).select('*', { head: true, count: 'exact' }).limit(1);
  return !error;
}

async function getMigrationStatuses(supabase: SupabaseClient): Promise<MigrationRow[]> {
  const withMarkers = PENDING_MIGRATIONS.map((m) => ({ name: m.name, markerTable: markerTableFor(m.sqlB64) }));
  const uniqueTables = [...new Set(withMarkers.map((m) => m.markerTable).filter((t): t is string => !!t))];
  const existence = new Map<string, boolean>(
    await Promise.all(uniqueTables.map(async (t) => [t, await tableExists(supabase, t)] as const)),
  );
  return withMarkers.map((m) => ({
    ...m,
    status: m.markerTable === null ? 'unknown' : existence.get(m.markerTable) ? 'applied' : 'pending',
  }));
}

const STATUS_STYLE: Record<MigrationRow['status'], string> = {
  applied: 'border-emerald-400/40 bg-emerald-500/15 text-emerald-100',
  pending: 'border-amber-400/40 bg-amber-500/15 text-amber-100',
  unknown: 'border-white/15 bg-white/5 text-slate-300',
};

export default async function AdminMigrationsPage() {
  // Server-side authorization — never trust the client.
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user?.email || !isAdminEmail(user.email)) notFound();

  const rows = await getMigrationStatuses(supabase);
  const pendingCount = rows.filter((r) => r.status === 'pending').length;

  return (
    <div className="min-h-dvh">
      <main className="container-page max-w-2xl space-y-6 py-8">
        <div>
          <h1 className="text-2xl font-black text-white">Migrations</h1>
          <p className="mt-1 text-sm text-slate-400">
            {rows.length} registered · {pendingCount} pending
          </p>
        </div>

        <ApplyMigrationsButton />

        <ul className="space-y-1.5 text-sm">
          {rows.map((r) => (
            <li key={r.name} className="flex items-center justify-between gap-3 rounded-lg border border-white/5 bg-white/[0.02] px-3 py-2">
              <code className="text-slate-200">{r.name}</code>
              <span className={`shrink-0 rounded-md border px-2 py-0.5 text-[11px] font-bold uppercase ${STATUS_STYLE[r.status]}`}>
                {r.status}
              </span>
            </li>
          ))}
        </ul>
      </main>
    </div>
  );
}
