'use client';

/**
 * THE QUICK TASTE QUIZ.
 *
 * A familiar preference quiz, not a conversation. The interaction rules that
 * make it feel like one thing rather than a form:
 *
 *  • DESKTOP IS A LIST, MOBILE IS A CARD. On a laptop you can see six to ten
 *    statements at once and answer them at speed; on a phone you get one at a
 *    time, because a dense list on a 360px screen is unusable. Same state, one
 *    breakpoint.
 *  • "DEPENDS" NEVER BLOCKS. Picking it records the answer immediately and
 *    opens a row of chips underneath. No modal, no follow-up screen, no
 *    interview. Skipping the chips leaves a conditional answer, which is honest.
 *  • THE LOG IS THE SESSION. Answers are append-only; Back drops the last one
 *    and the derived state is rebuilt from scratch, so undo genuinely reverses.
 *    The log is mirrored to localStorage, so a refresh does not cost the quiz.
 *  • THE PANEL IS LIVE AND HONEST. Coverage and confidence are two different
 *    numbers, and the label takes the lower of them.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import {
  RESPONSE_ORDER,
  RESPONSE_VALUES,
  SECTIONS,
  answersToClaims,
  dnaState,
  missingSections,
  selectQuestions,
  type QuizAnswer,
  type QuizQuestion,
  type ResponseKey,
} from '@/lib/taste/quickQuiz';
import { buildProfile, reveal } from '@/lib/taste/profile';
import { saveTasteQuiz } from '@/lib/actions/tasteQuiz';

const STORAGE_KEY = 'wv.taste-quiz.v1';

/** The four answers, in keyboard order, with the tone each one should carry. */
const RESPONSE_STYLE: Record<ResponseKey, string> = {
  exactly: 'border-emerald-400/50 bg-emerald-500/15 text-emerald-100',
  mostly: 'border-brand-400/50 bg-brand-500/15 text-brand-100',
  depends: 'border-amber-400/50 bg-amber-500/15 text-amber-100',
  not_me: 'border-rose-400/50 bg-rose-500/15 text-rose-100',
};

interface Props {
  /** Question ids already answered in earlier sessions — never re-asked. */
  asked?: string[];
  /** Attribute key → evidence already held, so covered ground is skipped. */
  known?: Record<string, number>;
  /** True when the viewer is signed in and the result can actually be saved. */
  canSave?: boolean;
}

type Phase = 'quiz' | 'reveal';

export function QuickTasteQuiz({ asked = [], known = {}, canSave = true }: Props) {
  // Chosen ONCE. Re-deriving this per render would reshuffle the quiz under the
  // user's hands, and — because the caller's defaults are fresh objects each
  // render — would also re-run the restore effect below and quietly undo Back.
  const [questions] = useState(() => selectQuestions({ asked, known }));

  const [answers, setAnswers] = useState<QuizAnswer[]>([]);
  const [current, setCurrent] = useState(0);
  const [openChips, setOpenChips] = useState<string | null>(null);
  const [phase, setPhase] = useState<Phase>('quiz');
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState<{ ok: boolean; message: string } | null>(null);
  const restored = useRef(false);

  // ── Restore / persist ─────────────────────────────────────────────────────
  useEffect(() => {
    if (restored.current) return;
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as QuizAnswer[];
        if (Array.isArray(parsed) && parsed.length > 0) {
          const valid = parsed.filter((a) => questions.some((q) => q.id === a.questionId));
          setAnswers(valid);
          setCurrent(Math.min(questions.length - 1, latestIndex(questions, valid) + 1));
        }
      }
    } catch {
      /* a corrupt cache is not worth a crash — start clean */
    }
    restored.current = true;
  }, [questions]);

  useEffect(() => {
    if (!restored.current) return;
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(answers));
    } catch {
      /* private mode — the quiz still works, it just will not survive a refresh */
    }
  }, [answers]);

  // ── Derived state, always rebuilt from the log ────────────────────────────
  const latest = useMemo(() => {
    const m = new Map<string, QuizAnswer>();
    for (const a of answers) m.set(a.questionId, a);
    return m;
  }, [answers]);

  const claims = useMemo(() => answersToClaims(answers), [answers]);
  const profile = useMemo(() => buildProfile({ claims, now: Date.now() }), [claims]);
  const state = useMemo(() => dnaState(answers), [answers]);
  const answeredCount = latest.size;

  // ── Answering ─────────────────────────────────────────────────────────────
  const record = useCallback(
    (questionId: string, response: ResponseKey, chips?: string[]) => {
      setAnswers((prev) => [...prev, { questionId, response, at: Date.now(), ...(chips ? { chips } : {}) }]);
    },
    [],
  );

  const answer = useCallback(
    (q: QuizQuestion, response: ResponseKey) => {
      record(q.id, response);
      const index = questions.findIndex((x) => x.id === q.id);
      // "Depends" opens its chips in place and keeps you on the row; every
      // other answer moves on. Neither ever blocks.
      if (response === 'depends' && (q.chips?.length ?? 0) > 0) {
        setOpenChips(q.id);
      } else {
        setOpenChips(null);
        setCurrent(Math.min(questions.length, index + 1));
      }
    },
    [questions, record],
  );

  const toggleChip = useCallback(
    (q: QuizQuestion, chipId: string) => {
      const existing = latest.get(q.id);
      const have = new Set(existing?.chips ?? []);
      if (have.has(chipId)) have.delete(chipId);
      else have.add(chipId);
      record(q.id, 'depends', Array.from(have));
    },
    [latest, record],
  );

  const back = useCallback(() => {
    setAnswers((prev) => prev.slice(0, -1));
    setOpenChips(null);
    setCurrent((i) => Math.max(0, i - 1));
  }, []);

  const skip = useCallback(() => {
    setOpenChips(null);
    setCurrent((i) => Math.min(questions.length, i + 1));
  }, [questions.length]);

  const jumpTo = useCallback(
    (questionId: string) => {
      const index = questions.findIndex((q) => q.id === questionId);
      if (index < 0) return;
      setPhase('quiz');
      setCurrent(index);
      setOpenChips(null);
      requestAnimationFrame(() => {
        document.getElementById(`qtq-${questionId}`)?.scrollIntoView({ block: 'center' });
      });
    },
    [questions],
  );

  // ── Keyboard: 1–4 answer the current row ──────────────────────────────────
  useEffect(() => {
    if (phase !== 'quiz') return;
    function onKey(e: KeyboardEvent) {
      const target = e.target as HTMLElement | null;
      if (target && /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName)) return;
      const n = Number(e.key);
      if (!Number.isInteger(n) || n < 1 || n > RESPONSE_ORDER.length) return;
      const q = questions[current];
      if (!q) return;
      const response = RESPONSE_ORDER[n - 1];
      if (!response) return;
      e.preventDefault();
      answer(q, response);
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [answer, current, phase, questions]);

  // ── Saving ────────────────────────────────────────────────────────────────
  const finish = useCallback(async () => {
    setPhase('reveal');
    if (!canSave || answers.length === 0) return;
    setSaving(true);
    const res = await saveTasteQuiz({ answers });
    setSaving(false);
    setSaved(
      res.ok
        ? {
            ok: true,
            message: res.provenanceStored
              ? 'Saved to your Watch DNA.'
              : 'Saved to your Watch DNA. The per-answer record needs migration 0034 before it is kept.',
          }
        : { ok: false, message: res.error ?? 'Could not save that.' },
    );
  }, [answers, canSave]);

  const done = current >= questions.length;
  const lines = useMemo(() => reveal(profile, claims, 10), [profile, claims]);

  if (phase === 'reveal') {
    return (
      <Reveal
        lines={lines}
        state={state}
        questions={questions}
        answers={answers}
        saving={saving}
        saved={saved}
        canSave={canSave}
        onCorrect={jumpTo}
        onResume={() => setPhase('quiz')}
      />
    );
  }

  return (
    <div data-testid="taste-quiz" className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_18rem]">
      <div className="min-w-0">
        <header>
          <h1 className="text-2xl font-bold text-white sm:text-3xl">Quick Taste Quiz</h1>
          <p className="mt-1 text-sm text-slate-400">
            {questions.length} statements. Say how much each one sounds like you — there is no wrong answer, and
            &ldquo;Depends&rdquo; is a real one.
          </p>
        </header>

        <Progress answered={answeredCount} total={questions.length} />

        {/* Desktop: the whole list, so you can see where you are and how far is
            left. Mobile: only the current card. */}
        <ol className="mt-4 space-y-2" data-testid="quiz-rows">
          {questions.map((q, i) => {
            const a = latest.get(q.id);
            const isCurrent = i === current;
            return (
              <li
                key={q.id}
                id={`qtq-${q.id}`}
                data-testid={`quiz-row-${q.id}`}
                data-current={isCurrent ? 'true' : 'false'}
                data-answered={a ? 'true' : 'false'}
                className={[
                  isCurrent ? 'block' : 'hidden sm:block',
                  'rounded-xl border p-3 transition sm:p-3.5',
                  isCurrent ? 'border-brand-400/60 bg-white/[0.07]' : 'border-white/10 bg-white/[0.03]',
                ].join(' ')}
              >
                <Row
                  q={q}
                  index={i}
                  answered={a}
                  isCurrent={isCurrent}
                  chipsOpen={openChips === q.id}
                  onAnswer={(r) => answer(q, r)}
                  onToggleChip={(chipId) => toggleChip(q, chipId)}
                  onCloseChips={() => {
                    setOpenChips(null);
                    setCurrent(Math.min(questions.length, i + 1));
                  }}
                  onFocusRow={() => setCurrent(i)}
                />
              </li>
            );
          })}
        </ol>

        <div className="mt-5 flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={back}
            disabled={answers.length === 0}
            data-testid="quiz-back"
            className="inline-flex min-h-[44px] items-center rounded-lg border border-white/15 px-4 text-sm font-semibold text-slate-200 transition hover:bg-white/10 disabled:opacity-40"
          >
            ← Back
          </button>
          <button
            type="button"
            onClick={skip}
            disabled={done}
            data-testid="quiz-skip"
            className="inline-flex min-h-[44px] items-center rounded-lg border border-white/15 px-4 text-sm font-semibold text-slate-300 transition hover:bg-white/10 disabled:opacity-40"
          >
            Skip this one
          </button>
          <button
            type="button"
            onClick={finish}
            disabled={answeredCount === 0}
            data-testid="quiz-finish"
            className="btn-primary inline-flex min-h-[44px] items-center px-5 disabled:opacity-40"
          >
            {done ? 'See my Watch DNA' : `Finish with ${answeredCount}`}
          </button>
        </div>
        <p className="mt-2 text-xs text-slate-500">
          Keyboard: <kbd className="rounded bg-white/10 px-1">1</kbd>–<kbd className="rounded bg-white/10 px-1">4</kbd>{' '}
          answers the highlighted statement. You can stop at any point — a shorter quiz just means a smaller profile,
          and the panel says so.
        </p>
      </div>

      <LivePanel state={state} profile={profile} answers={answers} />
    </div>
  );
}

function latestIndex(questions: readonly QuizQuestion[], answers: readonly QuizAnswer[]): number {
  let max = -1;
  for (const a of answers) {
    const i = questions.findIndex((q) => q.id === a.questionId);
    if (i > max) max = i;
  }
  return max;
}

function Progress({ answered, total }: { answered: number; total: number }) {
  const pct = total > 0 ? Math.round((answered / total) * 100) : 0;
  return (
    <div className="mt-4" data-testid="quiz-progress">
      <div className="flex items-center justify-between text-xs font-semibold text-slate-400">
        <span>
          {answered} of {total} answered
        </span>
        <span>{pct}%</span>
      </div>
      <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-white/10">
        <div className="h-full rounded-full bg-brand-400 transition-all" style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

function Row({
  q,
  index,
  answered,
  isCurrent,
  chipsOpen,
  onAnswer,
  onToggleChip,
  onCloseChips,
  onFocusRow,
}: {
  q: QuizQuestion;
  index: number;
  answered: QuizAnswer | undefined;
  isCurrent: boolean;
  chipsOpen: boolean;
  onAnswer: (r: ResponseKey) => void;
  onToggleChip: (chipId: string) => void;
  onCloseChips: () => void;
  onFocusRow: () => void;
}) {
  const section = SECTIONS.find((s) => s.key === q.section);
  const picked = answered?.chips ?? [];
  return (
    <div className="wv-qtq-row" onFocusCapture={onFocusRow}>
      <div className="wv-qtq-text min-w-0">
        <div className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-wide text-slate-500">
          <span className="tabular-nums">{index + 1}</span>
          <span>{section?.label}</span>
          {q.type === 'tradeoff' && <span className="text-brand-300">Either/or</span>}
          {q.type === 'tolerance' && <span className="text-amber-300">Limit</span>}
        </div>
        <p className="mt-0.5 text-sm font-semibold text-white sm:text-[0.95rem]">{q.prompt}</p>
        {q.hint && isCurrent && <p className="mt-0.5 text-xs text-slate-400">{q.hint}</p>}
      </div>

      <div className="wv-qtq-answers" role="group" aria-label={q.prompt}>
        {RESPONSE_ORDER.map((key, i) => {
          const rv = RESPONSE_VALUES[key];
          const active = answered?.response === key;
          return (
            <button
              key={key}
              type="button"
              onClick={() => onAnswer(key)}
              aria-pressed={active}
              data-testid={`answer-${q.id}-${key}`}
              className={[
                'inline-flex min-h-[44px] items-center justify-center gap-1 whitespace-nowrap rounded-lg border px-2 text-xs font-semibold transition sm:px-3',
                active ? RESPONSE_STYLE[key] : 'border-white/12 bg-white/5 text-slate-300 hover:bg-white/10',
              ].join(' ')}
            >
              {isCurrent && <span className="hidden text-[10px] text-slate-500 lg:inline">{i + 1}</span>}
              {rv.label}
            </button>
          );
        })}
      </div>

      {/* Chips: compact, inline, and only when the answer was "Depends". */}
      {(chipsOpen || (answered?.response === 'depends' && picked.length > 0)) && (q.chips?.length ?? 0) > 0 && (
        <div className="wv-qtq-chips" data-testid={`chips-${q.id}`}>
          <span className="text-xs text-slate-400">Depends on…</span>
          {q.chips!.map((c) => {
            const on = picked.includes(c.id);
            return (
              <button
                key={c.id}
                type="button"
                onClick={() => onToggleChip(c.id)}
                aria-pressed={on}
                data-testid={`chip-${c.id}`}
                className={[
                  'inline-flex min-h-[36px] items-center rounded-full border px-3 text-xs font-semibold transition',
                  c.hardExclusion
                    ? on
                      ? 'border-rose-400/60 bg-rose-500/20 text-rose-100'
                      : 'border-rose-400/30 bg-rose-500/5 text-rose-200 hover:bg-rose-500/15'
                    : on
                      ? 'border-amber-400/60 bg-amber-500/20 text-amber-100'
                      : 'border-white/12 bg-white/5 text-slate-300 hover:bg-white/10',
                ].join(' ')}
              >
                {c.label}
              </button>
            );
          })}
          {chipsOpen && (
            <button
              type="button"
              onClick={onCloseChips}
              data-testid={`chips-done-${q.id}`}
              className="inline-flex min-h-[36px] items-center rounded-full border border-white/15 px-3 text-xs font-semibold text-slate-200 hover:bg-white/10"
            >
              Next →
            </button>
          )}
        </div>
      )}
    </div>
  );
}

function LivePanel({
  state,
  profile,
  answers,
}: {
  state: ReturnType<typeof dnaState>;
  profile: ReturnType<typeof buildProfile>;
  answers: QuizAnswer[];
}) {
  const top = Object.entries(profile.attributes)
    .filter(([, b]) => b.evidence > 0)
    .sort((a, b) => Math.abs(b[1].lean) - Math.abs(a[1].lean))
    .slice(0, 6);
  const missing = missingSections(answers);

  return (
    <aside className="lg:sticky lg:top-24 lg:self-start" data-testid="quiz-live-dna">
      <div className="card p-4">
        <div className="text-xs font-bold uppercase tracking-wide text-brand-300">Your DNA, live</div>
        <div className="mt-1 text-lg font-extrabold text-white" data-testid="dna-label">
          {state.label}
        </div>

        {/* Two numbers, never one: breadth and firmness are different claims. */}
        <dl className="mt-3 space-y-2">
          <Meter label="Coverage" hint="how much of you I have asked about" value={state.coverage} testid="dna-coverage" />
          <Meter label="Confidence" hint="how firmly you told me" value={state.confidence} testid="dna-confidence" />
        </dl>

        {top.length > 0 ? (
          <ul className="mt-3 space-y-1 border-t border-white/10 pt-3 text-xs text-slate-300">
            {top.map(([key, b]) => (
              <li key={key} className="flex items-center justify-between gap-2">
                <span className="truncate">{key.replace(/_/g, ' ')}</span>
                <span className={b.lean > 0 ? 'text-emerald-300' : 'text-rose-300'}>
                  {b.lean > 0 ? 'more' : 'less'}
                </span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-3 border-t border-white/10 pt-3 text-xs text-slate-500">
            Nothing yet. Answer one and this fills in.
          </p>
        )}

        {missing.length > 0 && (
          <p className="mt-3 text-[11px] text-slate-500" data-testid="dna-missing">
            Not asked about yet: {missing.map((s) => s.label.toLowerCase()).join(', ')}.
          </p>
        )}
      </div>
    </aside>
  );
}

function Meter({
  label,
  hint,
  value,
  testid,
}: {
  label: string;
  hint: string;
  value: number;
  testid: string;
}) {
  const pct = Math.round(value * 100);
  return (
    <div data-testid={testid}>
      <div className="flex items-baseline justify-between text-xs">
        <dt className="font-semibold text-slate-300">{label}</dt>
        <dd className="tabular-nums font-bold text-white">{pct}%</dd>
      </div>
      <div className="mt-1 h-1 overflow-hidden rounded-full bg-white/10">
        <div className="h-full rounded-full bg-brand-400" style={{ width: `${pct}%` }} />
      </div>
      <p className="mt-0.5 text-[10px] text-slate-500">{hint}</p>
    </div>
  );
}

function Reveal({
  lines,
  state,
  questions,
  answers,
  saving,
  saved,
  canSave,
  onCorrect,
  onResume,
}: {
  lines: ReturnType<typeof reveal>;
  state: ReturnType<typeof dnaState>;
  questions: readonly QuizQuestion[];
  answers: QuizAnswer[];
  saving: boolean;
  saved: { ok: boolean; message: string } | null;
  canSave: boolean;
  onCorrect: (questionId: string) => void;
  onResume: () => void;
}) {
  // Which question produced each line, so "that's not right" can send you back
  // to the exact statement rather than to the quiz in general.
  const sourceQuestion = useMemo(() => {
    const byAttribute = new Map<string, string>();
    for (const a of answers) {
      const q = questions.find((x) => x.id === a.questionId);
      if (!q) continue;
      for (const t of [...q.yes, ...(q.no ?? [])]) if (!byAttribute.has(t.key)) byAttribute.set(t.key, q.id);
      for (const c of q.chips ?? []) for (const t of c.targets ?? []) if (!byAttribute.has(t.key)) byAttribute.set(t.key, q.id);
    }
    return byAttribute;
  }, [answers, questions]);

  return (
    <div className="mx-auto max-w-2xl" data-testid="taste-quiz-reveal">
      <h1 className="text-2xl font-bold text-white sm:text-3xl">Here is what I heard</h1>
      <p className="mt-1 text-sm text-slate-400">{state.summary}</p>

      <div className="mt-4 flex flex-wrap items-center gap-2">
        <span className="rounded-full border border-brand-400/40 bg-brand-500/15 px-3 py-1 text-xs font-bold text-brand-100">
          {state.label}
        </span>
        <span className="text-xs text-slate-500">
          Coverage {Math.round(state.coverage * 100)}% · Confidence {Math.round(state.confidence * 100)}%
        </span>
      </div>

      {saving && <p className="mt-3 text-sm text-slate-400">Saving…</p>}
      {saved && (
        <p
          className={`mt-3 text-sm ${saved.ok ? 'text-emerald-300' : 'text-rose-300'}`}
          data-testid="quiz-save-status"
        >
          {saved.message}
        </p>
      )}
      {!canSave && (
        <p className="mt-3 text-sm text-amber-200" data-testid="quiz-signin-note">
          Sign in to keep this — nothing has been saved yet.
        </p>
      )}

      {lines.length > 0 ? (
        <ul className="mt-5 space-y-2" data-testid="reveal-lines">
          {lines.map((l, i) => {
            const qid = l.attribute ? sourceQuestion.get(l.attribute) : undefined;
            return (
              <li key={`${l.attribute}-${i}`} className="card flex items-start justify-between gap-3 p-3">
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-white">{l.text}</p>
                  {l.quote && <p className="mt-0.5 truncate text-xs italic text-slate-500">“{l.quote}”</p>}
                </div>
                {qid && (
                  <button
                    type="button"
                    onClick={() => onCorrect(qid)}
                    data-testid={`correct-${l.attribute}`}
                    className="inline-flex min-h-[36px] flex-none items-center rounded-lg border border-white/15 px-3 text-xs font-semibold text-slate-200 transition hover:bg-white/10"
                  >
                    Not right
                  </button>
                )}
              </li>
            );
          })}
        </ul>
      ) : (
        <p className="mt-5 text-sm text-slate-400">
          Not enough yet to say anything about you. Answer a few more and this fills in.
        </p>
      )}

      <div className="mt-6 flex flex-wrap gap-2">
        <Link href="/app/watch" className="btn-primary inline-flex min-h-[44px] items-center px-5">
          Find something to watch →
        </Link>
        <button
          type="button"
          onClick={onResume}
          data-testid="reveal-resume"
          className="inline-flex min-h-[44px] items-center rounded-lg border border-white/15 px-4 text-sm font-semibold text-slate-200 transition hover:bg-white/10"
        >
          Change an answer
        </button>
        <Link
          href="/app/quiz"
          data-testid="reveal-calibrate"
          className="inline-flex min-h-[44px] items-center rounded-lg border border-white/15 px-4 text-sm font-semibold text-slate-200 transition hover:bg-white/10"
        >
          Sharpen it on real titles →
        </Link>
      </div>
      <p className="mt-2 text-xs text-slate-500">
        Reacting to a handful of actual films and shows tells me things a statement cannot — it is optional, and it
        adds to this rather than replacing it.
      </p>
    </div>
  );
}
