'use client';

import { Fragment, useEffect, useState } from 'react';

/**
 * One-click, read-only migration reconciliation for an authorized admin.
 *
 * Deliberately holds NO secret. Authorization is the signed-in session,
 * verified server-side against ADMIN_EMAILS; the browser never receives
 * MIGRATE_SECRET, the service-role key or the database password, and there is
 * no field here to paste one into.
 */

interface Row {
  migration: string;
  classification: 'PROVEN_APPLIED' | 'PROVEN_NOT_APPLIED' | 'BLOCKED_PREREQUISITE_MISSING' | 'UNKNOWN';
  evidence: string | null;
  backfilled: boolean;
  /** Populated only when something is blocked — names the missing object. */
  note?: string | null;
}
interface Result {
  ok?: boolean;
  dryRun?: boolean;
  ranAt?: string;
  ranBy?: string;
  results?: Row[];
  error?: string;
}

const LEDGER_STATE: Record<Row['classification'], string> = {
  PROVEN_APPLIED: 'Eligible for backfill',
  PROVEN_NOT_APPLIED: 'Must stay unrecorded',
  BLOCKED_PREREQUISITE_MISSING: 'Must stay unrecorded',
  UNKNOWN: 'Left alone — never guessed',
};

const ACTION: Record<Row['classification'], string> = {
  PROVEN_APPLIED: 'Backfill ledger row (evidence-based)',
  PROVEN_NOT_APPLIED: 'Apply the migration before recording anything',
  // Deliberately NOT "apply the migration": it would fail on its first
  // statement. The defect is the missing object named in the row's note.
  BLOCKED_PREREQUISITE_MISSING: 'Do not apply — fix the missing object first',
  UNKNOWN: 'Add a schema probe, then re-check',
};

const TONE: Record<Row['classification'], string> = {
  PROVEN_APPLIED: 'text-emerald-300',
  PROVEN_NOT_APPLIED: 'text-amber-300',
  BLOCKED_PREREQUISITE_MISSING: 'text-red-300',
  UNKNOWN: 'text-slate-400',
};

interface WhoAmI {
  signedIn: boolean;
  anonymous: boolean;
  email: string | null;
  isAdmin: boolean;
  allowlistConfigured: boolean;
  nextStep: 'sign_in' | 'configure_allowlist' | 'wrong_account' | 'ready';
}

export function ReconcileDryRunButton() {
  const [state, setState] = useState<'idle' | 'confirm' | 'busy'>('idle');
  const [result, setResult] = useState<Result | null>(null);
  const [copied, setCopied] = useState(false);
  // Checked up front so the owner is not sent to sign in only to be refused
  // for a different reason on the way back.
  const [who, setWho] = useState<WhoAmI | null>(null);

  useEffect(() => {
    void fetch('/api/admin/whoami')
      .then((r) => (r.ok ? r.json() : null))
      .then((w: WhoAmI | null) => setWho(w))
      .catch(() => setWho(null));
  }, []);

  async function run() {
    setState('busy');
    setResult(null);
    try {
      const res = await fetch('/api/admin/reconcile-dry', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        // No body: the route accepts no parameters, so there is nothing a
        // caller could set to make it write.
      });
      const json = (await res.json()) as Result;
      if (!res.ok) {
        setResult({
          error:
            res.status === 401 ? 'Not signed in. Sign in with your admin email first.'
            : res.status === 403 ? 'This signed-in account is not on the admin allowlist (ADMIN_EMAILS).'
            : res.status === 429 ? 'Too many checks — wait a minute.'
            : res.status === 503 ? 'The server has no database connection configured.'
            : json.error ?? `Failed (${res.status}).`,
        });
      } else {
        setResult(json);
      }
    } catch {
      setResult({ error: 'Could not reach the server. Check your connection and try again.' });
    } finally {
      setState('idle');
    }
  }

  const rows = result?.results ?? [];

  return (
    <section className="card p-5" data-testid="reconcile-dry">
      <h2 className="text-lg font-bold text-white">Migration ledger check</h2>
      <p className="mt-1 text-sm text-slate-400">
        Read-only. Probes the live schema for concrete objects that prove which migrations actually ran.
        It writes nothing and cannot apply a migration.
      </p>

      {state !== 'confirm' ? (
        <button
          type="button"
          onClick={() => setState('confirm')}
          disabled={state === 'busy'}
          data-testid="reconcile-dry-open"
          className="btn-primary mt-4 inline-flex min-h-[44px] items-center px-5 disabled:opacity-40"
        >
          {state === 'busy' ? 'Checking…' : 'Run reconciliation dry check'}
        </button>
      ) : (
        <div className="mt-4 rounded-lg border border-amber-400/40 bg-amber-500/10 p-3" data-testid="reconcile-dry-confirm">
          <p className="text-sm text-amber-100">
            This reads the production schema. It will not write to the ledger or apply any migration. Continue?
          </p>
          <div className="mt-3 flex gap-2">
            <button type="button" onClick={run} data-testid="reconcile-dry-confirm-yes"
              className="btn-primary inline-flex min-h-[44px] items-center px-4 text-sm">
              Yes, run the check
            </button>
            <button type="button" onClick={() => setState('idle')}
              className="inline-flex min-h-[44px] items-center rounded-lg border border-white/15 px-4 text-sm font-semibold text-slate-200">
              Cancel
            </button>
          </div>
        </div>
      )}

      {who && who.nextStep !== 'ready' && (
        <div className="mt-4 rounded-lg border border-amber-400/40 bg-amber-500/10 p-3 text-sm" data-testid="reconcile-dry-gate">
          {who.nextStep === 'sign_in' && (
            <>
              <p className="text-amber-100">You are browsing as a guest, so there is no admin identity to check.</p>
              <a href="/login?next=/admin/migrations"
                 className="btn-primary mt-3 inline-flex min-h-[44px] items-center px-4 text-sm"
                 data-testid="reconcile-dry-signin">
                Sign in with your admin email
              </a>
              <p className="mt-2 text-xs text-amber-200/80">
                You will get a one-time link by email and come straight back here.
              </p>
            </>
          )}
          {who.nextStep === 'configure_allowlist' && (
            <p className="text-amber-100">
              No admin allowlist is configured on the server, so no account can be authorized yet. Set
              <code className="mx-1 rounded bg-black/30 px-1">ADMIN_EMAILS</code> in the Vercel project&rsquo;s
              environment variables to your email address, then redeploy.
            </p>
          )}
          {who.nextStep === 'wrong_account' && (
            <p className="text-amber-100">
              Signed in as <span className="font-semibold">{who.email}</span>, which is not on the admin
              allowlist. Sign in with the address listed in <code className="mx-1 rounded bg-black/30 px-1">ADMIN_EMAILS</code>,
              or add this one to it.
            </p>
          )}
        </div>
      )}

      {result?.error && (
        <p className="mt-4 rounded-lg border border-red-400/40 bg-red-500/10 px-3 py-2 text-sm text-red-200"
           role="alert" data-testid="reconcile-dry-error">
          {result.error}
        </p>
      )}

      {rows.length > 0 && (
        <div className="mt-4" data-testid="reconcile-dry-results">
          <p className="text-xs text-slate-500">
            Ran {result?.ranAt} by {result?.ranBy} · dry run · nothing written
          </p>
          <div className="mt-2 overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="text-[11px] uppercase tracking-wide text-slate-400">
                <tr>
                  <th className="py-1 pr-3">Migration</th>
                  <th className="py-1 pr-3">Classification</th>
                  <th className="py-1 pr-3">Database object found</th>
                  <th className="py-1 pr-3">Ledger status</th>
                  <th className="py-1">Recommended action</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <Fragment key={r.migration}>
                    <tr className="border-t border-white/10 align-top">
                      <td className="py-1.5 pr-3 font-mono text-xs text-slate-200">{r.migration}</td>
                      <td className={`py-1.5 pr-3 font-semibold ${TONE[r.classification]}`}>{r.classification}</td>
                      <td className="py-1.5 pr-3 text-slate-300">{r.evidence ?? <span className="text-slate-500">could not probe</span>}</td>
                      <td className="py-1.5 pr-3 text-slate-300">{LEDGER_STATE[r.classification]}</td>
                      <td className="py-1.5 text-slate-300">{ACTION[r.classification]}</td>
                    </tr>
                    {/* The blocking object, spelled out. A classification name
                        alone does not tell an operator WHICH object is missing
                        or why applying the migration would not fix it. */}
                    {r.note && (
                      <tr data-testid="reconcile-dry-note">
                        <td />
                        <td colSpan={4} className="pb-2 pr-3 text-xs text-red-200/90">{r.note}</td>
                      </tr>
                    )}
                  </Fragment>
                ))}
              </tbody>
            </table>
          </div>

          <button
            type="button"
            data-testid="reconcile-dry-copy"
            onClick={() => {
              void navigator.clipboard.writeText(JSON.stringify(result, null, 2)).then(
                () => { setCopied(true); setTimeout(() => setCopied(false), 2000); },
                () => setCopied(false),
              );
            }}
            className="mt-3 inline-flex min-h-[44px] items-center rounded-lg border border-white/15 px-4 text-sm font-semibold text-slate-200 transition hover:bg-white/10"
          >
            {copied ? 'Copied' : 'Copy full results'}
          </button>
        </div>
      )}
    </section>
  );
}
