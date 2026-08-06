'use client';
import { useEffect, useState } from 'react';

/**
 * The interactive proof harness. Calls the REAL routes with the founder's own
 * authenticated session (same-origin cookies), never a mock. Everything shown
 * is derived from the live response; nothing is fabricated. Redacted download
 * strips nothing sensitive because nothing sensitive is ever fetched here —
 * only the applied query and returned titles.
 */

interface VersionInfo {
  sha?: string | null;
  shortSha?: string | null;
  schemaVersion?: string | null;
}

interface ProofItem {
  id: number;
  mediaType: string;
  title: string;
  year: number | null;
  subjectEvidence?: { constraint: string; satisfied: boolean; evidenceType: string; evidence: string };
  receipts?: string[];
}

interface ProofResponse {
  sha?: string;
  route?: string;
  query?: Record<string, unknown>;
  interpretation?: string[];
  constraintReceipt?: Record<string, unknown>;
  relaxed?: string | null;
  items?: ProofItem[];
  error?: string;
}

const DEFAULT_QUERY = "Find me a boxing movie that I would like that's been made within the last 20 years";

export default function SearchProofClient({ pageSha }: { pageSha: string }) {
  const [version, setVersion] = useState<VersionInfo | null>(null);
  const [query, setQuery] = useState(DEFAULT_QUERY);
  const [resp, setResp] = useState<ProofResponse | null>(null);
  const [respSha, setRespSha] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    fetch('/api/version')
      .then((r) => r.json())
      .then(setVersion)
      .catch(() => setVersion(null));
  }, []);

  async function run() {
    setLoading(true);
    setResp(null);
    setRespSha(null);
    try {
      const r = await fetch('/api/finder', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ text: query }),
      });
      setRespSha(r.headers.get('X-WatchVerd1ct-SHA'));
      const json = (await r.json()) as ProofResponse;
      setResp(json);
    } catch {
      setResp({ error: 'Request failed.' });
    } finally {
      setLoading(false);
    }
  }

  function download() {
    if (!resp) return;
    const redacted = {
      capturedFor: 'production-search-proof',
      pageSha,
      responseSha: resp.sha ?? respSha ?? null,
      versionSha: version?.sha ?? null,
      route: resp.route ?? null,
      query: resp.query ?? null,
      interpretation: resp.interpretation ?? [],
      constraintReceipt: resp.constraintReceipt ?? null,
      relaxed: resp.relaxed ?? null,
      items: (resp.items ?? []).map((i) => ({
        id: i.id,
        mediaType: i.mediaType,
        title: i.title,
        year: i.year,
        subjectEvidence: i.subjectEvidence ?? null,
      })),
    };
    const blob = new Blob([JSON.stringify(redacted, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `search-proof-${(resp.sha ?? 'unknown').slice(0, 7)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }

  const shaMismatch = resp?.sha != null && resp.sha !== pageSha;

  return (
    <main style={{ maxWidth: 900, margin: '0 auto', padding: 24, fontFamily: 'system-ui, sans-serif' }}>
      <h1 style={{ fontSize: 22, marginBottom: 4 }}>Production Search Proof</h1>
      <p style={{ color: '#666', marginTop: 0 }}>Founder-only. Exercises the real <code>POST /api/finder</code>.</p>

      <section style={{ background: '#f6f6f8', borderRadius: 8, padding: 12, margin: '12px 0', fontSize: 13 }}>
        <div><strong>Page build SHA:</strong> <code>{pageSha}</code></div>
        <div><strong>/api/version SHA:</strong> <code>{version?.sha ?? '…'}</code> (schema {version?.schemaVersion ?? '?'})</div>
        <div><strong>Last response SHA:</strong> <code>{resp?.sha ?? respSha ?? '—'}</code></div>
        {shaMismatch && (
          <div style={{ color: '#b00', fontWeight: 600, marginTop: 6 }}>
            This page loaded an older build. Refresh before evaluating these results.
          </div>
        )}
      </section>

      <label style={{ display: 'block', fontSize: 13, fontWeight: 600 }}>Exact query</label>
      <textarea
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        rows={2}
        style={{ width: '100%', padding: 8, fontSize: 14, borderRadius: 6, border: '1px solid #ccc' }}
      />
      <div style={{ display: 'flex', gap: 8, margin: '10px 0' }}>
        <button onClick={run} disabled={loading} style={{ padding: '8px 16px', borderRadius: 6, background: '#111', color: '#fff', border: 0 }}>
          {loading ? 'Running…' : 'Run against production'}
        </button>
        <button onClick={download} disabled={!resp} style={{ padding: '8px 16px', borderRadius: 6, border: '1px solid #ccc', background: '#fff' }}>
          Download redacted diagnostic
        </button>
      </div>

      {resp && !resp.error && (
        <>
          <h3 style={{ marginBottom: 4 }}>Route: <code>{resp.route}</code></h3>
          {resp.interpretation && resp.interpretation.length > 0 && (
            <ul style={{ fontSize: 13, color: '#333' }}>
              {resp.interpretation.map((line, i) => <li key={i}>{line}</li>)}
            </ul>
          )}
          <h4 style={{ marginBottom: 4 }}>Constraint receipt</h4>
          <pre style={{ background: '#0d1117', color: '#c9d1d9', padding: 12, borderRadius: 8, fontSize: 12, overflowX: 'auto' }}>
            {JSON.stringify(resp.constraintReceipt, null, 2)}
          </pre>
          <h4 style={{ marginBottom: 4 }}>Server-applied query</h4>
          <pre style={{ background: '#0d1117', color: '#c9d1d9', padding: 12, borderRadius: 8, fontSize: 12, overflowX: 'auto' }}>
            {JSON.stringify(resp.query, null, 2)}
          </pre>
          {resp.relaxed && <p style={{ fontSize: 13, color: '#555' }}><strong>Relaxation:</strong> {resp.relaxed}</p>}
          <h4 style={{ marginBottom: 4 }}>Returned titles ({resp.items?.length ?? 0})</h4>
          <ol style={{ fontSize: 14 }}>
            {(resp.items ?? []).map((i) => (
              <li key={`${i.mediaType}-${i.id}`} style={{ marginBottom: 6 }}>
                <strong>{i.title}</strong> {i.year ? `(${i.year})` : ''}
                {i.subjectEvidence ? (
                  <span style={{ color: '#0a7', marginLeft: 8 }}>
                    ✓ {i.subjectEvidence.constraint} — {i.subjectEvidence.evidenceType}: {i.subjectEvidence.evidence}
                  </span>
                ) : (
                  <span style={{ color: '#b00', marginLeft: 8 }}>no subject evidence</span>
                )}
              </li>
            ))}
          </ol>
        </>
      )}
      {resp?.error && <p style={{ color: '#b00' }}>{resp.error}</p>}
    </main>
  );
}
