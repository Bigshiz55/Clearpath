'use client';
import { useEffect, useState } from 'react';

/**
 * The interactive proof harness. Calls the REAL routes with the founder's own
 * authenticated session (same-origin cookies), never a mock. Everything shown
 * is derived from the live response; nothing is fabricated. It proves the
 * production path distinguishes a CANDIDATE with related metadata from a title
 * that genuinely satisfies the request: the stage counts show the funnel, and
 * every candidate shows its own centrality verdict and — when rejected — why.
 */

interface VersionInfo {
  sha?: string | null;
  shortSha?: string | null;
  schemaVersion?: string | null;
}

interface SubjectEvidence {
  constraint: string;
  satisfied: boolean;
  status: string;
  centrality: string;
  confidence: number;
  evidenceType: string;
  evidence: string;
  rejectionReason: string | null;
}

interface ProofItem {
  id: number;
  mediaType: string;
  title: string;
  year: number | null;
  subjectEvidence?: SubjectEvidence;
  receipts?: string[];
}

interface Evaluation {
  id: number;
  mediaType: string;
  title: string;
  year: number | null;
  status: string;
  centrality: string;
  confidence: number;
  evidence: string;
  rejectionReason: string | null;
  eligible: boolean;
  matchScore: number;
  rankedByTasteDna: boolean;
}

interface Diagnostics {
  requestedCount: number | null;
  candidateCount: number;
  deterministicEligibleCount: number;
  semanticEvaluatedCount: number;
  centralSubjectEligibleCount: number;
  qualityEligibleCount: number;
  finalReturnedCount: number;
  evaluations?: Evaluation[];
}

interface ProofResponse {
  sha?: string;
  route?: string;
  query?: Record<string, unknown>;
  interpretation?: string[];
  constraintReceipt?: Record<string, unknown>;
  diagnostics?: Diagnostics;
  relaxed?: string | null;
  items?: ProofItem[];
  error?: string;
}

const DEFAULT_QUERY = "Find me a boxing movie that I would like that's been made within the last 20 years";

// Explicit colours so the page is legible in BOTH the OS light and dark themes
// (the earlier version relied on default text colour and vanished on dark mode).
const C = {
  bg: '#0d1117',
  panel: '#161b22',
  border: '#30363d',
  text: '#e6edf3',
  dim: '#9da7b3',
  good: '#3fb950',
  bad: '#f85149',
  warn: '#d29922',
  code: '#7ee787',
};

function centralityColor(centrality: string, eligible: boolean): string {
  if (eligible) return C.good;
  if (centrality === 'MATERIAL') return C.warn;
  return C.bad;
}

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
      diagnostics: resp.diagnostics ?? null,
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
  const d = resp?.diagnostics;

  const stat = (label: string, value: number | null | undefined, hint?: string) => (
    <div style={{ padding: '8px 10px', background: C.panel, border: `1px solid ${C.border}`, borderRadius: 8 }}>
      <div style={{ fontSize: 20, fontWeight: 700, color: C.text }}>{value ?? '—'}</div>
      <div style={{ fontSize: 11, color: C.dim }}>{label}</div>
      {hint && <div style={{ fontSize: 10, color: C.dim, marginTop: 2 }}>{hint}</div>}
    </div>
  );

  return (
    <main
      style={{
        maxWidth: 960,
        margin: '0 auto',
        padding: 20,
        fontFamily: 'system-ui, sans-serif',
        background: C.bg,
        color: C.text,
        minHeight: '100vh',
      }}
    >
      <h1 style={{ fontSize: 22, marginBottom: 4, color: C.text }}>Production Search Proof</h1>
      <p style={{ color: C.dim, marginTop: 0 }}>
        Founder-only. Exercises the real <code style={{ color: C.code }}>POST /api/finder</code>. Keyword matches are
        candidates; only titles the evaluator judges <strong>central</strong> are eligible.
      </p>

      <section style={{ background: C.panel, border: `1px solid ${C.border}`, borderRadius: 8, padding: 12, margin: '12px 0', fontSize: 13, color: C.text }}>
        <div><strong>Page build SHA:</strong> <code style={{ color: C.code }}>{pageSha}</code></div>
        <div><strong>/api/version SHA:</strong> <code style={{ color: C.code }}>{version?.sha ?? '…'}</code> (schema {version?.schemaVersion ?? '?'})</div>
        <div><strong>Last response SHA:</strong> <code style={{ color: C.code }}>{resp?.sha ?? respSha ?? '—'}</code></div>
        {shaMismatch && (
          <div style={{ color: C.bad, fontWeight: 600, marginTop: 6 }}>
            This page loaded an older build. Refresh before evaluating these results.
          </div>
        )}
      </section>

      <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: C.text }}>Exact query</label>
      <textarea
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        rows={2}
        style={{ width: '100%', padding: 8, fontSize: 14, borderRadius: 6, border: `1px solid ${C.border}`, background: C.panel, color: C.text }}
      />
      <div style={{ display: 'flex', gap: 8, margin: '10px 0' }}>
        <button onClick={run} disabled={loading} style={{ padding: '8px 16px', borderRadius: 6, background: loading ? C.border : C.good, color: '#02110a', fontWeight: 700, border: 0 }}>
          {loading ? 'Running…' : 'Run against production'}
        </button>
        <button onClick={download} disabled={!resp} style={{ padding: '8px 16px', borderRadius: 6, border: `1px solid ${C.border}`, background: C.panel, color: C.text }}>
          Download redacted diagnostic
        </button>
      </div>

      {resp && !resp.error && (
        <>
          <h3 style={{ marginBottom: 4, color: C.text }}>Route: <code style={{ color: C.code }}>{resp.route}</code></h3>
          {resp.interpretation && resp.interpretation.length > 0 && (
            <ul style={{ fontSize: 13, color: C.dim }}>
              {resp.interpretation.map((line, i) => <li key={i}>{line}</li>)}
            </ul>
          )}

          {d && (
            <>
              <h4 style={{ margin: '12px 0 6px', color: C.text }}>Pipeline stages</h4>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))', gap: 8 }}>
                {stat('requested', d.requestedCount, 'what was asked for')}
                {stat('candidates', d.candidateCount, 'keyword/genre pool')}
                {stat('deterministic', d.deterministicEligibleCount, 'passed hard filters')}
                {stat('semantically evaluated', d.semanticEvaluatedCount)}
                {stat('subject-central', d.centralSubjectEligibleCount, 'genuinely eligible')}
                {stat('quality-eligible', d.qualityEligibleCount)}
                {stat('final returned', d.finalReturnedCount, 'shown to you')}
              </div>
              <p style={{ fontSize: 12, color: C.dim, marginTop: 6 }}>
                A broad candidate pool narrows to the titles where the subject is central, then to one personalized
                pick. Candidates are never presented as recommendations.
              </p>
            </>
          )}

          {resp.relaxed && <p style={{ fontSize: 13, color: C.dim }}><strong>Note:</strong> {resp.relaxed}</p>}

          <h4 style={{ margin: '14px 0 6px', color: C.text }}>Final recommendation{(resp.items?.length ?? 0) === 1 ? '' : 's'} ({resp.items?.length ?? 0})</h4>
          <ol style={{ fontSize: 14, color: C.text }}>
            {(resp.items ?? []).map((i) => (
              <li key={`${i.mediaType}-${i.id}`} style={{ marginBottom: 8 }}>
                <strong>{i.title}</strong> {i.year ? `(${i.year})` : ''}
                {i.subjectEvidence && (
                  <div style={{ fontSize: 12, color: centralityColor(i.subjectEvidence.centrality, i.subjectEvidence.satisfied), marginTop: 2 }}>
                    {i.subjectEvidence.constraint}: <strong>{i.subjectEvidence.centrality}</strong> · {i.subjectEvidence.status} · {i.subjectEvidence.confidence}% — {i.subjectEvidence.evidence}
                  </div>
                )}
              </li>
            ))}
          </ol>

          {d?.evaluations && d.evaluations.length > 0 && (
            <>
              <h4 style={{ margin: '14px 0 6px', color: C.text }}>Per-candidate verdicts ({d.evaluations.length})</h4>
              <p style={{ fontSize: 12, color: C.dim, marginTop: 0 }}>
                Every keyword candidate that cleared the hard filters, with its centrality verdict. Rejected candidates
                show the reason and were never ranked by Taste DNA.
              </p>
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                  <thead>
                    <tr style={{ textAlign: 'left', color: C.dim, borderBottom: `1px solid ${C.border}` }}>
                      <th style={{ padding: '4px 6px' }}>Title</th>
                      <th style={{ padding: '4px 6px' }}>Centrality</th>
                      <th style={{ padding: '4px 6px' }}>Status</th>
                      <th style={{ padding: '4px 6px' }}>Conf.</th>
                      <th style={{ padding: '4px 6px' }}>Eligible</th>
                      <th style={{ padding: '4px 6px' }}>Taste-DNA ranked</th>
                      <th style={{ padding: '4px 6px' }}>Evidence / reason</th>
                    </tr>
                  </thead>
                  <tbody>
                    {d.evaluations.map((e) => (
                      <tr key={`${e.mediaType}-${e.id}`} style={{ borderBottom: `1px solid ${C.border}`, color: C.text }}>
                        <td style={{ padding: '4px 6px' }}>{e.title} {e.year ? `(${e.year})` : ''}</td>
                        <td style={{ padding: '4px 6px', color: centralityColor(e.centrality, e.eligible), fontWeight: 600 }}>{e.centrality}</td>
                        <td style={{ padding: '4px 6px' }}>{e.status}</td>
                        <td style={{ padding: '4px 6px' }}>{e.confidence}%</td>
                        <td style={{ padding: '4px 6px', color: e.eligible ? C.good : C.bad, fontWeight: 700 }}>{e.eligible ? 'YES' : 'NO'}</td>
                        <td style={{ padding: '4px 6px', color: e.rankedByTasteDna ? C.good : C.dim }}>{e.rankedByTasteDna ? 'YES' : 'no'}</td>
                        <td style={{ padding: '4px 6px', color: C.dim }}>{e.eligible ? e.evidence : (e.rejectionReason ?? e.evidence)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}

          <h4 style={{ margin: '14px 0 6px', color: C.text }}>Constraint receipt</h4>
          <pre style={{ background: C.panel, color: C.text, padding: 12, borderRadius: 8, fontSize: 12, overflowX: 'auto', border: `1px solid ${C.border}` }}>
            {JSON.stringify(resp.constraintReceipt, null, 2)}
          </pre>
          <h4 style={{ margin: '10px 0 6px', color: C.text }}>Server-applied query</h4>
          <pre style={{ background: C.panel, color: C.text, padding: 12, borderRadius: 8, fontSize: 12, overflowX: 'auto', border: `1px solid ${C.border}` }}>
            {JSON.stringify(resp.query, null, 2)}
          </pre>
        </>
      )}
      {resp?.error && <p style={{ color: C.bad }}>{resp.error}</p>}
    </main>
  );
}
