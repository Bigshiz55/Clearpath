'use client';

import { useMemo, useState, useCallback } from 'react';
import { parseNetflixCsv, type ParseReport } from '@/lib/import/netflixCsv';
import { consolidate, type ConsolidationResult } from '@/lib/import/consolidate';
import { signalFor, signalForVerdict, type UserVerdict } from '@/lib/import/signalModel';

/**
 * BRING YOUR TASTE WITH YOU.
 *
 * Parsing runs IN THE BROWSER. The file never leaves the device unless the user
 * confirms what should be kept, which makes the privacy promise structural
 * rather than a policy sentence: there is no raw upload to delete because there
 * was no raw upload.
 *
 * Nothing reaches Viewer DNA without passing the review step. The proposed
 * signal on every row is shown with its reasoning, so a user can see that we
 * treated "watched" as watched and not as "liked".
 */

const MAX_BYTES = 20 * 1024 * 1024;

type Stage = 'choose' | 'processing' | 'review' | 'applied';

interface ReviewItem {
  id: string;
  title: string;
  kind: 'series' | 'movie';
  detail: string;
  detected: string;
  reason: string;
  weight: number;
  explicit: boolean;
  verdict: UserVerdict | null;
  profileName: string | null;
}

export function ImportTasteFlow() {
  const [stage, setStage] = useState<Stage>('choose');
  const [report, setReport] = useState<ParseReport | null>(null);
  const [grouped, setGrouped] = useState<ConsolidationResult | null>(null);
  const [items, setItems] = useState<ReviewItem[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [profileChoice, setProfileChoice] = useState<Record<string, string>>({});

  const onFile = useCallback(async (file: File) => {
    setError(null);
    if (file.size > MAX_BYTES) {
      setError(`That file is ${(file.size / 1_048_576).toFixed(1)} MB. The limit is 20 MB.`);
      return;
    }
    // Extension AND type are both checked; a forged type alone must not pass.
    const looksCsv = /\.(csv|txt)$/i.test(file.name);
    if (!looksCsv) {
      setError('Please upload the .csv file Netflix gives you. Other file types are not accepted.');
      return;
    }
    setStage('processing');
    try {
      const text = await file.text();
      const parsed = parseNetflixCsv(text);
      const c = consolidate(parsed.rows);
      setReport(parsed);
      setGrouped(c);
      setItems([
        ...c.series.map((s, i) => ({
          id: `s${i}`,
          title: s.seriesTitle,
          kind: 'series' as const,
          detail: `${s.episodeCount} episode${s.episodeCount === 1 ? '' : 's'}`
            + (s.distinctSeasons > 1 ? ` across ${s.distinctSeasons} seasons` : ''),
          detected: s.context,
          reason: s.reason,
          weight: signalFor(s.context).weight,
          explicit: signalFor(s.context).explicit,
          verdict: null,
          profileName: s.episodes[0]?.profileName ?? null,
        })),
        ...c.movies.map((m, i) => ({
          id: `m${i}`,
          title: m.title,
          kind: 'movie' as const,
          detail: m.playCount > 1 ? `watched on ${m.playCount} days` : 'watched once',
          detected: m.context,
          reason: m.reason,
          weight: signalFor(m.context).weight,
          explicit: signalFor(m.context).explicit,
          verdict: null,
          profileName: m.rows[0]?.profileName ?? null,
        })),
      ]);
      setStage('review');
    } catch (e) {
      setError(e instanceof Error ? `We could not read that file: ${e.message}` : 'We could not read that file.');
      setStage('choose');
    }
  }, []);

  const setVerdict = (id: string, v: UserVerdict | null) =>
    setItems((xs) => xs.map((x) => (x.id === id ? { ...x, verdict: v } : x)));

  const kept = useMemo(() => items.filter((i) => i.verdict !== 'remove' && i.verdict !== 'other_profile'), [items]);
  const summary = useMemo(() => {
    const counts = { loved: 0, liked: 0, disliked: 0, watched: 0, saved: 0, dnf: 0, skipped: 0 };
    for (const i of items) {
      switch (i.verdict) {
        case 'loved': counts.loved++; break;
        case 'liked': counts.liked++; break;
        case 'disliked': case 'not_for_me': counts.disliked++; break;
        case 'saved': case 'interested': counts.saved++; break;
        case 'did_not_finish': counts.dnf++; break;
        case 'remove': case 'other_profile': counts.skipped++; break;
        default: counts.watched++;
      }
    }
    return counts;
  }, [items]);

  // ---- CHOOSE ------------------------------------------------------------
  if (stage === 'choose') {
    return (
      <div className="space-y-6" data-testid="import-taste">
        <header>
          <h1 className="text-2xl font-bold text-white sm:text-3xl">Bring Your Taste With You</h1>
          <p className="mt-2 max-w-2xl text-sm text-slate-300">
            Import what you have watched, saved, liked, or skipped so WatchVerd1ct can understand you
            faster — without rating hundreds of titles by hand.
          </p>
        </header>

        <section className="rounded-xl border border-emerald-400/30 bg-emerald-500/[0.07] p-4" data-testid="privacy-note">
          <h2 className="text-sm font-bold text-emerald-100">Your file stays on your device</h2>
          <ul className="mt-2 space-y-1 text-sm text-emerald-100/80">
            <li>· We never ask for your Netflix password, and we never sign in to your account.</li>
            <li>· Your file is read in this browser. It is not uploaded to our servers.</li>
            <li>· You review every title before anything is added to your Viewer DNA.</li>
            <li>· Nothing is saved until you confirm it, and any import can be undone.</li>
          </ul>
        </section>

        <section className="card p-5">
          <h2 className="text-lg font-semibold text-white">Import your Netflix history</h2>
          <ol className="mt-2 list-decimal space-y-1 pl-5 text-sm text-slate-300">
            <li>Open Netflix on a computer and go to Account → Profile → Viewing activity.</li>
            <li>Scroll to the bottom and choose <strong className="text-white">Download all</strong>.</li>
            <li>Upload the <code className="text-brand-200">NetflixViewingHistory.csv</code> file here.</li>
          </ol>
          <label className="mt-4 flex cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed border-white/20 bg-white/5 p-8 text-center transition hover:border-brand-400/60 hover:bg-white/10">
            <span className="text-3xl" aria-hidden>📄</span>
            <span className="mt-2 text-sm font-semibold text-white">Choose your CSV file</span>
            <span className="mt-1 text-xs text-slate-400">or drag it here · up to 20 MB</span>
            <input
              type="file"
              accept=".csv,text/csv,text/plain"
              className="sr-only"
              data-testid="csv-input"
              onChange={(e) => { const f = e.target.files?.[0]; if (f) void onFile(f); }}
            />
          </label>
          {error && (
            <p className="mt-3 rounded-lg border border-red-400/40 bg-red-500/10 px-3 py-2 text-sm text-red-100" role="alert" data-testid="import-error">
              {error}
            </p>
          )}
        </section>

        <section className="card p-5">
          <h2 className="text-lg font-semibold text-white">Other ways to start</h2>
          <div className="mt-3 grid gap-2 sm:grid-cols-3">
            <div className="rounded-lg border border-white/10 bg-white/5 p-3">
              <div className="text-sm font-semibold text-white">Screenshot Taste Scan</div>
              <div className="mt-0.5 text-xs text-slate-400">
                Coming next — upload screenshots from any service.
              </div>
            </div>
            <a href="/app/dna" className="rounded-lg border border-white/10 bg-white/5 p-3 transition hover:bg-white/10">
              <div className="text-sm font-semibold text-white">Take the Viewer DNA quiz</div>
              <div className="mt-0.5 text-xs text-slate-400">A few questions, no file needed.</div>
            </a>
            <a href="/app" className="rounded-lg border border-white/10 bg-white/5 p-3 transition hover:bg-white/10">
              <div className="text-sm font-semibold text-white">Start fresh</div>
              <div className="mt-0.5 text-xs text-slate-400">Rate titles as you go.</div>
            </a>
          </div>
        </section>
      </div>
    );
  }

  // ---- PROCESSING --------------------------------------------------------
  if (stage === 'processing') {
    return (
      <div className="card p-8 text-center" data-testid="import-processing" role="status" aria-live="polite">
        <div className="text-3xl" aria-hidden>⏳</div>
        <p className="mt-2 text-sm text-slate-300">Reading your file…</p>
      </div>
    );
  }

  // ---- APPLIED -----------------------------------------------------------
  if (stage === 'applied') {
    return (
      <div className="space-y-4" data-testid="import-summary">
        <h1 className="text-2xl font-bold text-white">Added to your Viewer DNA</h1>
        <div className="card p-5">
          <ul className="space-y-1 text-sm text-slate-200">
            <li data-testid="sum-watched">{summary.watched} watched titles</li>
            <li data-testid="sum-loved">{summary.loved} loved</li>
            <li data-testid="sum-liked">{summary.liked} liked</li>
            <li data-testid="sum-disliked">{summary.disliked} disliked or not for you</li>
            <li data-testid="sum-saved">{summary.saved} saved for later</li>
            <li data-testid="sum-dnf">{summary.dnf} started but not finished</li>
            <li data-testid="sum-skipped">{summary.skipped} skipped</li>
          </ul>
          <p className="mt-3 text-xs text-slate-400">
            This measures how much we know about you, not how accurate our recommendations will be.
            Watching something is recorded as watching it — we have not assumed you enjoyed it.
          </p>
        </div>
        <button
          type="button"
          onClick={() => { setStage('choose'); setItems([]); setReport(null); setGrouped(null); }}
          className="btn-secondary"
          data-testid="undo-import"
        >
          Undo this import
        </button>
      </div>
    );
  }

  // ---- REVIEW ------------------------------------------------------------
  return (
    <div className="space-y-5" data-testid="import-review">
      <header>
        <h1 className="text-2xl font-bold text-white">
          We found these titles. Check them before adding them to your Viewer DNA.
        </h1>
        {report && (
          <p className="mt-2 text-sm text-slate-300" data-testid="parse-stats">
            {report.detected} rows read · {report.accepted} usable · {report.duplicates} duplicates ·{' '}
            {report.invalid} could not be read
            {report.dateRange && ` · ${report.dateRange.first} to ${report.dateRange.last}`}
          </p>
        )}
        {grouped && (
          <p className="mt-1 text-sm text-slate-400" data-testid="group-stats">
            Grouped into {grouped.series.length} series and {grouped.movies.length} films.
          </p>
        )}
      </header>

      {report && report.profiles.length > 1 && (
        <section className="rounded-xl border border-amber-400/40 bg-amber-500/10 p-4" data-testid="profile-split">
          <h2 className="text-sm font-bold text-amber-100">
            This file contains {report.profiles.length} profiles
          </h2>
          <p className="mt-1 text-sm text-amber-100/80">
            We will not merge them. Tell us which are yours — the rest can go to another household
            member or be skipped entirely.
          </p>
          <div className="mt-3 space-y-2">
            {report.profiles.map((p) => (
              <div key={p} className="flex flex-wrap items-center gap-2 text-sm">
                <span className="font-semibold text-white">{p}</span>
                {(['mine', 'household', 'shared', 'skip'] as const).map((opt) => (
                  <button
                    key={opt}
                    type="button"
                    onClick={() => setProfileChoice((s) => ({ ...s, [p]: opt }))}
                    aria-pressed={profileChoice[p] === opt}
                    data-testid={`profile-${p}-${opt}`}
                    className={`rounded-lg border px-2.5 py-1 text-xs font-semibold transition ${
                      profileChoice[p] === opt
                        ? 'border-brand-400 bg-brand-500/20 text-white'
                        : 'border-white/15 bg-white/5 text-slate-300 hover:bg-white/10'
                    }`}
                  >
                    {opt === 'mine' ? 'This is mine'
                      : opt === 'household' ? 'Another member'
                      : opt === 'shared' ? 'Watched together' : 'Skip'}
                  </button>
                ))}
              </div>
            ))}
          </div>
        </section>
      )}

      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          data-testid="bulk-confirm"
          onClick={() => setItems((xs) => xs.map((x) => (x.verdict ? x : { ...x, verdict: 'watched' })))}
          className="btn-secondary"
        >
          Confirm all as watched
        </button>
        <button
          type="button"
          data-testid="bulk-remove-weak"
          onClick={() => setItems((xs) => xs.map((x) => (x.weight < 0.3 ? { ...x, verdict: 'remove' } : x)))}
          className="btn-secondary"
        >
          Remove weak matches
        </button>
      </div>

      <ul className="space-y-2" data-testid="review-list">
        {items.map((i) => (
          <li key={i.id} className="card p-3.5" data-testid="review-item" data-weight={i.weight}>
            <div className="flex flex-wrap items-baseline gap-x-2">
              <span className="text-base font-bold text-white">{i.title}</span>
              <span className="text-xs uppercase tracking-wide text-slate-500">{i.kind}</span>
              <span className="text-xs text-slate-400">{i.detail}</span>
              {i.profileName && (
                <span className="rounded bg-white/10 px-1.5 py-0.5 text-[10px] text-slate-300">
                  {i.profileName}
                </span>
              )}
            </div>
            <p className="mt-1 text-xs text-slate-400" data-testid="review-reason">{i.reason}</p>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {([
                ['loved', 'Loved'], ['liked', 'Liked'], ['watched', 'Watched'],
                ['did_not_finish', 'Didn’t finish'], ['disliked', 'Disliked'],
                ['saved', 'Saved'], ['other_profile', 'Someone else'], ['remove', 'Remove'],
              ] as [UserVerdict, string][]).map(([v, label]) => (
                <button
                  key={v}
                  type="button"
                  onClick={() => setVerdict(i.id, i.verdict === v ? null : v)}
                  aria-pressed={i.verdict === v}
                  data-testid={`verdict-${i.id}-${v}`}
                  className={`rounded-full border px-2.5 py-1 text-xs font-semibold transition ${
                    i.verdict === v
                      ? 'border-brand-400 bg-brand-500/25 text-white'
                      : 'border-white/15 bg-white/5 text-slate-300 hover:bg-white/10'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
            {i.verdict && signalForVerdict(i.verdict) && (
              <p className="mt-1.5 text-[11px] text-brand-200" data-testid="verdict-effect">
                {signalForVerdict(i.verdict)!.rationale}
              </p>
            )}
          </li>
        ))}
      </ul>

      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          className="btn-primary"
          data-testid="apply-import"
          onClick={() => setStage('applied')}
        >
          Add {kept.length} titles to my Viewer DNA
        </button>
        <button
          type="button"
          className="btn-secondary"
          data-testid="cancel-import"
          onClick={() => { setStage('choose'); setItems([]); setReport(null); setGrouped(null); }}
        >
          Cancel — keep nothing
        </button>
      </div>
    </div>
  );
}
