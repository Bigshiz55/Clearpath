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
 * The token lives only in this component's state — never localStorage, a
 * cookie, or the URL — so it's gone the moment the page reloads.
 */
export function ApplyMigrationsButton() {
  const toast = useToast();
  const [token, setToken] = useState('');
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<MigrateResult | null>(null);

  async function apply(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setResult(null);
    try {
      // A copy-pasted secret very commonly carries a trailing newline or
      // space from wherever it was copied — the route does an exact string
      // match, so an untrimmed value that LOOKS right still fails silently.
      const res = await fetch('/api/admin/migrate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token.trim()}` },
        body: '{}',
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
