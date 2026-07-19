'use client';

import { useState } from 'react';

interface Result { name: string; ok: boolean; error?: string }

export default function MigratePage() {
  const [secret, setSecret] = useState('');
  const [dbUrl, setDbUrl] = useState('');
  const [busy, setBusy] = useState(false);
  const [results, setResults] = useState<Result[] | null>(null);
  const [err, setErr] = useState<string | null>(null);

  async function run() {
    setBusy(true);
    setErr(null);
    setResults(null);
    try {
      const res = await fetch('/api/admin/migrate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ secret, dbUrl: dbUrl.trim() || undefined }),
      });
      const d = await res.json();
      if (!res.ok) setErr(d.error ?? 'Failed.');
      else setResults(d.results ?? []);
    } catch {
      setErr('Request failed.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto flex min-h-dvh max-w-md flex-col justify-center p-6">
      <h1 className="text-2xl font-bold text-white">⚙️ Run migrations</h1>
      <p className="mt-2 text-sm text-slate-400">
        Applies the pending database migrations. Enter your migrate secret (the
        <code className="mx-1 rounded bg-white/10 px-1">MIGRATE_SECRET</code> you set in Vercel). Paste a
        Supabase connection string only if you didn’t set <code className="rounded bg-white/10 px-1">SUPABASE_DB_URL</code>.
      </p>

      <label className="mt-5 block text-xs font-semibold text-slate-300">Migrate secret</label>
      <input
        type="password"
        value={secret}
        onChange={(e) => setSecret(e.target.value)}
        placeholder="MIGRATE_SECRET"
        className="input mt-1"
        autoComplete="off"
      />

      <label className="mt-4 block text-xs font-semibold text-slate-300">Connection string (optional)</label>
      <input
        type="password"
        value={dbUrl}
        onChange={(e) => setDbUrl(e.target.value)}
        placeholder="postgresql://postgres:…@…supabase.com:5432/postgres"
        className="input mt-1"
        autoComplete="off"
      />

      <button onClick={run} disabled={busy || !secret} className="btn-primary mt-5 w-full py-3 disabled:opacity-40">
        {busy ? 'Running…' : 'Run migrations →'}
      </button>

      {err && <p className="mt-4 rounded-xl border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-200">{err}</p>}

      {results && (
        <div className="mt-4 space-y-2">
          {results.map((r) => (
            <div
              key={r.name}
              className={`flex items-center justify-between rounded-xl border p-3 text-sm ${r.ok ? 'border-emerald-400/30 bg-emerald-500/10 text-emerald-100' : 'border-red-400/30 bg-red-500/10 text-red-100'}`}
            >
              <span className="font-mono text-xs">{r.name}</span>
              <span>{r.ok ? '✓ applied' : `✕ ${r.error?.slice(0, 60)}`}</span>
            </div>
          ))}
          <p className="pt-1 text-center text-xs text-slate-500">
            Already-applied migrations show ✓ (they’re idempotent). A ✕ usually means a prerequisite is missing.
          </p>
        </div>
      )}
    </div>
  );
}
