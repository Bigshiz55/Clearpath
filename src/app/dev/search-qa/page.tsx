'use client';
import { useState } from 'react';
import type { SearchQaView } from '@/lib/searchQa';

/**
 * SEARCH QA DASHBOARD (dev & authorized-test only — the API returns 404 in
 * public production unless an admin is signed in or SEARCH_QA=1). For any query
 * it shows the full understanding funnel: normalized query, intent, reference,
 * hard constraints, soft preferences, the one-follow-up decision, per-dimension
 * confidence, retrieval sources, the candidate funnel, and the running build.
 *
 * Live-only sections (candidate counts, per-title metadata evidence, real
 * availability) render as an explicit "requires TMDB" state — never a fabricated
 * number — so the dashboard is honest about what is and isn't verified offline.
 */

interface QaResponse {
  view: SearchQaView;
  build: { version: string; sha: string; branch: string; env: string; builtAt: string; schema: string };
}

const EXAMPLES = [
  'A Spanish film with English audio similar to A Christmas Story',
  'A Korean crime movie with English audio on Netflix under two hours',
  'A movie like Rocky on Prime, not animated',
  'A British detective series on BritBox under one hour per episode',
  'Fargo the movie, not the series',
];

function Pct({ v }: { v: number }) {
  const pct = Math.round(v * 100);
  const color = pct >= 70 ? '#34d399' : pct >= 50 ? '#fbbf24' : '#f87171';
  return <span style={{ color, fontWeight: 600 }}>{pct}%</span>;
}

export default function SearchQaDashboard() {
  const [q, setQ] = useState('');
  const [data, setData] = useState<QaResponse | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function run(query: string) {
    setLoading(true); setErr(null);
    try {
      const res = await fetch('/api/dev/search-qa', {
        method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ query }),
      });
      if (res.status === 404) { setErr('This dashboard is disabled in this environment (dev / authorized test only).'); setData(null); return; }
      const j = await res.json();
      if (!res.ok) { setErr(j.error ?? 'Failed.'); setData(null); return; }
      setData(j);
    } catch {
      setErr('Network error.');
    } finally { setLoading(false); }
  }

  const v = data?.view;
  const box: React.CSSProperties = { border: '1px solid #ffffff22', borderRadius: 10, padding: 14, marginBottom: 12, background: '#ffffff08' };
  const h: React.CSSProperties = { fontSize: 12, textTransform: 'uppercase', letterSpacing: 0.6, opacity: 0.6, marginBottom: 6 };
  const chip: React.CSSProperties = { display: 'inline-block', border: '1px solid #ffffff33', borderRadius: 999, padding: '2px 10px', margin: '2px 4px 2px 0', fontSize: 13 };

  return (
    <div style={{ maxWidth: 820, margin: '0 auto', padding: 20, color: '#e5e7eb', fontFamily: 'ui-sans-serif, system-ui' }}>
      <h1 style={{ fontSize: 22, fontWeight: 700, marginBottom: 4 }}>Search QA</h1>
      <p style={{ opacity: 0.7, fontSize: 14, marginBottom: 14 }}>What did the engine understand? Offline parse funnel + confidence. Live availability requires a TMDB key.</p>

      {data?.build && (
        <div style={{ ...box, display: 'flex', gap: 14, flexWrap: 'wrap', fontSize: 13 }}>
          <span>build <b>v{data.build.version}</b></span>
          <span>env <b>{data.build.env}</b></span>
          <span>branch <b>{data.build.branch || '—'}</b></span>
          <span>commit <b>{data.build.sha || '—'}</b></span>
          <span>schema <b>{data.build.schema || '—'}</b></span>
          <span style={{ opacity: 0.6 }}>{data.build.builtAt}</span>
        </div>
      )}

      <form onSubmit={(e) => { e.preventDefault(); if (q.trim()) run(q); }} style={{ display: 'flex', gap: 8, marginBottom: 10 }}>
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Type a search…" aria-label="query"
          style={{ flex: 1, padding: '10px 12px', borderRadius: 8, border: '1px solid #ffffff33', background: '#0b0f17', color: 'inherit' }} />
        <button type="submit" disabled={loading || !q.trim()} style={{ padding: '10px 16px', borderRadius: 8, border: 'none', background: '#6366f1', color: 'white', fontWeight: 600 }}>
          {loading ? '…' : 'Inspect'}
        </button>
      </form>
      <div style={{ marginBottom: 16 }}>
        {EXAMPLES.map((ex) => (
          <button key={ex} onClick={() => { setQ(ex); run(ex); }} style={{ ...chip, cursor: 'pointer', background: 'transparent', color: 'inherit' }}>{ex}</button>
        ))}
      </div>

      {err && <div style={{ ...box, borderColor: '#f8717155', color: '#fca5a5' }}>{err}</div>}

      {v && (
        <>
          <div style={box}>
            <div style={h}>Interpretation</div>
            <div>intent: <b>{v.parsedIntent}</b></div>
            {v.reference.title && <div>reference: <b>{v.reference.title}</b> · title id: <i>resolved live only</i></div>}
            {v.detectedLanguages.length > 0 && <div>original language(s): <b>{v.detectedLanguages.join(', ')}</b></div>}
          </div>

          <div style={box}>
            <div style={h}>Hard constraints (invalidate a wrong result)</div>
            {v.hardConstraints.length === 0 ? <i style={{ opacity: 0.6 }}>none</i> : v.hardConstraints.map((c, i) => (
              <span key={i} style={chip}>{c.kind}={c.value} <span style={{ opacity: 0.5 }}>· {c.verifiedBy === 'parse' ? 'parse ✓' : 'live'}</span></span>
            ))}
          </div>

          <div style={box}>
            <div style={h}>Soft preferences (ranking only)</div>
            {v.softPreferences.length === 0 ? <i style={{ opacity: 0.6 }}>none</i> : v.softPreferences.map((s, i) => (
              <span key={i} style={chip}>{s.key}={s.value}</span>
            ))}
          </div>

          <div style={box}>
            <div style={h}>Confidence</div>
            <div style={{ display: 'flex', gap: 18, flexWrap: 'wrap' }}>
              <span>intent <Pct v={v.confidence.intent} /></span>
              <span>metadata <Pct v={v.confidence.metadata} /></span>
              <span>provider <Pct v={v.confidence.provider} /></span>
              <span>audio <Pct v={v.confidence.audio} /></span>
              <span>overall <Pct v={v.confidence.overall} /></span>
            </div>
            <div style={{ marginTop: 8 }}>
              follow-up: {v.followUp.needed ? <b style={{ color: '#fbbf24' }}>ask — “{v.followUp.question}”</b> : <b style={{ color: '#34d399' }}>none needed</b>}
            </div>
          </div>

          <div style={box}>
            <div style={h}>Retrieval sources & candidate funnel</div>
            {v.retrievalSources.map((s, i) => (
              <div key={i}>{s.available ? '🟢' : '⚪️'} {s.name}{s.note ? ` — ${s.note}` : ''}</div>
            ))}
            <div style={{ marginTop: 8, opacity: 0.8 }}>
              before filter: <b>{v.candidateFunnel.beforeFilter ?? '—'}</b> · after filter: <b>{v.candidateFunnel.afterFilter ?? '—'}</b>
            </div>
            {v.candidateFunnel.unavailableReason && <div style={{ marginTop: 4, color: '#fca5a5', fontSize: 13 }}>{v.candidateFunnel.unavailableReason}</div>}
          </div>

          <details style={box}>
            <summary style={{ cursor: 'pointer', ...h, marginBottom: 0 }}>Raw normalized query (JSON)</summary>
            <pre style={{ overflowX: 'auto', fontSize: 12, marginTop: 8 }}>{JSON.stringify(v.normalizedQuery, null, 2)}</pre>
          </details>
        </>
      )}
    </div>
  );
}
