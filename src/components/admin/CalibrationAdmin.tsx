'use client';

import { useState } from 'react';
import { runCalibration, runReranker, type CalibrationReport, type RerankerReport } from '@/lib/actions/adminCalibration';

const KEYS = [
  ['rottenTomatoes', 'Rotten Tomatoes (critics)'],
  ['rtAudience', 'RT audience (Popcorn)'],
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
      ? `export const STANDARD_WEIGHTS: StandardWeights = {\n  rottenTomatoes: ${w(report.fitted.rottenTomatoes)},\n  rtAudience: ${w(report.fitted.rtAudience)},\n  imdb: ${w(report.fitted.imdb)},\n  tmdbAudience: ${w(report.fitted.tmdbAudience)},\n  metacritic: ${w(report.fitted.metacritic)},\n};`
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

function pct2(n: number): string {
  return `${Math.round(n * 100)}%`;
}

/**
 * The learned re-ranker: fits objective-quality + content-fingerprint fit to
 * real "liked" outcomes and reports hit-rate vs an objective-only baseline.
 * Promote the fitted model into rerankerWeights.ts once it beats the baseline.
 */
export function RerankerAdmin() {
  const [report, setReport] = useState<RerankerReport | null>(null);
  const [running, setRunning] = useState(false);

  async function run() {
    setRunning(true);
    setReport(await runReranker());
    setRunning(false);
  }

  const snippet =
    report && report.ok
      ? `export const RERANK_MODEL: RerankModel = {\n  bias: ${report.fitted.bias.toFixed(4)},\n  wObjective: ${report.fitted.wObjective.toFixed(4)},\n  wDim: ${report.fitted.wDim.toFixed(4)},\n};`
      : '';

  const beatsBaseline = report && report.ok && report.hitRate > report.baseline;

  return (
    <div className="mt-10 space-y-5 border-t border-white/10 pt-8">
      <div>
        <h2 className="text-lg font-bold text-white">🧠 Learned re-ranker</h2>
        <p className="mt-1 text-sm text-slate-400">Learns how much objective quality vs. content-fingerprint fit predicts what people actually like, from real ratings.</p>
      </div>

      <button onClick={run} disabled={running} className="btn-primary">
        {running ? 'Fitting…' : '🧠 Fit re-ranker'}
      </button>

      {report && !report.ok && (
        <p className="rounded-xl border border-amber-400/30 bg-amber-500/10 p-4 text-sm text-amber-100">{report.error}</p>
      )}

      {report && report.ok && (
        <>
          <div className="grid grid-cols-3 gap-3">
            <div className="card p-4 text-center">
              <div className="text-2xl font-black text-white">{report.usable}</div>
              <div className="text-xs text-slate-400">usable rows</div>
            </div>
            <div className="card p-4 text-center">
              <div className="text-2xl font-black text-white">{report.users}</div>
              <div className="text-xs text-slate-400">users</div>
            </div>
            <div className="card p-4 text-center">
              <div className="text-2xl font-black text-white">{report.liked}</div>
              <div className="text-xs text-slate-400">liked (≥7)</div>
            </div>
          </div>

          <div className="card p-4">
            <div className="text-xs font-semibold uppercase tracking-[0.16em] text-gold-400" style={{ fontFamily: 'Georgia, serif' }}>
              Hit-rate (precision@30% on {report.testSize} held-out rows)
            </div>
            <div className="mt-3 grid grid-cols-2 gap-3 text-center">
              <div>
                <div className={`text-xl font-black ${beatsBaseline ? 'text-emerald-300' : 'text-slate-200'}`}>{pct2(report.hitRate)}</div>
                <div className="text-[11px] text-slate-400">learned re-ranker</div>
              </div>
              <div>
                <div className="text-xl font-black text-slate-400">{pct2(report.baseline)}</div>
                <div className="text-[11px] text-slate-400">objective-only baseline</div>
              </div>
            </div>
            <div className={`mt-2 text-center text-xs font-semibold ${beatsBaseline ? 'text-emerald-300' : 'text-amber-300'}`}>
              {beatsBaseline ? '✓ Beats the baseline — safe to promote.' : 'Not beating the baseline yet — keep gathering ratings.'}
            </div>
          </div>

          <div className="card p-4">
            <div className="mb-2 text-xs text-slate-400">
              To promote, paste into <code className="text-slate-300">src/lib/scoring/rerankerWeights.ts</code>. Until then the model is neutral and ranking is unchanged.
            </div>
            <pre className="overflow-x-auto rounded-lg border border-white/10 bg-black/40 p-3 text-xs text-slate-200">{snippet}</pre>
          </div>
        </>
      )}
    </div>
  );
}
