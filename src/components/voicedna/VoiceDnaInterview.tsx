'use client';

import { useCallback, useMemo, useState } from 'react';
import {
  startSession, answerQuestion, skipQuestion, currentQuestion, sessionProgress,
  toReview, backToInterview, reviewItems, canApply, applyReview, undoApply, forgetSession,
  profileOf, type VoiceSession, type ReviewDecision,
} from '@/lib/voicedna/session';
import { reveal, coverageSummary } from '@/lib/voicedna/profile';
import type { InterviewMode } from '@/lib/voicedna/questions';
import type { AudioAvailability } from '@/lib/voicedna/audio';

/**
 * VERD1CT VOICE DNA — the typed interview.
 *
 * The whole engine runs here, in the browser, against the pure modules in
 * `src/lib/voicedna/`. That is not an optimisation: it is why the privacy line
 * on the first screen is true. Nothing is sent anywhere until the user has read
 * every conclusion next to the sentence of theirs that produced it and pressed
 * the button.
 *
 * The interview is adaptive. Contradictions and unstated exceptions interrupt
 * to be settled rather than being resolved on the user's behalf.
 */

export interface VoiceDnaInterviewProps {
  audio: AudioAvailability;
  /** Set when the visitor is signed in and results can actually be saved. */
  canPersist: boolean;
  /** Server action wrappers, injected so this component stays testable. */
  onApply?: (session: VoiceSession) => Promise<{ ok: boolean; error?: string; written: number }>;
}

type Screen = 'intro' | 'interview' | 'review' | 'done';

/** A stable id without pulling in a uuid dependency. */
function newId(): string {
  const c = globalThis.crypto;
  if (c && 'randomUUID' in c) return c.randomUUID();
  const hex = '0123456789abcdef';
  let s = '';
  for (let i = 0; i < 36; i++) {
    s += i === 8 || i === 13 || i === 18 || i === 23 ? '-'
      : i === 14 ? '4'
      : hex[Math.floor(Math.random() * 16)];
  }
  return s;
}

const DECISIONS: Array<{ value: ReviewDecision; label: string; hint: string }> = [
  { value: 'keep', label: 'Right', hint: 'Keep this as written' },
  { value: 'flip', label: 'Backwards', hint: 'I meant the opposite' },
  { value: 'mood', label: 'Just now', hint: 'True today, not always' },
  { value: 'drop', label: 'Drop it', hint: 'Do not use this at all' },
];

export function VoiceDnaInterview({ audio, canPersist, onApply }: VoiceDnaInterviewProps) {
  const [screen, setScreen] = useState<Screen>('intro');
  const [session, setSession] = useState<VoiceSession>(() => startSession(newId(), 'quick', Date.now()));
  const [draft, setDraft] = useState('');
  const [decisions, setDecisions] = useState<Record<string, ReviewDecision>>({});
  const [applying, setApplying] = useState(false);
  const [applyError, setApplyError] = useState<string | null>(null);
  const [written, setWritten] = useState<number | null>(null);

  const ctx = useMemo(() => ({ now: Date.now() }), []);
  const question = useMemo(
    () => (screen === 'interview' ? currentQuestion(session, ctx) : null),
    [screen, session, ctx],
  );
  const profile = useMemo(() => profileOf(session, ctx), [session, ctx]);
  const prog = useMemo(() => sessionProgress(session, ctx), [session, ctx]);
  const items = useMemo(() => reviewItems(session), [session]);
  const gate = useMemo(() => canApply(session, decisions), [session, decisions]);
  const lines = useMemo(() => reveal(profile, session.claims), [profile, session.claims]);

  const begin = useCallback((mode: InterviewMode) => {
    setSession(startSession(newId(), mode, Date.now()));
    setDecisions({});
    setWritten(null);
    setApplyError(null);
    setScreen('interview');
  }, []);

  const submit = useCallback(() => {
    if (!question) return;
    const text = draft.trim();
    setDraft('');
    const next = text
      ? answerQuestion(session, question.id, text, { now: Date.now() })
      : skipQuestion(session, question.id);
    setSession(next);
    if (!currentQuestion(next, { now: Date.now() })) setScreen('review');
  }, [question, draft, session]);

  const choose = useCallback((value: string) => {
    if (!question) return;
    const next = answerQuestion(session, question.id, value, { now: Date.now() });
    setSession(next);
    if (!currentQuestion(next, { now: Date.now() })) setScreen('review');
  }, [question, session]);

  const finish = useCallback(async () => {
    const applied = applyReview(session, decisions, Date.now());
    if (applied.stage !== 'applied') return; // the gate refused
    setSession(applied);
    setScreen('done');
    if (!onApply || !canPersist) return;
    setApplying(true);
    setApplyError(null);
    try {
      const res = await onApply(applied);
      if (!res.ok) setApplyError(res.error ?? 'Could not save that.');
      else setWritten(res.written);
    } catch {
      setApplyError('Could not reach the server. Nothing was saved.');
    } finally {
      setApplying(false);
    }
  }, [session, decisions, onApply, canPersist]);

  // ── Intro ────────────────────────────────────────────────────────────────
  if (screen === 'intro') {
    return (
      <div className="space-y-6" data-testid="voice-dna">
        <header>
          <h1 className="text-2xl font-bold text-white sm:text-3xl">Verd1ct Voice DNA</h1>
          <p className="mt-2 max-w-2xl text-sm text-slate-300">
            A short conversation about what you actually like. Not a quiz — answer in your own
            words, including the contradictions. “I hate sci-fi but I loved Severance” is the most
            useful sentence you can give me.
          </p>
        </header>

        <section
          className="rounded-xl border border-emerald-400/30 bg-emerald-500/[0.07] p-4"
          data-testid="privacy-note"
        >
          <h2 className="text-sm font-bold text-emerald-100">Nothing is saved until you say so</h2>
          <ul className="mt-2 space-y-1 text-sm text-emerald-100/80">
            <li>· The interview runs in this browser. Your answers are not sent while you type.</li>
            <li>· You review every conclusion, next to your own words, before anything is kept.</li>
            <li>· You can delete the whole thing afterwards, and your DNA forgets it too.</li>
          </ul>
        </section>

        <section className="grid gap-3 sm:grid-cols-2">
          <button
            type="button"
            onClick={() => begin('quick')}
            className="card p-5 text-left transition hover:bg-white/10"
            data-testid="start-quick"
          >
            <div className="text-lg font-semibold text-white">Quick — 5 questions</div>
            <p className="mt-1 text-sm text-slate-400">
              About two minutes. Enough to stop the recommendations being generic.
            </p>
          </button>
          <button
            type="button"
            onClick={() => begin('full')}
            className="card p-5 text-left transition hover:bg-white/10"
            data-testid="start-full"
          >
            <div className="text-lg font-semibold text-white">Full — 12 questions</div>
            <p className="mt-1 text-sm text-slate-400">
              Around five minutes, and it goes after your edge cases, not just your genres.
            </p>
          </button>
        </section>

        <section className="card p-4" data-testid="audio-status">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <div className="text-sm font-semibold text-white">Answer out loud</div>
              <p className="mt-0.5 max-w-xl text-xs text-slate-400">{audio.message}</p>
            </div>
            <button
              type="button"
              disabled={!audio.available}
              aria-disabled={!audio.available}
              className="rounded-lg border border-white/15 bg-white/5 px-3 py-2 text-sm font-semibold text-slate-400 disabled:cursor-not-allowed disabled:opacity-60"
              data-testid="record-button"
            >
              {audio.available ? 'Record an answer' : 'Awaiting transcription setup'}
            </button>
          </div>
        </section>

        {!canPersist && (
          <p className="text-xs text-amber-200/80" data-testid="signed-out-note">
            You are not signed in, so this will run but nothing can be saved to your DNA at the end.
          </p>
        )}
      </div>
    );
  }

  // ── Interview ────────────────────────────────────────────────────────────
  if (screen === 'interview' && question) {
    const isRepair = question.kind === 'choice';
    return (
      <div className="space-y-5" data-testid="voice-dna">
        <div className="flex items-center justify-between gap-3">
          <div className="text-xs font-semibold uppercase tracking-wide text-slate-400" data-testid="progress">
            Question {Math.min(prog.asked + 1, prog.total)} of {prog.total}
            {prog.pendingRepairs > 0 && ' · one thing to settle'}
          </div>
          <button
            type="button"
            onClick={() => setScreen('review')}
            className="text-xs font-semibold text-slate-400 underline underline-offset-2 hover:text-white"
            data-testid="finish-early"
          >
            Finish early
          </button>
        </div>

        <div className="h-1 w-full overflow-hidden rounded-full bg-white/10">
          <div
            className="h-full rounded-full bg-brand-400 transition-all"
            style={{ width: `${Math.round((prog.asked / prog.total) * 100)}%` }}
          />
        </div>

        <section className="card p-5" data-testid="question-card">
          {isRepair && (
            <div className="mb-2 inline-block rounded-full bg-amber-400/15 px-2 py-0.5 text-[11px] font-bold uppercase tracking-wide text-amber-200">
              Let me check
            </div>
          )}
          <h1 className="wv-vd-prompt text-xl font-semibold text-white" data-testid="question-prompt">
            {question.prompt}
          </h1>
          {question.helper && <p className="mt-1 text-sm text-slate-400">{question.helper}</p>}

          {question.kind === 'choice' ? (
            <div className="mt-4 grid gap-2" data-testid="choice-group">
              {question.options?.map((o) => (
                <button
                  key={o.value}
                  type="button"
                  onClick={() => choose(o.value)}
                  className="rounded-xl border border-white/15 bg-white/5 px-4 py-3 text-left text-sm font-semibold text-white transition hover:border-brand-400/60 hover:bg-white/10"
                  data-testid={`choice-${o.value}`}
                >
                  {o.label}
                </button>
              ))}
            </div>
          ) : (
            <>
              <label className="sr-only" htmlFor="voice-answer">{question.prompt}</label>
              <textarea
                id="voice-answer"
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) submit();
                }}
                rows={4}
                maxLength={2000}
                placeholder={question.placeholder}
                className="mt-4 w-full resize-y rounded-xl border border-white/15 bg-black/30 p-3 text-sm text-white placeholder:text-slate-500 focus:border-brand-400/60 focus:outline-none"
                data-testid="answer-input"
              />
              <div className="mt-3 flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={submit}
                  disabled={draft.trim().length === 0}
                  className="rounded-lg bg-brand-500 px-4 py-2 text-sm font-bold text-white transition hover:bg-brand-400 disabled:cursor-not-allowed disabled:opacity-40"
                  data-testid="answer-submit"
                >
                  Next
                </button>
                <button
                  type="button"
                  onClick={() => { setDraft(''); setSession(skipQuestion(session, question.id)); }}
                  className="rounded-lg border border-white/15 px-4 py-2 text-sm font-semibold text-slate-300 transition hover:bg-white/10"
                  data-testid="answer-skip"
                >
                  Skip
                </button>
                <span className="text-xs text-slate-500">Skipping costs nothing.</span>
              </div>
            </>
          )}
        </section>

        {session.claims.length > 0 && (
          <section className="card p-4" data-testid="live-reveal">
            <h2 className="text-sm font-semibold text-white">What I have so far</h2>
            <ul className="mt-2 space-y-1.5">
              {lines.slice(0, 4).map((l, i) => (
                <li key={i} className="text-sm text-slate-300">
                  <span className={l.kind === 'mood' ? 'text-amber-200' : ''}>{l.text}</span>
                </li>
              ))}
            </ul>
          </section>
        )}
      </div>
    );
  }

  // ── Review ───────────────────────────────────────────────────────────────
  if (screen === 'review' || (screen === 'interview' && !question)) {
    return (
      <div className="space-y-5" data-testid="voice-dna">
        <header>
          <h1 className="text-2xl font-bold text-white">Check what I heard</h1>
          <p className="mt-1 max-w-2xl text-sm text-slate-300">
            Every line below is something I concluded, shown next to the words you used. Nothing is
            saved until you confirm it.
          </p>
        </header>

        {items.length === 0 ? (
          <section className="card p-6 text-center" data-testid="review-empty">
            <p className="text-sm text-slate-300">
              I did not get anything usable out of that. Nothing has been saved — go back and try a
              couple of answers, or leave it for now.
            </p>
            <button
              type="button"
              onClick={() => { setSession(backToInterview(session)); setScreen('interview'); }}
              className="mt-4 rounded-lg bg-brand-500 px-4 py-2 text-sm font-bold text-white"
              data-testid="review-back"
            >
              Back to the questions
            </button>
          </section>
        ) : (
          <>
            {!gate.ok && (
              <p
                className="rounded-lg border border-amber-400/40 bg-amber-500/10 px-3 py-2 text-sm text-amber-100"
                role="alert"
                data-testid="review-blocked"
              >
                I guessed at {gate.blockedBy.length} title{gate.blockedBy.length === 1 ? '' : 's'}.
                Tell me whether I got {gate.blockedBy.length === 1 ? 'it' : 'them'} right before we go on.
              </p>
            )}

            <ul className="space-y-3" data-testid="review-list">
              {items.map((item) => (
                <li key={item.claimId} className="card p-4" data-testid="review-item">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <p className="text-sm font-semibold text-white" data-testid="review-statement">
                      {item.statement}
                    </p>
                    <span className="rounded-full bg-white/10 px-2 py-0.5 text-[11px] font-bold uppercase tracking-wide text-slate-300">
                      {item.kind === 'mood' ? 'Right now' : item.kind}
                    </span>
                  </div>
                  <p className="mt-1 text-xs italic text-slate-400" data-testid="review-quote">
                    “{item.quote}”
                  </p>
                  {item.needsConfirmation && (
                    <p className="mt-1 text-xs font-semibold text-amber-200" data-testid="review-guess">
                      I guessed this was a title. Was it?
                    </p>
                  )}
                  <div className="wv-vd-decisions mt-3" role="group" aria-label="What should I do with this?">
                    {DECISIONS.map((d) => {
                      const active = (decisions[item.claimId] ?? 'keep') === d.value;
                      return (
                        <button
                          key={d.value}
                          type="button"
                          aria-pressed={active}
                          title={d.hint}
                          onClick={() => setDecisions((s) => ({ ...s, [item.claimId]: d.value }))}
                          className={`rounded-lg border px-2 py-2 text-xs font-semibold transition ${
                            active
                              ? 'border-brand-400 bg-brand-500/20 text-white'
                              : 'border-white/15 bg-white/5 text-slate-300 hover:bg-white/10'
                          }`}
                          data-testid={`decide-${d.value}`}
                        >
                          {d.label}
                        </button>
                      );
                    })}
                  </div>
                </li>
              ))}
            </ul>

            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={finish}
                disabled={!gate.ok}
                className="rounded-lg bg-brand-500 px-5 py-2.5 text-sm font-bold text-white transition hover:bg-brand-400 disabled:cursor-not-allowed disabled:opacity-40"
                data-testid="apply-voice-dna"
              >
                Save this to my DNA
              </button>
              <button
                type="button"
                onClick={() => { setSession(backToInterview(session)); setScreen('interview'); }}
                className="rounded-lg border border-white/15 px-4 py-2.5 text-sm font-semibold text-slate-300 transition hover:bg-white/10"
                data-testid="review-back"
              >
                Answer a few more
              </button>
              <button
                type="button"
                onClick={() => { setSession(forgetSession(session)); setDecisions({}); setScreen('intro'); }}
                className="rounded-lg border border-white/15 px-4 py-2.5 text-sm font-semibold text-slate-300 transition hover:bg-white/10"
                data-testid="cancel-voice-dna"
              >
                Throw it away
              </button>
            </div>
          </>
        )}
      </div>
    );
  }

  // ── Done: the Instant DNA reveal ─────────────────────────────────────────
  return (
    <div className="space-y-5" data-testid="voice-dna">
      <header>
        <h1 className="text-2xl font-bold text-white">This is what I know about you</h1>
        <p className="mt-1 text-sm text-slate-300" data-testid="coverage-summary">
          {coverageSummary(profile)}
        </p>
      </header>

      <section className="card p-5" data-testid="dna-reveal">
        <ul className="space-y-3">
          {lines.map((l, i) => (
            <li key={i} data-testid={`reveal-${l.kind}`}>
              <p className={`text-sm font-semibold ${l.kind === 'mood' ? 'text-amber-200' : 'text-white'}`}>
                {l.text}
              </p>
              {l.quote && <p className="mt-0.5 text-xs italic text-slate-400">“{l.quote}”</p>}
            </li>
          ))}
        </ul>
      </section>

      {profile.exceptions.length > 0 && (
        <section className="card p-4" data-testid="exceptions-summary">
          <h2 className="text-sm font-semibold text-white">Your exceptions</h2>
          <p className="mt-1 text-xs text-slate-400">
            These are the reason I will not treat your rules as walls.
          </p>
          <ul className="mt-2 space-y-1">
            {profile.exceptions.map((e, i) => (
              <li key={i} className="text-sm text-slate-300">· {e.summary}</li>
            ))}
          </ul>
        </section>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <a
          href="/app"
          className="rounded-lg bg-brand-500 px-5 py-2.5 text-sm font-bold text-white transition hover:bg-brand-400"
          data-testid="see-picks"
        >
          See what changes
        </a>
        <button
          type="button"
          onClick={() => { setSession(undoApply(session)); setScreen('review'); }}
          className="rounded-lg border border-white/15 px-4 py-2.5 text-sm font-semibold text-slate-300 transition hover:bg-white/10"
          data-testid="undo-voice-dna"
        >
          Undo
        </button>
      </div>

      {applying && <p className="text-xs text-slate-400" role="status">Saving…</p>}
      {applyError && (
        <p className="text-sm text-red-200" role="alert" data-testid="apply-error">{applyError}</p>
      )}
      {written !== null && (
        <p className="text-xs text-slate-400" data-testid="apply-written">
          Saved. {written} signal{written === 1 ? '' : 's'} went into your DNA.
        </p>
      )}
      {!canPersist && (
        <p className="text-xs text-amber-200/80" data-testid="signed-out-note">
          You are not signed in, so this stayed in your browser and was not saved.
        </p>
      )}
    </div>
  );
}
