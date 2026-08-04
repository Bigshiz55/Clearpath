'use client';

import { useState } from 'react';
import { useToast } from '@/components/Toast';

interface MigrateResult {
  ok?: boolean;
  applied?: number;
  total?: number;
  results?: { name: string; ok: boolean; error?: string; skipped?: boolean; reason?: string }[];
  error?: string;
}

/**
 * NO CREDENTIAL FIELDS. NOT ONE. THAT IS THE POINT OF THIS COMPONENT.
 *
 * This form used to collect the production database Host, Port, User,
 * Database and Password, a full connection string, and MIGRATE_SECRET, and
 * POST them to /api/admin/migrate. All of it is gone, and none of it may come
 * back:
 *
 *   - A production password typed into a web page lives in component state, in
 *     the browser's memory, in whatever autofill or password manager sees the
 *     field, and in the request body crossing the network. A form field is not
 *     a neutral convenience for a secret; it is four new places the secret
 *     exists.
 *   - MIGRATE_SECRET in the browser makes the browser a credential store. The
 *     signed-in admin session is already an identity the server can verify on
 *     its own, so the secret bought nothing here.
 *
 * Authorization is now the signed-in Supabase session, checked server-side
 * against ADMIN_EMAILS. The database connection comes from the deployment's
 * own environment. The browser sends an empty POST and receives a result — it
 * never holds, displays, or transmits a secret of any kind.
 *
 * When the server has no connection configured, the honest answer is a 503
 * saying so, NOT a field offering to supply one.
 */
export function ApplyMigrationsButton() {
  const toast = useToast();
  const [state, setState] = useState<'idle' | 'confirm' | 'busy'>('idle');
  const [result, setResult] = useState<MigrateResult | null>(null);

  async function apply() {
    setState('busy');
    setResult(null);
    try {
      const res = await fetch('/api/admin/migrate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        // Empty body, deliberately. The route accepts no parameters at all, so
        // there is nothing a caller could set — no connection to redirect, no
        // credential to inject, no secret to replay.
        body: '{}',
      });
      // Read the raw text first — a crash that never reaches our JSON handlers
      // (a platform-level 500, an HTML error page) still has a body worth
      // showing, and `res.json()` alone throws that text away.
      const text = await res.text();
      let body: MigrateResult;
      try {
        body = text ? (JSON.parse(text) as MigrateResult) : { error: `HTTP ${res.status} (empty response)` };
      } catch {
        body = { error: text ? `HTTP ${res.status}: ${text}` : `HTTP ${res.status}` };
      }
      if (!res.ok && !body.error) {
        body.error =
          res.status === 403 ? 'This account is not on the admin allowlist (ADMIN_EMAILS).'
          : res.status === 503 ? 'This deployment has no database connection configured.'
          : `Failed (${res.status}).`;
      }
      setResult(body);
      if (res.ok && body.ok) {
        toast.show(`Applied ${body.applied ?? 0} of ${body.total ?? 0} migrations.`, 'success');
      } else {
        toast.show(body.error ?? 'Migration run failed.', 'error');
      }
    } catch (e) {
      setResult({ error: e instanceof Error ? e.message : 'Network error.' });
      toast.show('Could not reach the migrate endpoint.', 'error');
    } finally {
      setState('idle');
    }
  }

  return (
    <section className="card p-5" data-testid="apply-migrations">
      <h2 className="text-lg font-bold text-white">Apply pending migrations</h2>
      <p className="mt-1 text-sm text-slate-400">
        Runs the migrations registered in the build against this deployment&rsquo;s configured database. Authorization
        is your signed-in admin session; the connection comes from server configuration. Nothing is entered here.
      </p>

      {state !== 'confirm' ? (
        <button
          type="button"
          onClick={() => setState('confirm')}
          disabled={state === 'busy'}
          data-testid="apply-migrations-open"
          className="btn-primary mt-4 inline-flex min-h-[44px] items-center px-5 disabled:opacity-40"
        >
          {state === 'busy' ? 'Applying…' : 'Apply pending migrations'}
        </button>
      ) : (
        <div className="mt-4 rounded-lg border border-amber-400/40 bg-amber-500/10 p-3" data-testid="apply-migrations-confirm">
          <p className="text-sm text-amber-100">
            This writes to the production schema. Migrations excluded in the build — including any blocked by a
            missing prerequisite — will not run. Continue?
          </p>
          <div className="mt-3 flex gap-2">
            <button type="button" onClick={() => void apply()} data-testid="apply-migrations-confirm-yes"
              className="btn-primary inline-flex min-h-[44px] items-center px-4 text-sm">
              Yes, apply them
            </button>
            <button type="button" onClick={() => setState('idle')}
              className="inline-flex min-h-[44px] items-center rounded-lg border border-white/15 px-4 text-sm font-semibold text-slate-200">
              Cancel
            </button>
          </div>
        </div>
      )}

      {result && (
        <div className="mt-4 rounded-xl border border-white/10 bg-white/[0.03] p-4 text-sm" data-testid="apply-migrations-result">
          {result.error && !result.results ? (
            <p className="text-red-300" role="alert">{result.error}</p>
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
                      {r.skipped && <span className="ml-2 text-xs text-slate-400">already applied</span>}
                    </span>
                    {!r.ok && r.error && <span className="ml-4 text-xs text-red-200/80">{r.error}</span>}
                    {r.reason && <span className="ml-4 text-xs text-slate-400">{r.reason}</span>}
                  </li>
                ))}
              </ul>
            </>
          )}
        </div>
      )}
    </section>
  );
}
