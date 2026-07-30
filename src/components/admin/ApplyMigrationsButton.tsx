'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useToast } from '@/components/Toast';

interface MigrateResult {
  ok?: boolean;
  applied?: number;
  total?: number;
  results?: { name: string; ok: boolean; error?: string }[];
  error?: string;
}

/**
 * Fires the existing POST /api/admin/migrate route using the browser's own
 * signed-in-admin session cookie — no token entry, no copy-paste. The route's
 * authorization and migration logic are untouched; this only calls it and
 * renders whatever it returns, in full, so a failure is readable on screen
 * rather than a bare digest.
 */
export function ApplyMigrationsButton() {
  const router = useRouter();
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<MigrateResult | null>(null);

  async function apply() {
    setBusy(true);
    setResult(null);
    try {
      const res = await fetch('/api/admin/migrate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: '{}',
      });
      const body = (await res.json().catch(() => ({ error: `HTTP ${res.status}` }))) as MigrateResult;
      setResult(body);
      if (res.ok && body.ok) {
        toast.show(`Applied ${body.applied ?? 0} of ${body.total ?? 0} migrations.`, 'success');
        router.refresh();
      } else {
        toast.show(body.error ?? 'Migration run failed.', 'error');
      }
    } catch (e) {
      setResult({ error: e instanceof Error ? e.message : 'Network error.' });
      toast.show('Could not reach the migrate endpoint.', 'error');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-3">
      <button onClick={() => void apply()} disabled={busy} className="btn-primary disabled:opacity-50">
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
    </div>
  );
}
