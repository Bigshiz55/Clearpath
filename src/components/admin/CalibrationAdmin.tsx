'use client';

import { useState } from 'react';
import { runCalibration, type CalibrationReport } from '@/lib/actions/adminCalibration';

const KEYS = [
  ['rottenTomatoes', 'Rotten Tomatoes'],
  ['imdb', 'IMDb'],
  ['tmdbAudience', 'TMDB audience'],
  ['metacritic', 'Metacritic'],
] as const;

function pct(n: number): string {
  return `${Math.round(n * 100)}%`;
}
function w(n: number): string {
  return n.toFixed(3);
}

export function CalibrationAdmin() {
  const [report, setReport] = useState<CalibrationReport | null>(null);
  const [running, setRunning] = useState(false);

  async function run() {
    setRunning(true);
    setReport(await runCalibration());
    setRunning(false);
  }

  const snippet =
    report && report.ok
      ? `export const STANDARD_WEIGHTS: StandardWeights = {\n  rottenTomatoes: ${w(report.fitted.rottenTomatoes)},\n  imdb: ${w(report.fitted.imdb)},\n  tmdbAudience: ${w(report.fitted.tmdbAudience)},\n  metacritic: ${w(report.fitted.metacritic)},\n};`
      : '';

  return (
    <div className="mt-6 space-y-5">
      <button onClick={run} disabled={running} className="btn-primary">
        {running ? 'Fitting…' : '⚖️ Run calibration'}
      </button>

      {report && !report.ok && (
        <p className="rounded-xl border border-amber-400/30 bg-amber-500/10 p-4 text-sm text-amber-100">{report.error}</p>
      )}

      {report && report.ok && (
        <>
          <div className="grid grid-cols-3 gap-3">
            <div className="card p-4 text-center">
              <div className="text-2xl font-black text-white">{report.sampleSize}</div>
              <div className="text-xs text-slate-400">training rows</div>
            </div>
            <div className="card p-4 text-center">
              <div className="text-2xl font-black text-white">{report.withCritics}</div>
              <div className="text-xs text-slate-400">with critic data</div>
            </div>
            <div className="card p-4 text-center">
              <div className="text-2xl font-black text-white">{report.liked}</div>
              <div className="text-xs text-slate-400">rated ≥ 7 (“liked”)</div>
            </div>
          </div>

          <div className="card p-4">
            <div className="text-xs font-semibold uppercase tracking-[0.16em] text-gold-400" style={{ fontFamily: 'Georgia, serif' }}>
              Hit-rate (precision@30% on {report.testSize} held-out rows)
            </div>
            <div className="mt-3 grid grid-cols-3 gap-3 text-center">
              <div>
                <div className="text-xl font-black text-emerald-300">{pct(report.hitRate)}</div>
                <div className="text-[11px] text-slate-400">fitted weights</div>
              </div>
              <div>
                <div className="text-xl font-black text-slate-200">{pct(report.currentHitRate)}</div>
                <div className="text-[11px] text-slate-400">current (shipped)</div>
              </div>
              <div>
                <div className="text-xl font-black text-slate-400">{pct(report.baseline)}</div>
                <div className="text-[11px] text-slate-400">uniform baseline</div>
              </div>
            </div>
          </div>

          <div className="card p-4">
            <div className="mb-2 text-xs font-semibold uppercase tracking-[0.16em] text-gold-400" style={{ fontFamily: 'Georgia, serif' }}>
              Weights — current → fitted
            </div>
            <div className="space-y-2">
              {KEYS.map(([key, label]) => (
                <div key={key} className="flex items-center justify-between text-sm">
                  <span className="text-slate-300">{label}</span>
                  <span className="tabular-nums text-slate-400">
                    {w(report.currentWeights[key])} <span className="text-slate-600">→</span>{' '}
                    <span className="font-bold text-white">{w(report.fitted[key])}</span>
                  </span>
                </div>
              ))}
            </div>
          </div>

          <div className="card p-4">
            <div className="mb-2 text-xs text-slate-400">
              To promote these, paste into <code className="text-slate-300">src/lib/scoring/standardWeights.ts</code> (and update the meta). Inference stays deterministic — nothing changes until you ship this.
            </div>
            <pre className="overflow-x-auto rounded-lg border border-white/10 bg-black/40 p-3 text-xs text-slate-200">{snippet}</pre>
          </div>
        </>
      )}
    </div>
  );
}
