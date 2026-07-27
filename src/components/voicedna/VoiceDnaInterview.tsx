'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  startSession, answerQuestion, skipQuestion, currentQuestion, sessionProgress, goBack, canGoBack,
  goDeeper, toReview, backToInterview, reviewSections, discussedTitles, canApply, applyReview,
  undoApply, forgetSession, profileOf, replay, stillUnclear, unconfirmedTitles,
  DECISION_OPTIONS, type VoiceSession, type ReviewDecision,
} from '@/lib/voicedna/session';
import { reveal, coverageSummary } from '@/lib/voicedna/profile';
import { encodeChips, encodeTitles, type PickedTitle } from '@/lib/voicedna/answerCodec';
import { MAIN_MAX } from '@/lib/voicedna/steps';
import { buildProbe, CARD_REACTIONS, cardFollowUp, type CardReaction } from '@/lib/voicedna/probe';
import type { AudioAvailability } from '@/lib/voicedna/audio';
import { TitlePicker } from './TitlePicker';

/**
 * WITNESS TESTIMONY.
 *
 * Ten questions, one at a time, with follow-ups that expand inside them. The
 * counter never lies: a follow-up keeps its parent's number, because "question
 * fourteen of twenty" is how an interview turns back into a form.
 *
 * Two things here are structural rather than decorative:
 *  * The whole interview runs in the browser, which is why the privacy line on
 *    the first screen is true — nothing is sent while you answer.
 *  * The answer log IS the session, so Back is "replay without the last
 *    answer" and a refresh is "restore the log".
 */

export interface VoiceDnaInterviewProps {
  audio: AudioAvailability;
  canPersist: boolean;
  onApply?: (session: VoiceSession) => Promise<{ ok: boolean; error?: string; written: number }>;
}

type Screen = 'intro' | 'interview' | 'review' | 'done';

const STORAGE_KEY = 'wv.witness.session.v3';

interface ProbeTitle {
  titleId: string;
  text: string;
  year: number | null;
  mediaType: string;
  posterUrl: string | null;
}

function newId(): string {
  const c = globalThis.crypto;
  if (c && 'randomUUID' in c) return c.randomUUID();
  const hex = '0123456789abcdef';
  let s = '';
  for (let i = 0; i < 36; i++) {
    s += i === 8 || i === 13 || i === 18 || i === 23 ? '-' : i === 14 ? '4' : hex[Math.floor(Math.random() * 16)];
  }
  return s;
}

interface Saved { id: string; screen: Screen; answers: VoiceSession['answers']; extraDepth: number }

export function VoiceDnaInterview({ audio, canPersist, onApply }: VoiceDnaInterviewProps) {
  const [screen, setScreen] = useState<Screen>('intro');
  const [session, setSession] = useState<VoiceSession>(() => startSession(newId(), Date.now()));
  const [text, setText] = useState('');
  const [chips, setChips] = useState<string[]>([]);
  const [titles, setTitles] = useState<PickedTitle[]>([]);
  const [decisions, setDecisions] = useState<Record<string, ReviewDecision>>({});
  const [applying, setApplying] = useState(false);
  const [applyError, setApplyError] = useState<string | null>(null);
  const [written, setWritten] = useState<number | null>(null);
  const [restored, setRestored] = useState(false);
  const [probe, setProbe] = useState<ProbeTitle | null>(null);
  const [probeState, setProbeState] = useState<'idle' | 'loading' | 'ready' | 'none'>('idle');
  const [cardReaction, setCardReaction] = useState<CardReaction | null>(null);

  const ctx = useMemo(() => ({ now: Date.now() }), []);
  const question = useMemo(
    () => (screen === 'interview' ? currentQuestion(session, ctx) : null),
    [screen, session, ctx],
  );
  const profile = useMemo(() => profileOf(session, ctx), [session, ctx]);
  const prog = useMemo(() => sessionProgress(session, ctx), [session, ctx]);
  const sections = useMemo(() => reviewSections(session), [session]);
  const titleStrip = useMemo(() => discussedTitles(session), [session]);
  const gate = useMemo(() => canApply(session, decisions, ctx), [session, decisions, ctx]);
  const lines = useMemo(() => reveal(profile, session.claims), [profile, session.claims]);
  const unclear = useMemo(() => stillUnclear(session, ctx), [session, ctx]);
  const unconfirmed = useMemo(() => unconfirmedTitles(session), [session]);
  const spec = useMemo(() => buildProbe(profile), [profile]);

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY);
      if (!raw) return;
      const saved = JSON.parse(raw) as Saved;
      if (!saved?.id || !Array.isArray(saved.answers) || saved.answers.length === 0) return;
      setSession(replay(saved.id, saved.answers, { now: Date.now() }, saved.extraDepth ?? 0));
      setScreen(saved.screen === 'review' ? 'review' : 'interview');
      setRestored(true);
    } catch { /* a corrupt draft is not worth an error screen */ }
  }, []);

  useEffect(() => {
    try {
      if (screen === 'intro' || session.answers.length === 0) return;
      if (screen === 'done') { window.localStorage.removeItem(STORAGE_KEY); return; }
      const saved: Saved = { id: session.id, screen, answers: session.answers, extraDepth: session.extraDepth };
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(saved));
    } catch { /* private browsing: the interview still works, unsaved */ }
  }, [session, screen]);

  // Fetch the card when we reach the movie check. If nothing comes back the
  // step is skipped — a poster with no reasoning behind it is worse than none.
  useEffect(() => {
    if (question?.kind !== 'card' || probeState !== 'idle') return;
    if (!spec.ready) { setProbeState('none'); return; }
    setProbeState('loading');
    const seen = session.claims.map((c) => c.title?.titleId).filter((x): x is string => Boolean(x));
    fetch('/api/voicedna/probe', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ genres: spec.genres, exclude: spec.excludeGenres, seen }),
    })
      .then((r) => r.json())
      .then((d: { available?: boolean; title?: ProbeTitle }) => {
        // 'ready', not 'idle' — going back to idle re-arms this effect and it
        // refetches forever.
        if (d.available && d.title) { setProbe(d.title); setProbeState('ready'); }
        else setProbeState('none');
      })
      .catch(() => setProbeState('none'));
  }, [question?.kind, probeState, spec, session.claims]);

  const clearInputs = useCallback(() => { setText(''); setChips([]); setTitles([]); setCardReaction(null); }, []);

  const begin = useCallback(() => {
    try { window.localStorage.removeItem(STORAGE_KEY); } catch { /* ignore */ }
    setSession(startSession(newId(), Date.now()));
    setDecisions({}); setWritten(null); setApplyError(null); setRestored(false);
    clearInputs(); setScreen('interview');
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
    advance(value ? answerQuestion(session, question.id, value, { now: Date.now() })
                  : skipQuestion(session, question.id, { now: Date.now() }));
  }, [question, titles, chips, text, session, advance]);

  const choose = useCallback((value: string) => {
    if (!question) return;
    advance(answerQuestion(session, question.id, value, { now: Date.now() }));
  }, [question, session, advance]);

  const answerCard = useCallback((reaction: CardReaction) => {
    if (!question || !probe) return;
    if (cardFollowUp(reaction) && !cardReaction) { setCardReaction(reaction); return; }
    const value = encodeTitles([{ titleId: probe.titleId, text: probe.text, year: probe.year }], reaction);
    advance(answerQuestion(session, question.id, value, { now: Date.now() }));
  }, [question, probe, cardReaction, session, advance]);

  // The card cannot be shown: record the skip so the interview moves on.
  useEffect(() => {
    if (question?.kind === 'card' && probeState === 'none') {
      advance(skipQuestion(session, question.id, { now: Date.now() }));
    }
  }, [question, probeState, session, advance]);

  const back = useCallback(() => {
    setSession(goBack(session, { now: Date.now() }));
    clearInputs(); setProbeState('idle'); setScreen('interview');
  }, [session, clearInputs]);

  const finish = useCallback(async () => {
    const applied = applyReview(session, decisions, Date.now(), { now: Date.now() });
    if (applied.stage !== 'applied') return;
    setSession(applied);
    setScreen('done');
    if (!onApply || !canPersist) return;
    setApplying(true); setApplyError(null);
    try {
      const res = await onApply(applied);
      if (!res.ok) setApplyError(res.error ?? 'Could not save that.');
      else setWritten(res.written);
    } catch {
      setApplyError('Could not reach the server. Nothing was saved.');
    } finally { setApplying(false); }
  }, [session, decisions, onApply, canPersist]);

  const canSubmit =
    question?.kind === 'titles' ? titles.length > 0 || text.trim().length > 0
    : question?.kind === 'chips' ? chips.length > 0 || text.trim().length > 0
    : text.trim().length > 0;

  // ── Intro ────────────────────────────────────────────────────────────────
  if (screen === 'intro') {
    return (
      <div className="space-y-5" data-testid="voice-dna">
        <header>
          <h1 className="wv-vd-h1 font-bold text-white">Witness Testimony</h1>
          <p className="mt-2 text-sm text-slate-300">
            Ten questions about what you love, what you avoid, and why. I will ask about specific
            titles, dig into each one, and test what I heard before anything is saved.
          </p>
        </header>

        <section className="rounded-xl border border-emerald-400/30 bg-emerald-500/[0.07] p-4" data-testid="privacy-note">
          <h2 className="text-sm font-bold text-emerald-100">Nothing is saved until you say so</h2>
          <ul className="mt-2 space-y-1 text-sm text-emerald-100/80">
            <li>· It runs in this browser. Your answers are not sent while you type.</li>
            <li>· You check everything before it becomes part of your Viewer DNA.</li>
            <li>· You can delete it afterwards, and your DNA forgets it too.</li>
          </ul>
        </section>

        <button type="button" onClick={begin} className="wv-vd-primary" data-testid="start-interview">
          Start — about 6 minutes
        </button>

        <section className="card p-4" data-testid="audio-status">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="min-w-0">
              <div className="text-sm font-semibold text-white">Answer out loud</div>
              <p className="mt-0.5 text-xs text-slate-400">{audio.message}</p>
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
          instead. This is about you in general.
        </p>

        {!canPersist && (
          <p className="text-xs text-amber-200/80" data-testid="signed-out-note">
            You are not signed in, so this will run but nothing can be saved at the end.
          </p>
        )}
      </div>
    );
  }

  // ── Interview ────────────────────────────────────────────────────────────
  if (screen === 'interview' && question) {
    const pct = Math.round(((prog.current - 1) / MAIN_MAX) * 100);
    return (
      <div className="space-y-4 pb-4" data-testid="voice-dna">
        {restored && session.answers.length > 0 && (
          <p className="rounded-lg border border-brand-400/30 bg-brand-500/10 px-3 py-2 text-xs text-brand-100" data-testid="restored-note">
            Picked up where you left off.
          </p>
        )}

        <div>
          <div className="flex items-center justify-between gap-3">
            <span className="text-xs font-bold uppercase tracking-wide text-slate-400" data-testid="progress">
              Question {prog.current} of {prog.total}
            </span>
            <span className="truncate text-xs text-slate-500" data-testid="progress-label">{prog.label}</span>
          </div>
          <div className="mt-1.5 h-1 w-full overflow-hidden rounded-full bg-white/10">
            <div className="h-full rounded-full bg-brand-400 transition-all" style={{ width: `${pct}%` }} />
          </div>
        </div>

        <section className="card p-4 sm:p-5" data-testid="question-card">
          {question.transition && (
            <p className="mb-1.5 text-sm font-semibold text-brand-300" data-testid="transition">{question.transition}</p>
          )}
          {question.isFollowUp && (
            <div className="mb-2 inline-block rounded-full bg-amber-400/15 px-2 py-0.5 text-[11px] font-bold uppercase tracking-wide text-amber-200" data-testid="followup-badge">
              Following up
            </div>
          )}
          <h1 className="wv-vd-prompt font-semibold text-white" data-testid="question-prompt">{question.prompt}</h1>
          {question.helper && <p className="mt-1 text-sm text-slate-400" data-testid="question-helper">{question.helper}</p>}

          {question.kind === 'choice' && (
            <div className="mt-4 grid gap-2" data-testid="choice-group">
              {question.options?.map((o) => (
                <button
                  key={o.value}
                  type="button"
                  onClick={() => choose(o.value)}
                  className="wv-vd-choice"
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
                    className={`wv-vd-chip ${on ? 'wv-vd-chip--on' : ''}`}
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

          {question.kind === 'card' && (
            <div className="mt-4" data-testid="movie-check">
              {probeState === 'loading' && <p className="text-sm text-slate-400" role="status">Finding one…</p>}
              {probe && (
                <>
                  <div className="wv-vd-probe">
                    {probe.posterUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={probe.posterUrl} alt="" className="wv-vd-probe-poster" data-testid="probe-poster" />
                    ) : (
                      <div className="wv-vd-probe-poster wv-vd-poster--blank" aria-hidden>🎬</div>
                    )}
                    <div className="min-w-0">
                      <p className="text-lg font-bold leading-tight text-white" data-testid="probe-title">{probe.text}</p>
                      <p className="text-xs text-slate-400">
                        {[probe.year ?? '', probe.mediaType === 'tv' ? 'Series' : 'Film'].filter(Boolean).join(' · ')}
                      </p>
                    </div>
                  </div>
                  <p className="mt-3 text-sm text-slate-300" data-testid="probe-reason">{spec.rationale}</p>

                  {cardReaction ? (
                    <div className="mt-4" data-testid="card-followup">
                      <p className="text-sm font-semibold text-white">{cardFollowUp(cardReaction)}</p>
                      <textarea
                        value={text}
                        onChange={(e) => setText(e.target.value)}
                        rows={2}
                        maxLength={500}
                        className="mt-2 w-full resize-y rounded-xl border border-white/15 bg-black/30 p-3 text-sm text-white placeholder:text-slate-500 focus:border-brand-400/60 focus:outline-none"
                        placeholder="In your own words"
                        data-testid="answer-input"
                      />
                      <button type="button" onClick={() => answerCard(cardReaction)} className="wv-vd-primary mt-3" data-testid="card-continue">
                        Continue
                      </button>
                    </div>
                  ) : (
                    <div className="mt-4 grid gap-2" data-testid="card-reactions">
                      {CARD_REACTIONS.map((r) => (
                        <button
                          key={r.value}
                          type="button"
                          onClick={() => answerCard(r.value)}
                          className="wv-vd-choice"
                          data-testid={`card-${r.value}`}
                        >
                          <span className="text-sm font-semibold text-white">{r.label}</span>
                        </button>
                      ))}
                    </div>
                  )}
                </>
              )}
            </div>
          )}

          {(question.kind === 'open' || (question.allowFreeText && question.kind !== 'card')) && (
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

          {question.kind !== 'choice' && question.kind !== 'card' && (
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <button type="button" onClick={submit} disabled={!canSubmit} className="wv-vd-primary wv-vd-primary--inline" data-testid="answer-submit">
                Next
              </button>
              <button
                type="button"
                onClick={() => advance(skipQuestion(session, question.id, { now: Date.now() }))}
                className="wv-vd-secondary"
                data-testid="answer-skip"
              >
                Skip
              </button>
            </div>
          )}

          <div className="mt-3 flex items-center justify-between gap-2">
            <button
              type="button"
              onClick={back}
              disabled={!canGoBack(session)}
              className="wv-vd-textaction disabled:cursor-not-allowed disabled:opacity-40 disabled:no-underline"
              data-testid="answer-back"
            >
              ← Back
            </button>
            <button
              type="button"
              onClick={() => setScreen('review')}
              className="wv-vd-textaction"
              data-testid="finish-early"
            >
              Finish now
            </button>
          </div>
        </section>

        {prog.readyToFinish && (
          <section className="card p-4" data-testid="ready-to-finish">
            <p className="text-sm text-slate-300">
              I have enough for a strong starting profile. We can stop here or keep going.
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              <button type="button" onClick={() => setScreen('review')} className="wv-vd-primary wv-vd-primary--inline" data-testid="build-now">
                Build my DNA
              </button>
              <button type="button" onClick={() => setSession(goDeeper(session))} className="wv-vd-secondary" data-testid="go-deeper">
                Ask me more
              </button>
            </div>
          </section>
        )}

        {lines.length > 0 && (
          <section className="card p-4" data-testid="live-reveal">
            <h2 className="text-xs font-bold uppercase tracking-wide text-slate-400">What I have so far</h2>
            <ul className="mt-2 space-y-1">
              {lines.slice(0, 3).map((l, i) => (
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
    const hasAnything = sections.length > 0;
    return (
      <div className="space-y-4 pb-28" data-testid="voice-dna">
        <header>
          <h1 className="wv-vd-h1 font-bold text-white">Here’s what I heard</h1>
          <p className="mt-1 text-sm text-slate-300">
            Check the important parts before they become part of your Viewer DNA.
          </p>
        </header>

        {!hasAnything ? (
          <section className="card p-5 text-center" data-testid="review-empty">
            <p className="text-sm text-slate-300">
              I did not get enough to work with, and nothing has been saved. Answer a couple of
              questions and I will try again.
            </p>
            <button
              type="button"
              onClick={() => { setSession(backToInterview(session)); setScreen('interview'); }}
              className="wv-vd-primary mt-4"
              data-testid="review-back"
            >
              Back to the questions
            </button>
          </section>
        ) : (
          <>
            {/* The count and the titles are rendered together, always. Claiming
                a number without showing what it refers to is the defect this
                replaces. */}
            {unconfirmed.length > 0 && (
              <section className="rounded-xl border border-amber-400/40 bg-amber-500/10 p-3" data-testid="review-blocked" role="alert">
                <p className="text-sm font-semibold text-amber-100">
                  {unconfirmed.length === 1
                    ? 'One title I am not sure I got right:'
                    : `${unconfirmed.length} titles I am not sure I got right:`}
                </p>
                <ul className="mt-2 space-y-2" data-testid="unconfirmed-list">
                  {unconfirmed.map((i) => (
                    <li key={i.claimId} className="rounded-lg bg-black/20 p-2" data-testid="unconfirmed-title">
                      <p className="text-sm font-bold text-white">{i.title?.text}</p>
                      <div className="mt-1.5 flex flex-wrap gap-1.5">
                        {DECISION_OPTIONS.title.map((o) => (
                          <button
                            key={o.value}
                            type="button"
                            aria-pressed={decisions[i.claimId] === o.value}
                            onClick={() => setDecisions((s) => ({ ...s, [i.claimId]: o.value }))}
                            className={`wv-vd-decide ${decisions[i.claimId] === o.value ? 'wv-vd-decide--on' : ''}`}
                            data-testid={`decide-${o.value}`}
                          >
                            {o.label}
                          </button>
                        ))}
                      </div>
                    </li>
                  ))}
                </ul>
              </section>
            )}

            {titleStrip.length > 0 && (
              <section data-testid="titles-discussed">
                <h2 className="wv-vd-section">Titles discussed</h2>
                <ul className="mt-2 space-y-2">
                  {titleStrip.map((i) => (
                    <li key={i.claimId} className="wv-vd-titlecard" data-testid="title-row">
                      <div className="wv-vd-poster wv-vd-poster--blank" aria-hidden>🎬</div>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-bold text-white">{i.title?.text}</p>
                        <p className="text-xs text-slate-400" data-testid="title-reaction">
                          {i.statement.replace(/^You /, '').replace(/\.$/, '')}
                          {i.reason ? ` · ${i.reason}` : ''}
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={() => setDecisions((s) => ({ ...s, [i.claimId]: 'remove' }))}
                        aria-pressed={decisions[i.claimId] === 'remove'}
                        className={`wv-vd-decide shrink-0 ${decisions[i.claimId] === 'remove' ? 'wv-vd-decide--on' : ''}`}
                        data-testid="title-remove"
                      >
                        Remove
                      </button>
                    </li>
                  ))}
                </ul>
              </section>
            )}

            {sections.filter((s) => s.name !== 'Titles discussed').map((section) => (
              <section key={section.name} data-testid="review-section">
                <h2 className="wv-vd-section" data-testid="review-section-name">{section.name}</h2>
                <ul className="mt-2 space-y-2">
                  {section.items.map((item) => (
                    <li key={item.claimId} className="card p-3" data-testid="review-item">
                      <p className="text-sm font-semibold text-white" data-testid="review-statement">{item.statement}</p>
                      {item.quote && <p className="mt-0.5 text-xs italic text-slate-500" data-testid="review-quote">“{item.quote}”</p>}
                      <div className="mt-2 flex flex-wrap gap-1.5" role="group" aria-label={item.statement}>
                        {DECISION_OPTIONS[item.decisionKind].map((o) => (
                          <button
                            key={o.value}
                            type="button"
                            aria-pressed={(decisions[item.claimId] ?? 'confirm') === o.value}
                            onClick={() => setDecisions((s) => ({ ...s, [item.claimId]: o.value }))}
                            className={`wv-vd-decide ${(decisions[item.claimId] ?? 'confirm') === o.value ? 'wv-vd-decide--on' : ''}`}
                            data-testid={`decide-${o.value}`}
                          >
                            {o.label}
                          </button>
                        ))}
                      </div>
                    </li>
                  ))}
                </ul>
              </section>
            ))}

            {unclear.length > 0 && (
              <section className="card p-3" data-testid="still-unclear">
                <h2 className="wv-vd-section">Still unclear</h2>
                <p className="mt-1 text-xs text-slate-400">I do not know these yet, so I will not assume.</p>
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {unclear.map((u) => (
                    <span key={u} className="wv-vd-chip" data-testid="unclear-chip">{u}</span>
                  ))}
                </div>
                <button
                  type="button"
                  onClick={() => { setSession(goDeeper(backToInterview(session))); setScreen('interview'); }}
                  className="mt-2 text-xs font-semibold text-brand-300 underline underline-offset-2"
                  data-testid="answer-more"
                >
                  Answer {unclear.length} quick question{unclear.length === 1 ? '' : 's'}
                </button>
              </section>
            )}

            <div className="wv-vd-actions" data-testid="review-actions">
              <button type="button" onClick={finish} disabled={!gate.ok} className="wv-vd-primary" data-testid="apply-voice-dna">
                Save my Viewer DNA
              </button>
              <div className="mt-2 flex items-center justify-between gap-2">
                <button
                  type="button"
                  onClick={() => { setSession(backToInterview(session)); setScreen('interview'); }}
                  className="wv-vd-secondary flex-1"
                  data-testid="review-back"
                >
                  Change something
                </button>
                <button
                  type="button"
                  onClick={() => {
                    try { window.localStorage.removeItem(STORAGE_KEY); } catch { /* ignore */ }
                    setSession(forgetSession(session)); setDecisions({}); setScreen('intro');
                  }}
                  className="wv-vd-textaction"
                  data-testid="cancel-voice-dna"
                >
                  Discard this interview
                </button>
              </div>
            </div>
          </>
        )}
      </div>
    );
  }

  // ── Done ─────────────────────────────────────────────────────────────────
  return (
    <div className="space-y-4" data-testid="voice-dna">
      <header>
        <h1 className="wv-vd-h1 font-bold text-white">This is what I know about you</h1>
        <p className="mt-1 text-sm text-slate-300" data-testid="coverage-summary">{coverageSummary(profile)}</p>
      </header>

      <section className="card p-4" data-testid="dna-reveal">
        <ul className="space-y-2.5">
          {lines.map((l, i) => (
            <li key={i} data-testid={`reveal-${l.kind}`}>
              <p className={`text-sm font-semibold ${l.kind === 'mood' ? 'text-amber-200' : 'text-white'}`}>{l.text}</p>
            </li>
          ))}
        </ul>
      </section>

      {profile.exceptions.length > 0 && (
        <section className="card p-4" data-testid="exceptions-summary">
          <h2 className="wv-vd-section">Your exceptions</h2>
          <ul className="mt-2 space-y-1">
            {profile.exceptions.map((e, i) => <li key={i} className="text-sm text-slate-300">· {e.summary}</li>)}
          </ul>
        </section>
      )}

      <section className="card p-4" data-testid="next-step">
        <h2 className="wv-vd-section">What happens next</h2>
        <p className="mt-1 text-sm text-slate-400">
          You do not need the full title quiz now — it will only show titles that test what this
          interview left uncertain{unclear.length > 0 ? `: ${unclear.join(', ').toLowerCase()}.` : '.'}
        </p>
        <a href="/app/quiz" className="wv-vd-secondary mt-3 inline-flex" data-testid="targeted-quiz">
          Check it against a few titles →
        </a>
      </section>

      <div className="flex flex-wrap items-center gap-2">
        <a href="/app" className="wv-vd-primary wv-vd-primary--inline" data-testid="see-picks">See what changes</a>
        <button
          type="button"
          onClick={() => { setSession(undoApply(session)); setScreen('review'); }}
          className="wv-vd-secondary"
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
