'use client';

import { useState } from 'react';
import { useToast } from '@/components/Toast';

interface MigrateResult {
  ok?: boolean;
  applied?: number;
  total?: number;
  results?: { name: string; ok: boolean; error?: string }[];
  error?: string;
}

/**
 * Fires the existing POST /api/admin/migrate route with a manually-entered
 * MIGRATE_SECRET as a bearer token — the same alternative authorization that
 * route already accepted for curl, just reachable from a phone browser now
 * that this page has no admin session to gate on. The route's authorization
 * and migration logic are untouched; this only calls it and renders whatever
 * it returns, in full, so a failure (wrong secret or a migration error) is
 * readable on screen rather than a bare digest.
 *
 * Every field here lives only in this component's state — never
 * localStorage, a cookie, or the URL — so it's gone the moment the page
 * reloads.
 *
 * HOST/PORT/USER/PASSWORD/DATABASE, not a single connection-string field, is
 * the PRIMARY way to connect. A combined connection string kept failing with
 * a bare "Invalid URL" no matter how many copy-paste artifacts (wrapping
 * quotes, trailing whitespace) got sanitized server-side, because the real
 * cause was structural: a password containing @, #, %, or a space requires
 * correct percent-encoding to survive being embedded in a URL, Supabase's
 * own dashboard does not warn about or encode this when it generates a
 * password, and there was no way to diagnose which specific character was
 * the problem without seeing the secret. A raw password field sent as its
 * own value needs no encoding at all, for any character — it goes straight
 * into `pg`'s config object, never through a URL parser. The connection
 * string field still exists below as a fallback for anyone who'd rather
 * paste one, but it is no longer the default or the recommended path.
 */
export function ApplyMigrationsButton() {
  const toast = useToast();
  const [token, setToken] = useState('');
  const [host, setHost] = useState('');
  const [port, setPort] = useState('5432');
  const [database, setDatabase] = useState('postgres');
  const [user, setUser] = useState('postgres');
  const [password, setPassword] = useState('');
  const [dbUrl, setDbUrl] = useState('');
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<MigrateResult | null>(null);

  const useDiscreteFields = host.trim().length > 0;

  async function apply(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setResult(null);
    try {
      const payload: Record<string, string> = {};
      if (useDiscreteFields) {
        // Sent as typed — no client-side trimming of the password, since a
        // real password could legitimately start or end with whitespace and
        // silently altering it would just move the mismatch somewhere new.
        payload.host = host.trim();
        payload.port = port.trim();
        payload.database = database.trim();
        payload.user = user.trim();
        payload.password = password;
      } else if (dbUrl.trim()) {
        payload.dbUrl = dbUrl;
      }
      // A copy-pasted secret very commonly carries a trailing newline or
      // space from wherever it was copied — the route does an exact string
      // match, so an untrimmed value that LOOKS right still fails silently.
      const res = await fetch('/api/admin/migrate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token.trim()}` },
        body: JSON.stringify(payload),
      });
      // Read the raw text first — a crash that never reaches our JSON
      // handlers (a platform-level 500, an HTML error page) still has a body
      // worth showing, and `res.json()` alone throws that text away.
      const text = await res.text();
      let body: MigrateResult;
      try {
        body = text ? (JSON.parse(text) as MigrateResult) : { error: `HTTP ${res.status} (empty response)` };
      } catch {
        body = { error: text ? `HTTP ${res.status}: ${text}` : `HTTP ${res.status}` };
      }
      setResult(body);
      if (res.ok && body.ok) {
        toast.show(`Applied ${body.applied ?? 0} of ${body.total ?? 0} migrations.`, 'success');
      } else {
        toast.show(body.error ?? 'Migration run failed.', 'error');
      }
    } catch (e2) {
      setResult({ error: e2 instanceof Error ? e2.message : 'Network error.' });
      toast.show('Could not reach the migrate endpoint.', 'error');
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={(e) => void apply(e)} className="space-y-3">
      <div>
        <label htmlFor="migrate-secret" className="label">
          Migrate secret
        </label>
        <input
          id="migrate-secret"
          type="password"
          autoComplete="off"
          autoCapitalize="off"
          autoCorrect="off"
          spellCheck={false}
          value={token}
          onChange={(e) => setToken(e.target.value)}
          className="input"
          placeholder="MIGRATE_SECRET"
        />
      </div>

      <div className="rounded-xl border border-white/10 bg-white/[0.03] p-3">
        <p className="label mb-2">
          Database connection <span className="font-normal text-slate-500">— from Supabase → Settings → Database</span>
        </p>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-[2fr_1fr]">
          <div>
            <label htmlFor="migrate-host" className="text-xs text-slate-400">
              Host
            </label>
            <input
              id="migrate-host"
              type="text"
              autoComplete="off"
              autoCapitalize="off"
              autoCorrect="off"
              spellCheck={false}
              value={host}
              onChange={(e) => setHost(e.target.value)}
              className="input"
              placeholder="db.xxxxxxxxxxxx.supabase.co (or the pooler host)"
            />
          </div>
          <div>
            <label htmlFor="migrate-port" className="text-xs text-slate-400">
              Port
            </label>
            <input
              id="migrate-port"
              type="text"
              inputMode="numeric"
              autoComplete="off"
              value={port}
              onChange={(e) => setPort(e.target.value)}
              className="input"
              placeholder="5432"
            />
          </div>
          <div>
            <label htmlFor="migrate-user" className="text-xs text-slate-400">
              User
            </label>
            <input
              id="migrate-user"
              type="text"
              autoComplete="off"
              autoCapitalize="off"
              autoCorrect="off"
              spellCheck={false}
              value={user}
              onChange={(e) => setUser(e.target.value)}
              className="input"
              placeholder="postgres"
            />
          </div>
          <div>
            <label htmlFor="migrate-database" className="text-xs text-slate-400">
              Database
            </label>
            <input
              id="migrate-database"
              type="text"
              autoComplete="off"
              autoCapitalize="off"
              autoCorrect="off"
              spellCheck={false}
              value={database}
              onChange={(e) => setDatabase(e.target.value)}
              className="input"
              placeholder="postgres"
            />
          </div>
          <div className="sm:col-span-2">
            <label htmlFor="migrate-password" className="text-xs text-slate-400">
              Password
            </label>
            <input
              id="migrate-password"
              type="password"
              autoComplete="off"
              autoCapitalize="off"
              autoCorrect="off"
              spellCheck={false}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="input"
              placeholder="your database password — any characters are fine here, nothing needs escaping"
            />
          </div>
        </div>
        <p className="mt-2 text-xs text-slate-500">
          Fill in Host and Password to use these directly — any character in the password is fine, nothing needs
          URL-encoding. Leave Host blank to fall back to the connection-string field below (or the server&apos;s
          SUPABASE_DB_URL if that&apos;s blank too).
        </p>
      </div>

      <details className="rounded-xl border border-white/10 bg-white/[0.03] p-3 text-sm" open={!useDiscreteFields && dbUrl.length > 0}>
        <summary className="cursor-pointer text-slate-300">Or paste a full connection string instead</summary>
        <div className="mt-2">
          <label htmlFor="migrate-db-url" className="text-xs text-slate-400">
            Connection string <span className="text-slate-600">(ignored while Host above is filled in)</span>
          </label>
          <input
            id="migrate-db-url"
            type="password"
            autoComplete="off"
            autoCapitalize="off"
            autoCorrect="off"
            spellCheck={false}
            value={dbUrl}
            onChange={(e) => setDbUrl(e.target.value)}
            className="input"
            placeholder="postgres://postgres:...@db....supabase.co:5432/postgres"
            disabled={useDiscreteFields}
          />
        </div>
      </details>

      <button type="submit" disabled={busy || !token} className="btn-primary disabled:opacity-50">
        {busy ? 'Applying…' : 'Apply pending migrations'}
      </button>

      {result && (
        <div className="rounded-xl border border-white/10 bg-white/[0.03] p-4 text-sm">
          {result.error && !result.results ? (
            <p className="text-red-300">{result.error}</p>
          ) : (
            <>
              <p className="font-semibold text-white">
                {result.applied ?? 0} of {result.total ?? 0} applied
              </p>
              <ul className="mt-2 space-y-1.5">
                {(result.results ?? []).map((r) => (
                  <li key={r.name} className="flex flex-col">
                    <span className={r.ok ? 'text-emerald-300' : 'text-red-300'}>
                      {r.ok ? '✓' : '✗'} <code>{r.name}</code>
                    </span>
                    {!r.ok && r.error && <span className="ml-4 text-xs text-red-200/80">{r.error}</span>}
                  </li>
                ))}
              </ul>
            </>
          )}
        </div>
      )}
    </form>
  );
}
