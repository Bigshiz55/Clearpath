'use client';

import { useState } from 'react';
import { useToast } from '@/components/Toast';

interface CaseFactsResult {
  ok?: boolean;
  bundles?: number;
  matched?: number;
  results?: {
    titleMatches: string[];
    matchedCaseId: string | null;
    matchedCaseTitle: string | null;
    subjectsWritten: number;
    timelineWritten: number;
  }[];
  error?: string;
}

/**
 * Applies the fixed, hand-curated case-facts dataset (POST
 * /api/admin/case-facts) with the same MIGRATE_SECRET bearer token already
 * used for migrations. Each bundle only attaches to a `cases` row that
 * genuinely exists — bundles with no match are shown plainly rather than
 * hidden, so it's clear when the Crime Case Files pipeline hasn't ingested a
 * matching programme yet.
 */
export function ApplyCuratedCaseFactsButton() {
  const toast = useToast();
  const [token, setToken] = useState('');
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<CaseFactsResult | null>(null);

  async function apply(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setResult(null);
    try {
      const res = await fetch('/api/admin/case-facts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token.trim()}` },
        body: '{}',
      });
      const text = await res.text();
      let body: CaseFactsResult;
      try {
        body = text ? (JSON.parse(text) as CaseFactsResult) : { error: `HTTP ${res.status} (empty response)` };
      } catch {
        body = { error: text ? `HTTP ${res.status}: ${text}` : `HTTP ${res.status}` };
      }
      setResult(body);
      if (res.ok && body.ok) {
        toast.show(`${body.matched ?? 0} of ${body.bundles ?? 0} curated cases matched a real Case.`, 'success');
      } else {
        toast.show(body.error ?? 'Case-facts run failed.', 'error');
      }
    } catch (e2) {
      setResult({ error: e2 instanceof Error ? e2.message : 'Network error.' });
      toast.show('Could not reach the case-facts endpoint.', 'error');
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={(e) => void apply(e)} className="space-y-3">
      <div>
        <label htmlFor="case-facts-secret" className="label">
          Migrate secret
        </label>
        <input
          id="case-facts-secret"
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
        {busy ? 'Applying…' : 'Apply curated case facts'}
      </button>

      {result && (
        <div className="rounded-xl border border-white/10 bg-white/[0.03] p-4 text-sm">
          {result.error && !result.results ? (
            <p className="text-red-300">{result.error}</p>
          ) : (
            <>
              <p className="font-semibold text-white">
                {result.matched ?? 0} of {result.bundles ?? 0} matched a real Case
              </p>
              <ul className="mt-2 space-y-1.5">
                {(result.results ?? []).map((r) => (
                  <li key={r.titleMatches.join('|')} className="flex flex-col">
                    <span className={r.matchedCaseId ? 'text-emerald-300' : 'text-slate-400'}>
                      {r.matchedCaseId ? '✓' : '—'} {r.titleMatches[0]}
                      {r.matchedCaseId && ` → "${r.matchedCaseTitle}" (${r.subjectsWritten} subjects, ${r.timelineWritten} timeline events written)`}
                      {!r.matchedCaseId && ' — no matching Case ingested yet'}
                    </span>
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
