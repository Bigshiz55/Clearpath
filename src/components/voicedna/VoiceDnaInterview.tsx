'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  startSession, answerQuestion, skipQuestion, currentQuestion, sessionProgress, goBack, canGoBack,
  toReview, backToInterview, reviewSections, reviewItems, canApply, applyReview, undoApply,
  forgetSession, profileOf, replay, stillUnclear,
  type VoiceSession, type ReviewDecision,
} from '@/lib/voicedna/session';
import { reveal, coverageSummary } from '@/lib/voicedna/profile';
import { encodeChips, encodeTitles, type PickedTitle } from '@/lib/voicedna/answerCodec';
import { PROGRESS_LABELS, type InterviewMode } from '@/lib/voicedna/questions';
import type { AudioAvailability } from '@/lib/voicedna/audio';
import { TitlePicker } from './TitlePicker';

/**
 * VERD1CT VOICE DNA — the taste interview.
 *
 * Stages, one main question at a time, expanding as it goes: naming a title
 * earns a "why" follow-up with chips chosen for that title; picking a
 * deal-breaker earns a "how badly" follow-up; a contradiction interrupts to be
 * settled. All of that lives in the pure engine — this component renders the
 * question it is handed and posts the answer back.
 *
 * Two things are structural rather than stylistic:
 *  * The whole interview runs in the browser, which is why the privacy line on
 *    the first screen is true — nothing is sent while you answer.
 *  * The answer log IS the session, so Back is "replay without the last answer"
 *    and a refresh is "restore the log", with no separate undo path to get wrong.
 */

export interface VoiceDnaInterviewProps {
  audio: AudioAvailability;
  canPersist: boolean;
  onApply?: (session: VoiceSession) => Promise<{ ok: boolean; error?: string; written: number }>;
}

type Screen = 'intro' | 'interview' | 'review' | 'done';

const STORAGE_KEY = 'wv.voicedna.session.v2';

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

interface Saved {
  id: string;
  mode: InterviewMode;
  screen: Screen;
  answers: VoiceSession['answers'];
}

export function VoiceDnaInterview({ audio, canPersist, onApply }: VoiceDnaInterviewProps) {
  const [screen, setScreen] = useState<Screen>('intro');
  const [session, setSession] = useState<VoiceSession>(() => startSession(newId(), 'quick', Date.now()));
  const [text, setText] = useState('');
  const [chips, setChips] = useState<string[]>([]);
  const [titles, setTitles] = useState<PickedTitle[]>([]);
  const [decisions, setDecisions] = useState<Record<string, ReviewDecision>>({});
  const [applying, setApplying] = useState(false);
  const [applyError, setApplyError] = useState<string | null>(null);
  const [written, setWritten] = useState<number | null>(null);
  const [restored, setRestored] = useState(false);

  const ctx = useMemo(() => ({ now: Date.now() }), []);
  const question = useMemo(
    () => (screen === 'interview' ? currentQuestion(session, ctx) : null),
    [screen, session, ctx],
  );
  const profile = useMemo(() => profileOf(session, ctx), [session, ctx]);
  const prog = useMemo(() => sessionProgress(session, ctx), [session, ctx]);
  const sections = useMemo(() => reviewSections(session), [session]);
  const gate = useMemo(() => canApply(session, decisions), [session, decisions]);
  const lines = useMemo(() => reveal(profile, session.claims), [profile, session.claims]);
  const unclear = useMemo(() => stillUnclear(session, ctx), [session, ctx]);

  // Restore an interview in progress. The answer log is the whole session, so
  // this is a list of strings in and a fully rebuilt state out.
  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY);
      if (!raw) return;
      const saved = JSON.parse(raw) as Saved;
      if (!saved?.id || !Array.isArray(saved.answers) || saved.answers.length === 0) return;
      setSession(replay(saved.id, saved.mode === 'full' ? 'full' : 'quick', saved.answers, { now: Date.now() }));
      setScreen(saved.screen === 'review' ? 'review' : 'interview');
      setRestored(true);
    } catch {
      // A corrupt draft is not worth an error screen — start clean.
    }
  }, []);

  useEffect(() => {
    try {
      if (screen === 'intro' || session.answers.length === 0) return;
      if (screen === 'done') { window.localStorage.removeItem(STORAGE_KEY); return; }
      const saved: Saved = { id: session.id, mode: session.mode, screen, answers: session.answers };
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(saved));
    } catch {
      // Private-browsing or a full quota: the interview still works, unsaved.
    }
  }, [session, screen]);

  const clearInputs = useCallback(() => { setText(''); setChips([]); setTitles([]); }, []);

  const begin = useCallback((mode: InterviewMode) => {
    try { window.localStorage.removeItem(STORAGE_KEY); } catch { /* ignore */ }
    setSession(startSession(newId(), mode, Date.now()));
    setDecisions({});
    setWritten(null);
    setApplyError(null);
    setRestored(false);
    clearInputs();
    setScreen('interview');
  }, [clearInputs]);

  const advance = useCallback((next: VoiceSession) => {
    setSession(next);
    clearInputs();
    if (!currentQuestion(next, { now: Date.now() })) setScreen('review');
  }, [clearInputs]);

  const submit = useCallback(() => {
    if (!question) return;
    let value = '';
    if (question.kind === 'titles') value = titles.length ? encodeTitles(titles, text.trim()) : text.trim();
    else if (question.kind === 'chips') value = encodeChips(chips);
    else value = text.trim();
    if (!value) { advance(skipQuestion(session, question.id, { now: Date.now() })); return; }
    advance(answerQuestion(session, question.id, value, { now: Date.now() }));
  }, [question, titles, chips, text, session, advance]);

  const choose = useCallback((value: string) => {
    if (!question) return;
    advance(answerQuestion(session, question.id, value, { now: Date.now() }));
  }, [question, session, advance]);

  const back = useCallback(() => {
    setSession(goBack(session, { now: Date.now() }));
    clearInputs();
    setScreen('interview');
  }, [session, clearInputs]);

  const finish = useCallback(async () => {
    const applied = applyReview(session, decisions, Date.now());
    if (applied.stage !== 'applied') return;
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

  const canSubmit =
    question?.kind === 'titles' ? titles.length > 0 || text.trim().length > 0
    : question?.kind === 'chips' ? chips.length > 0 || text.trim().length > 0
    : text.trim().length > 0;

  // ── Intro ────────────────────────────────────────────────────────────────
  if (screen === 'intro') {
    return (
      <div className="space-y-6" data-testid="voice-dna">
        <header>
          <h1 className="text-2xl font-bold text-white sm:text-3xl">The Taste Interview</h1>
          <p className="mt-2 max-w-2xl text-sm text-slate-300">
            A proper conversation about what you love, what you avoid, and — the part that actually
            matters — <em>why</em>. I will ask about specific titles and dig into each one.
          </p>
        </header>

        <section className="rounded-xl border border-emerald-400/30 bg-emerald-500/[0.07] p-4" data-testid="privacy-note">
          <h2 className="text-sm font-bold text-emerald-100">Nothing is saved until you say so</h2>
          <ul className="mt-2 space-y-1 text-sm text-emerald-100/80">
            <li>· The interview runs in this browser. Your answers are not sent while you type.</li>
            <li>· You review every conclusion, next to your own words, before anything is kept.</li>
            <li>· You can delete the whole thing afterwards, and your DNA forgets it too.</li>
          </ul>
        </section>

        <section className="grid gap-3 sm:grid-cols-2">
          <button type="button" onClick={() => begin('quick')} className="card p-5 text-left transition hover:bg-white/10" data-testid="start-quick">
            <div className="text-lg font-semibold text-white">Quick — about 3 minutes</div>
            <p className="mt-1 text-sm text-slate-400">
              Your favourites, one thing that let you down, your genres and your deal-breakers.
            </p>
          </button>
          <button type="button" onClick={() => begin('full')} className="card p-5 text-left transition hover:bg-white/10" data-testid="start-full">
            <div className="text-lg font-semibold text-white">Full — about 8 minutes</div>
            <p className="mt-1 text-sm text-slate-400">
              Everything above plus what you abandoned, how you watch, and your exceptions.
            </p>
          </button>
        </section>

        <section className="card p-4">
          <h2 className="text-sm font-semibold text-white">What I will ask about</h2>
          <div className="mt-2 flex flex-wrap gap-1.5" data-testid="stage-preview">
            {PROGRESS_LABELS.map((label) => (
              <span key={label} className="rounded-full border border-white/15 bg-white/5 px-2.5 py-1 text-xs font-semibold text-slate-300">
                {label}
              </span>
            ))}
          </div>
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

        <p className="text-xs text-slate-500" data-testid="tonight-pointer">
          Just want something for tonight? That is a different thing —{' '}
          <a href="/app" className="font-semibold text-brand-300 underline underline-offset-2">
            tell me what you want right now
          </a>{' '}
          instead. This interview is about you in general.
        </p>

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
    return (
      <div className="space-y-4" data-testid="voice-dna">
        {restored && session.answers.length > 0 && (
          <p className="rounded-lg border border-brand-400/30 bg-brand-500/10 px-3 py-2 text-xs text-brand-100" data-testid="restored-note">
            Picked up where you left off — {session.answers.length} answer{session.answers.length === 1 ? '' : 's'} still here.
          </p>
        )}

        <nav aria-label="Interview stages" className="wv-vd-stages" data-testid="stage-rail">
          {PROGRESS_LABELS.map((label, i) => (
            <span
              key={label}
              aria-current={label === prog.stageLabel ? 'step' : undefined}
              className={`wv-vd-stage ${
                i < prog.stageIndex ? 'wv-vd-stage--done'
                : label === prog.stageLabel ? 'wv-vd-stage--now'
                : ''
              }`}
              data-testid={label === prog.stageLabel ? 'stage-current' : 'stage-other'}
            >
              {label}
            </span>
          ))}
        </nav>

        <div className="flex items-center justify-between gap-3">
          <div className="text-xs font-semibold uppercase tracking-wide text-slate-400" data-testid="progress">
            {prog.stageLabel} · {Math.min(prog.asked + 1, prog.total)} of {prog.total}
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

        <section className="card p-5" data-testid="question-card">
          {question.isFollowUp && (
            <div className="mb-2 inline-block rounded-full bg-amber-400/15 px-2 py-0.5 text-[11px] font-bold uppercase tracking-wide text-amber-200" data-testid="followup-badge">
              Following up
            </div>
          )}
          <h1 className="wv-vd-prompt text-xl font-semibold text-white" data-testid="question-prompt">
            {question.prompt}
          </h1>
          {question.helper && <p className="mt-1 text-sm text-slate-400" data-testid="question-helper">{question.helper}</p>}

          {question.kind === 'choice' && (
            <div className="mt-4 grid gap-2" data-testid="choice-group">
              {question.options?.map((o) => (
                <button
                  key={o.value}
                  type="button"
                  onClick={() => choose(o.value)}
                  className="rounded-xl border border-white/15 bg-white/5 px-4 py-3 text-left transition hover:border-brand-400/60 hover:bg-white/10"
                  data-testid={`choice-${o.value}`}
                >
                  <span className="block text-sm font-semibold text-white">{o.label}</span>
                  {o.hint && <span className="mt-0.5 block text-xs text-slate-400">{o.hint}</span>}
                </button>
              ))}
            </div>
          )}

          {question.kind === 'chips' && (
            <div className="wv-vd-chips mt-4" role="group" aria-label={question.prompt} data-testid="chip-group">
              {question.options?.map((o) => {
                const on = chips.includes(o.value);
                return (
                  <button
                    key={o.value}
                    type="button"
                    aria-pressed={on}
                    onClick={() => setChips((s) => (on ? s.filter((v) => v !== o.value) : [...s, o.value]))}
                    className={`rounded-full border px-3 py-2 text-sm font-semibold transition ${
                      on ? 'border-brand-400 bg-brand-500/20 text-white' : 'border-white/15 bg-white/5 text-slate-300 hover:bg-white/10'
                    }`}
                    data-testid={`chip-${o.value}`}
                  >
                    {o.label}
                  </button>
                );
              })}
            </div>
          )}

          {question.kind === 'titles' && (
            <TitlePicker
              max={question.maxTitles ?? 1}
              picked={titles}
              onChange={setTitles}
              {...(question.placeholder ? { placeholder: question.placeholder } : {})}
            />
          )}

          {(question.kind === 'open' || question.allowFreeText) && (
            <>
              <label className="sr-only" htmlFor="voice-answer">
                {question.kind === 'open' ? question.prompt : 'Anything else, in your own words'}
              </label>
              <textarea
                id="voice-answer"
                value={text}
                onChange={(e) => setText(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) submit(); }}
                rows={question.kind === 'open' ? 4 : 2}
                maxLength={2000}
                placeholder={question.kind === 'open' ? question.placeholder : 'Anything else, in your own words'}
                className="mt-3 w-full resize-y rounded-xl border border-white/15 bg-black/30 p-3 text-sm text-white placeholder:text-slate-500 focus:border-brand-400/60 focus:outline-none"
                data-testid="answer-input"
              />
            </>
          )}

          {question.kind !== 'choice' && (
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={submit}
                disabled={!canSubmit}
                className="rounded-lg bg-brand-500 px-4 py-2 text-sm font-bold text-white transition hover:bg-brand-400 disabled:cursor-not-allowed disabled:opacity-40"
                data-testid="answer-submit"
              >
                Next
              </button>
              <button
                type="button"
                onClick={() => advance(skipQuestion(session, question.id, { now: Date.now() }))}
                className="rounded-lg border border-white/15 px-4 py-2 text-sm font-semibold text-slate-300 transition hover:bg-white/10"
                data-testid="answer-skip"
              >
                Skip
              </button>
              <span className="text-xs text-slate-500">Skipping costs nothing.</span>
            </div>
          )}

          <div className="mt-3">
            <button
              type="button"
              onClick={back}
              disabled={!canGoBack(session)}
              className="text-xs font-semibold text-slate-400 underline underline-offset-2 hover:text-white disabled:cursor-not-allowed disabled:opacity-40 disabled:no-underline"
              data-testid="answer-back"
            >
              ← Back
            </button>
          </div>
        </section>

        {lines.length > 0 && (
          <section className="card p-4" data-testid="live-reveal">
            <h2 className="text-sm font-semibold text-white">What I have so far</h2>
            <ul className="mt-2 space-y-1.5">
              {lines.slice(0, 4).map((l, i) => (
                <li key={i} className={`text-sm ${l.kind === 'mood' ? 'text-amber-200' : 'text-slate-300'}`}>{l.text}</li>
              ))}
            </ul>
          </section>
        )}
      </div>
    );
  }

  // ── Review ───────────────────────────────────────────────────────────────
  if (screen === 'review' || (screen === 'interview' && !question)) {
    const items = reviewItems(session);
    return (
      <div className="space-y-5" data-testid="voice-dna">
        <header>
          <h1 className="text-2xl font-bold text-white">What we learned about you</h1>
          <p className="mt-1 max-w-2xl text-sm text-slate-300">
            Every line is something I concluded, shown next to the words that produced it. Nothing is
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
              <p className="rounded-lg border border-amber-400/40 bg-amber-500/10 px-3 py-2 text-sm text-amber-100" role="alert" data-testid="review-blocked">
                I guessed at {gate.blockedBy.length} title{gate.blockedBy.length === 1 ? '' : 's'}.
                Tell me whether I got {gate.blockedBy.length === 1 ? 'it' : 'them'} right before we go on.
              </p>
            )}

            {sections.map((section) => (
              <section key={section.name} data-testid="review-section">
                <h2 className="text-sm font-bold uppercase tracking-wide text-slate-400" data-testid="review-section-name">
                  {section.name}
                </h2>
                <ul className="mt-2 space-y-3">
                  {section.items.map((item) => (
                    <li key={item.claimId} className="card p-4" data-testid="review-item">
                      <p className="text-sm font-semibold text-white" data-testid="review-statement">{item.statement}</p>
                      <p className="mt-1 text-xs italic text-slate-400" data-testid="review-quote">“{item.quote}”</p>
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
                                active ? 'border-brand-400 bg-brand-500/20 text-white' : 'border-white/15 bg-white/5 text-slate-300 hover:bg-white/10'
                              }`}
                              data-testid={`decide-${d.value}`}
                            >
                              {d.label}
                            </button>
                          );
                        })}
                      </div>
                      {item.kind === 'rule' && !item.hardExclusion && (
                        <button
                          type="button"
                          onClick={() => setDecisions((s) => ({ ...s, [item.claimId]: 'hard' }))}
                          aria-pressed={decisions[item.claimId] === 'hard'}
                          className={`mt-2 text-xs font-semibold underline underline-offset-2 ${
                            decisions[item.claimId] === 'hard' ? 'text-red-300' : 'text-slate-500 hover:text-red-300'
                          }`}
                          data-testid="decide-hard"
                        >
                          Make this a never-recommend
                        </button>
                      )}
                    </li>
                  ))}
                </ul>
              </section>
            ))}

            {unclear.length > 0 && (
              <section className="card p-4" data-testid="still-unclear">
                <h2 className="text-sm font-bold uppercase tracking-wide text-slate-400">Areas still unclear</h2>
                <p className="mt-1 text-xs text-slate-400">
                  I have nothing on these yet, so I will not pretend to: {unclear.join(', ')}.
                </p>
                <button
                  type="button"
                  onClick={() => { setSession(backToInterview(session)); setScreen('interview'); }}
                  className="mt-2 text-xs font-semibold text-brand-300 underline underline-offset-2"
                  data-testid="answer-more"
                >
                  Answer a few more
                </button>
              </section>
            )}

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
                onClick={() => {
                  try { window.localStorage.removeItem(STORAGE_KEY); } catch { /* ignore */ }
                  setSession(forgetSession(session)); setDecisions({}); setScreen('intro');
                }}
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
        <p className="mt-1 text-sm text-slate-300" data-testid="coverage-summary">{coverageSummary(profile)}</p>
      </header>

      <section className="card p-5" data-testid="dna-reveal">
        <ul className="space-y-3">
          {lines.map((l, i) => (
            <li key={i} data-testid={`reveal-${l.kind}`}>
              <p className={`text-sm font-semibold ${l.kind === 'mood' ? 'text-amber-200' : 'text-white'}`}>{l.text}</p>
              {l.quote && <p className="mt-0.5 text-xs italic text-slate-400">“{l.quote}”</p>}
            </li>
          ))}
        </ul>
      </section>

      {profile.exceptions.length > 0 && (
        <section className="card p-4" data-testid="exceptions-summary">
          <h2 className="text-sm font-semibold text-white">Your exceptions</h2>
          <p className="mt-1 text-xs text-slate-400">These are why I will not treat your rules as walls.</p>
          <ul className="mt-2 space-y-1">
            {profile.exceptions.map((e, i) => <li key={i} className="text-sm text-slate-300">· {e.summary}</li>)}
          </ul>
        </section>
      )}

      <section className="card p-4" data-testid="next-step">
        <h2 className="text-sm font-semibold text-white">What happens to the title quiz</h2>
        <p className="mt-1 text-sm text-slate-400">
          You do not need the full twenty-title run now. The quiz will only show titles that test
          what this interview left uncertain
          {unclear.length > 0 ? `: ${unclear.slice(0, 4).join(', ')}.` : '.'}
        </p>
        <a href="/app/quiz" className="mt-3 inline-flex rounded-lg border border-white/15 px-4 py-2 text-sm font-semibold text-slate-200 transition hover:bg-white/10" data-testid="targeted-quiz">
          Check it against a few titles →
        </a>
      </section>

      <div className="flex flex-wrap items-center gap-2">
        <a href="/app" className="rounded-lg bg-brand-500 px-5 py-2.5 text-sm font-bold text-white transition hover:bg-brand-400" data-testid="see-picks">
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
      {applyError && <p className="text-sm text-red-200" role="alert" data-testid="apply-error">{applyError}</p>}
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
