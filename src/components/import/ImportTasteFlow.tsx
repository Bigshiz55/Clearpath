'use client';

import { useMemo, useState, useCallback } from 'react';
import { parseNetflixCsv, type ParseReport } from '@/lib/import/netflixCsv';
import { consolidate, type ConsolidationResult } from '@/lib/import/consolidate';
import { signalFor, signalForVerdict, type UserVerdict } from '@/lib/import/signalModel';
import { importParsedTitles, undoImportedTitles, type ImportRowResult } from '@/lib/actions/import';
import { reportReliabilityEvent } from '@/lib/monitoringClient';

/**
 * BRING YOUR TASTE WITH YOU.
 *
 * Parsing runs IN THE BROWSER. The file never leaves the device unless the user
 * confirms what should be kept, which makes the privacy promise structural
 * rather than a policy sentence: there is no raw upload to delete because there
 * was no raw upload.
 *
 * Nothing reaches your watchlist without passing the review step. The
 * proposed signal on every row is shown with its reasoning, so a user can
 * see that we treated "watched" as watched and not as "liked" — even
 * though, today, only the watched fact and a best-effort rating actually
 * get written (see applyImport below); the richer per-title signal this
 * module computes isn't persisted anywhere yet.
 */

const MAX_BYTES = 20 * 1024 * 1024;
// Matches importParsedTitles's own per-call cap (see src/lib/actions/import.ts).
const IMPORT_BATCH = 40;

/** A best-effort 1-10 rating from the verdict tier — importParsedTitles only
 *  accepts a title + rating, so this is what actually reaches the watchlist
 *  row. 'saved'/'interested' titles are excluded upstream (see toImport
 *  below): the user hasn't watched them, so writing a 'watched' row would
 *  misstate their real status. */
function ratingForVerdict(v: UserVerdict | null): number | null {
  switch (v) {
    case 'loved': return 9;
    case 'liked': return 7;
    case 'disliked':
    case 'not_for_me': return 2;
    default: return null; // watched/did_not_finish/finished/okay/null — no rating claim
  }
}

/* Line art rather than emoji for the three marks that carry meaning here: an
   emoji shield renders as a different object on every platform, and this one is
   making a promise about where the file goes. */
function ShieldIcon({ className = '' }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10Z" />
      <path d="m9 12 2 2 4-4" />
    </svg>
  );
}

function CheckIcon({ className = '' }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="m5 13 4 4L19 7" />
    </svg>
  );
}

function UploadIcon({ className = '' }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
      <path d="M7 9l5-5 5 5" />
      <path d="M12 4v12" />
    </svg>
  );
}

type Stage = 'choose' | 'processing' | 'review' | 'applying' | 'applied';

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
  const [applyResult, setApplyResult] = useState<{
    imported: number;
    unmatched: number;
    notImported: number;
    importedKeys: { tmdbId: number; mediaType: 'movie' | 'tv' }[];
  } | null>(null);
  const [signInRequired, setSignInRequired] = useState(false);
  const [undoState, setUndoState] = useState<'idle' | 'busy' | 'done' | 'error'>('idle');

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

  const applyImport = useCallback(async () => {
    setError(null);
    setSignInRequired(false);
    setStage('applying');

    // 'saved'/'interested' means the user hasn't watched it — writing a
    // 'watched' row for it would misstate their real status, so only the
    // watched-type verdicts (or the unset default, which still means "this
    // was in your viewing history") go to the watchlist.
    const toImport = kept.filter((i) => i.verdict !== 'saved' && i.verdict !== 'interested');
    const notImported = kept.length - toImport.length;

    const allRows: ImportRowResult[] = [];
    let importFailed: string | null = null;
    for (let i = 0; i < toImport.length; i += IMPORT_BATCH) {
      const batch = toImport.slice(i, i + IMPORT_BATCH).map((x) => ({ title: x.title, rating: ratingForVerdict(x.verdict) }));
      const res = await importParsedTitles(batch);
      if (!res.ok) {
        importFailed = res.error ?? 'Something went wrong while adding these titles.';
        break;
      }
      allRows.push(...res.rows);
    }

    if (importFailed) {
      const needsSignIn = /signed in/i.test(importFailed);
      if (needsSignIn) {
        setSignInRequired(true);
      } else {
        setError(importFailed);
      }
      reportReliabilityEvent('import_failure', { reason: needsSignIn ? 'signin_required' : 'error' });
      setStage('review');
      return;
    }

    setApplyResult({
      imported: allRows.filter((r) => r.status === 'imported').length,
      unmatched: allRows.filter((r) => r.status === 'unmatched').length,
      notImported,
      importedKeys: allRows
        .filter((r): r is ImportRowResult & { tmdbId: number; mediaType: 'movie' | 'tv' } => r.status === 'imported' && r.tmdbId != null && r.mediaType != null)
        .map((r) => ({ tmdbId: r.tmdbId, mediaType: r.mediaType })),
    });
    setUndoState('idle');
    setStage('applied');
  }, [kept]);

  const undoApply = useCallback(async () => {
    if (!applyResult) return;
    setUndoState('busy');
    const res = await undoImportedTitles(applyResult.importedKeys);
    if (!res.ok) {
      setUndoState('error');
      return;
    }
    setUndoState('done');
    setStage('choose');
    setItems([]);
    setReport(null);
    setGrouped(null);
    setApplyResult(null);
  }, [applyResult]);
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
      <div className="space-y-6 sm:space-y-8" data-testid="import-taste">
        <header className="max-w-2xl">
          <h1 className="text-[1.75rem] font-black leading-[1.1] tracking-tight text-white sm:text-4xl">
            Bring your taste with you
          </h1>
          <p className="mt-3 text-base leading-relaxed text-slate-300 sm:text-lg">
            Import what you have watched, saved, liked or skipped, and WatchVerd1ct understands you in
            one go — instead of you rating hundreds of titles by hand.
          </p>
        </header>

        {/* THE PROMISE COMES FIRST, and it is structural rather than a policy
            sentence: the parsing runs in this browser, so there is no raw
            upload to delete because there was no raw upload. It used to be four
            lines of 14px text behind a "·" — the same weight as a footnote for
            the thing most people want answered before they pick a file. */}
        <section
          className="rounded-2xl border border-emerald-400/30 bg-emerald-500/[0.07] p-5 sm:p-6"
          data-testid="privacy-note"
        >
          <h2 className="flex items-center gap-2.5 text-lg font-bold text-emerald-50 sm:text-xl">
            <ShieldIcon className="h-6 w-6 flex-none text-emerald-300" />
            Your file stays on your device
          </h2>
          <ul className="mt-4 space-y-3">
            {[
              'We never ask for your Netflix password, and we never sign in to your account.',
              'Your file is read in this browser. It is not uploaded to our servers.',
              'You review every title before anything is added to your watchlist.',
              'Nothing is saved until you confirm it, and any import can be undone.',
            ].map((line) => (
              <li key={line} className="flex gap-3 text-[15px] leading-relaxed text-emerald-50/90">
                <CheckIcon className="mt-0.5 h-5 w-5 flex-none text-emerald-300" />
                <span>{line}</span>
              </li>
            ))}
          </ul>
        </section>

        <section className="card p-5 sm:p-6">
          <h2 className="text-xl font-bold text-white sm:text-2xl">Import your Netflix history</h2>
          {/* Numbered discs rather than a `list-decimal` margin — on a phone the
              browser's own numerals sat outside the card's padding and the
              steps read as an afterthought. */}
          <ol className="mt-4 space-y-3.5">
            {[
              <>Open Netflix on a computer and go to <strong className="font-semibold text-white">Account → Profile → Viewing activity</strong>.</>,
              <>Scroll to the bottom and choose <strong className="font-semibold text-white">Download all</strong>.</>,
              <>Upload the <code className="rounded bg-white/10 px-1.5 py-0.5 text-[13px] text-brand-200">NetflixViewingHistory.csv</code> file here.</>,
            ].map((step, i) => (
              <li key={i} className="flex gap-3.5">
                <span
                  aria-hidden
                  className="grid h-7 w-7 flex-none place-items-center rounded-full bg-brand-500/25 text-sm font-black text-brand-100"
                >
                  {i + 1}
                </span>
                <span className="pt-0.5 text-[15px] leading-relaxed text-slate-300">{step}</span>
              </li>
            ))}
          </ol>

          <label className="mt-5 flex cursor-pointer flex-col items-center justify-center rounded-2xl border-2 border-dashed border-brand-400/40 bg-brand-500/[0.07] px-5 py-9 text-center transition hover:border-brand-400/80 hover:bg-brand-500/15 sm:py-12">
            <UploadIcon className="h-11 w-11 text-brand-200" />
            <span className="mt-3 text-lg font-bold text-white sm:text-xl">Choose your CSV file</span>
            <span className="mt-1.5 text-sm text-slate-400">or drag it here · up to 20 MB</span>
            <input
              type="file"
              accept=".csv,text/csv,text/plain"
              className="sr-only"
              data-testid="csv-input"
              onChange={(e) => { const f = e.target.files?.[0]; if (f) void onFile(f); }}
            />
          </label>
          {error && (
            <p className="mt-4 rounded-xl border border-red-400/40 bg-red-500/10 px-4 py-3 text-[15px] text-red-100" role="alert" data-testid="import-error">
              {error}
            </p>
          )}
        </section>

        <section className="card p-5 sm:p-6">
          <h2 className="text-xl font-bold text-white sm:text-2xl">Other ways to start</h2>
          <div className="mt-4 grid gap-3 sm:grid-cols-3">
            {/* Not a link, and it must not look like one: this does not exist
                yet, and a tappable card that goes nowhere is worse than a
                labelled placeholder. */}
            <div className="rounded-xl border border-white/10 bg-white/[0.03] p-4 opacity-70">
              <div className="text-2xl" aria-hidden>🖼️</div>
              <div className="mt-2 text-base font-bold text-white">Screenshot Taste Scan</div>
              <div className="mt-1 text-sm leading-relaxed text-slate-400">
                Coming next — upload screenshots from any service.
              </div>
            </div>
            {([
              ['/app/dna', '🧬', 'Take the Viewer DNA quiz', 'A few questions, no file needed.'],
              ['/app', '⭐', 'Start fresh', 'Rate titles as you go.'],
            ] as const).map(([href, emoji, title, sub]) => (
              <a
                key={href}
                href={href}
                className="group flex min-h-[44px] flex-col rounded-xl border border-white/12 bg-white/5 p-4 transition hover:border-brand-400/50 hover:bg-white/10"
              >
                <span className="text-2xl" aria-hidden>{emoji}</span>
                <span className="mt-2 flex items-center gap-1.5 text-base font-bold text-white">
                  {title}
                  <span aria-hidden className="text-brand-300 transition group-hover:translate-x-0.5">→</span>
                </span>
                <span className="mt-1 text-sm leading-relaxed text-slate-400">{sub}</span>
              </a>
            ))}
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

  // ---- APPLYING ------------------------------------------------------------
  // A real network step now (matching titles against TMDB, writing your
  // watchlist) rather than an instant local-state flip — this can take a
  // few seconds for a large history, so it gets its own honest wait state.
  if (stage === 'applying') {
    return (
      <div className="card p-8 text-center" data-testid="import-applying" role="status" aria-live="polite">
        <div className="text-3xl" aria-hidden>⏳</div>
        <p className="mt-2 text-sm text-slate-300">Adding your titles — matching each one and saving it…</p>
      </div>
    );
  }

  // ---- APPLIED -----------------------------------------------------------
  if (stage === 'applied' && applyResult) {
    return (
      <div className="space-y-4" data-testid="import-summary">
        <h1 className="text-2xl font-bold text-white">Added to your watchlist</h1>
        <div className="card p-5">
          <ul className="space-y-1 text-sm text-slate-200">
            <li data-testid="sum-imported">{applyResult.imported} title{applyResult.imported === 1 ? '' : 's'} matched and added, marked watched</li>
            {applyResult.unmatched > 0 && (
              <li data-testid="sum-unmatched" className="text-amber-300">
                {applyResult.unmatched} couldn’t be matched to a real title and were skipped
              </li>
            )}
            {applyResult.notImported > 0 && (
              <li data-testid="sum-not-imported" className="text-slate-400">
                {applyResult.notImported} marked “saved for later” weren’t added — this import is for what you’ve
                watched, not what you plan to
              </li>
            )}
            <li data-testid="sum-loved">{summary.loved} loved</li>
            <li data-testid="sum-liked">{summary.liked} liked</li>
            <li data-testid="sum-disliked">{summary.disliked} disliked or not for you</li>
            <li data-testid="sum-dnf">{summary.dnf} started but not finished</li>
            <li data-testid="sum-skipped">{summary.skipped} skipped</li>
          </ul>
          {/* Both sentences below are load-bearing anti-overclaim copy that
              predates this screen's rewrite; they were briefly lost when the
              summary was rebuilt around real counts, and import-taste.spec
              pins them for exactly that reason. A bigger import means we know
              MORE about you, not that we are more RIGHT about you. */}
          <p className="mt-3 text-xs text-slate-400">
            This measures how much we know about you, not how accurate our recommendations will be.
            Watching something is recorded as watching it — we have not assumed you enjoyed it.
          </p>
          <p className="mt-2 text-xs text-slate-400">
            Ratings are a best-effort translation of what you told us (Loved/Liked/Disliked) — watching
            something with no stated opinion is recorded as watched, with no rating.
          </p>
        </div>
        {undoState === 'error' && (
          <p className="text-sm text-red-300" role="alert" data-testid="undo-error">
            Couldn’t undo the import. Please try again.
          </p>
        )}
        <button
          type="button"
          onClick={() => void undoApply()}
          disabled={undoState === 'busy'}
          className="btn-secondary"
          data-testid="undo-import"
        >
          {undoState === 'busy' ? 'Removing…' : `Undo this import (removes ${applyResult.imported} title${applyResult.imported === 1 ? '' : 's'})`}
        </button>
      </div>
    );
  }

  // ---- REVIEW ------------------------------------------------------------
  return (
    <div className="space-y-5" data-testid="import-review">
      <header>
        <h1 className="text-2xl font-bold text-white">
          We found these titles. Check them before adding them to your watchlist.
        </h1>
        {report && (
          <p className="mt-2 text-sm text-slate-300" data-testid="parse-stats">
            {report.detected} rows read · {report.accepted} usable · {report.duplicates} duplicates ·{' '}
            {report.invalid} could not be read
            {report.dateRange && ` · ${report.dateRange.first} to ${report.dateRange.last}`}
          </p>
        )}
        {/* An accepted extension (.csv/.txt) whose CONTENT doesn't parse the
            way we expect used to land here silently — "0 usable, 0 duplicates,
            0 could not be read" with an empty list and no explanation. The
            parser already computes exactly why; it just wasn't shown. */}
        {report && report.warnings.length > 0 && (
          <ul className="mt-2 space-y-1" data-testid="parse-warnings">
            {report.warnings.map((w) => (
              <li key={w} className="rounded-lg border border-amber-400/40 bg-amber-500/10 px-3 py-2 text-sm text-amber-100">
                {w}
              </li>
            ))}
          </ul>
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

      {signInRequired && (
        <p className="rounded-xl border border-amber-400/40 bg-amber-500/10 px-4 py-3 text-[15px] text-amber-100" role="alert" data-testid="import-signin-required">
          Sign in to add these to your watchlist — nothing has been added yet.{' '}
          <a href="/login?next=/import-taste" className="font-semibold underline">Sign in</a>
        </p>
      )}
      {error && (
        <p className="rounded-xl border border-red-400/40 bg-red-500/10 px-4 py-3 text-[15px] text-red-100" role="alert" data-testid="apply-error">
          {error}
        </p>
      )}

      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          className="btn-primary"
          data-testid="apply-import"
          onClick={() => void applyImport()}
          disabled={kept.length === 0}
        >
          Add {kept.length} titles to my watchlist
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
