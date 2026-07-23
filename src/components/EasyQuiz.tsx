'use client';

import { useState } from 'react';
import type { EasyAudience, EasyEra, EasyContent } from '@/lib/easyTypes';
import { useT } from '@/i18n/I18nProvider';

export interface QuizResult {
  audience: EasyAudience;
  mediaType: 'any' | 'movie' | 'tv';
  era: EasyEra;
  content: EasyContent;
  maxRuntime: number | null;
  moodGenres: number[];
}

interface Option<T> {
  labelKey: string;
  emoji: string;
  value: T;
}
interface Question<T> {
  key: keyof QuizResult;
  promptKey: string;
  options: Option<T>[];
}

// Five plain questions, each a big tap. Answers map straight onto real levers.
// Prompts/labels are translated at render; keys + values stay stable (logic).
const QUESTIONS: Question<string | boolean | number | null | number[]>[] = [
  {
    key: 'audience',
    promptKey: 'ask.easy.q1prompt',
    options: [
      { labelKey: 'ask.easy.q1o1', emoji: '🙂', value: 'me' },
      { labelKey: 'ask.easy.q1o2', emoji: '💞', value: 'partner' },
      { labelKey: 'ask.easy.q1o3', emoji: '👨‍👩‍👧', value: 'family' },
    ],
  },
  {
    key: 'mediaType',
    promptKey: 'ask.easy.q2prompt',
    options: [
      { labelKey: 'ask.easy.q2o1', emoji: '🎬', value: 'movie' },
      { labelKey: 'ask.easy.q2o2', emoji: '📺', value: 'tv' },
      { labelKey: 'ask.easy.q2o3', emoji: '🍿', value: 'any' },
    ],
  },
  {
    key: 'maxRuntime',
    promptKey: 'ask.easy.q3prompt',
    options: [
      { labelKey: 'ask.easy.q3o1', emoji: '⏱️', value: 30 },
      { labelKey: 'ask.easy.q3o2', emoji: '🕐', value: 60 },
      { labelKey: 'ask.easy.q3o3', emoji: '🕑', value: 90 },
      { labelKey: 'ask.easy.q3o4', emoji: '🕒', value: 120 },
      { labelKey: 'ask.easy.q3o5', emoji: '♾️', value: null },
    ],
  },
  {
    key: 'era',
    promptKey: 'ask.easy.q4prompt',
    options: [
      { labelKey: 'ask.easy.q4o1', emoji: '🎞️', value: 'any' },
      { labelKey: 'ask.easy.q4o2', emoji: '✨', value: 'y2020s' },
      { labelKey: 'ask.easy.q4o3', emoji: '📀', value: 'y2000s' },
      { labelKey: 'ask.easy.q4o4', emoji: '📼', value: 'y80s90s' },
      { labelKey: 'ask.easy.q4o5', emoji: '📺', value: 'y60s70s' },
      { labelKey: 'ask.easy.q4o6', emoji: '🎩', value: 'ypre60' },
    ],
  },
  {
    key: 'content',
    promptKey: 'ask.easy.q5prompt',
    options: [
      { labelKey: 'ask.easy.q5o1', emoji: '😌', value: 'any' },
      { labelKey: 'ask.easy.q5o2', emoji: '🙂', value: 'mild' },
      { labelKey: 'ask.easy.q5o3', emoji: '👍', value: 'clean' },
      { labelKey: 'ask.easy.q5o4', emoji: '👨‍👩‍👧', value: 'family' },
    ],
  },
  {
    key: 'moodGenres',
    promptKey: 'ask.easy.q6prompt',
    options: [
      { labelKey: 'ask.easy.q6o1', emoji: '😂', value: [35] },
      { labelKey: 'ask.easy.q6o2', emoji: '🎭', value: [18] },
      { labelKey: 'ask.easy.q6o3', emoji: '💥', value: [28, 12] },
      { labelKey: 'ask.easy.q6o4', emoji: '📖', value: [36, 99] },
      { labelKey: 'ask.easy.q6o5', emoji: '❤️', value: [10749] },
      { labelKey: 'ask.easy.q6o6', emoji: '🕵️', value: [9648, 80] },
    ],
  },
];

export function EasyQuiz({ onDone, onCancel }: { onDone: (r: QuizResult) => void; onCancel: () => void }) {
  const t = useT();
  const [step, setStep] = useState(0);
  const [answers, setAnswers] = useState<Partial<QuizResult>>({});

  const q = QUESTIONS[step]!;

  function choose(value: unknown) {
    const next = { ...answers, [q.key]: value };
    setAnswers(next);
    if (step < QUESTIONS.length - 1) {
      setStep(step + 1);
    } else {
      onDone({
        audience: (next.audience as EasyAudience) ?? 'me',
        mediaType: (next.mediaType as 'any' | 'movie' | 'tv') ?? 'any',
        era: (next.era as EasyEra) ?? 'any',
        content: (next.content as EasyContent) ?? 'any',
        maxRuntime: (next.maxRuntime as number | null) ?? null,
        moodGenres: (next.moodGenres as number[]) ?? [],
      });
    }
  }

  // Compact grid so every question fits a phone without scrolling: 3-across for
  // short lists, 2-across for longer ones.
  const cols = q.options.length === 3 ? 'grid-cols-3' : 'grid-cols-2';

  return (
    // Full-viewport overlay so the quiz never scrolls the page: header + footer
    // are fixed and the answers flex to fill (scrolling only inside if truly tiny).
    <div className="fixed inset-0 z-50 flex flex-col overflow-hidden bg-ink-950 px-3 pt-[calc(0.5rem+env(safe-area-inset-top))] pb-[calc(0.5rem+env(safe-area-inset-bottom))]">
      {/* Progress (fixed) */}
      <div className="flex flex-none items-center justify-center gap-1.5">
        {QUESTIONS.map((_, i) => (
          <span key={i} className={`h-1.5 rounded-full transition-all ${i === step ? 'w-6 bg-brand-400' : i < step ? 'w-1.5 bg-brand-500' : 'w-1.5 bg-white/15'}`} />
        ))}
      </div>

      <div className="mt-2.5 flex-none text-center">
        <div className="text-xs font-semibold text-slate-400">{t('ask.easy.questionOf', { n: step + 1, total: QUESTIONS.length })}</div>
        <h1 className="mx-auto mt-0.5 max-w-xl text-xl font-black leading-tight text-white sm:text-2xl">{t(q.promptKey)}</h1>
      </div>

      {/* Answers flex to fill; only this area scrolls if a phone is extremely short */}
      <div className="flex min-h-0 flex-1 flex-col justify-center overflow-y-auto py-3">
        <div className={`grid ${cols} gap-2`}>
          {q.options.map((o) => {
            // Movies are rarely under an hour — gray out the short options.
            const isMovie = answers.mediaType === 'movie';
            const disabled = q.key === 'maxRuntime' && isMovie && (o.value === 30 || o.value === 60);
            return (
              <button
                key={o.labelKey}
                onClick={() => !disabled && choose(o.value)}
                disabled={disabled}
                title={disabled ? t('ask.easy.moviesUnderHour') : undefined}
                className={`flex min-h-[62px] flex-col items-center justify-center gap-0.5 rounded-xl border-2 px-2 py-2 text-center text-sm font-bold leading-tight transition ${disabled ? 'cursor-not-allowed border-white/10 bg-white/[0.02] text-slate-600' : 'border-white/15 bg-white/[0.04] text-white hover:border-brand-400 hover:bg-brand-500/15 active:scale-[0.98]'}`}
              >
                <span className="text-2xl" aria-hidden>{o.emoji}</span>
                <span>{t(o.labelKey)}{disabled ? t('ask.easy.tvSuffix') : ''}</span>
              </button>
            );
          })}
        </div>
      </div>

      <div className="flex flex-none items-center justify-between">
        <button
          onClick={() => (step === 0 ? onCancel() : setStep(step - 1))}
          className="text-sm font-semibold text-slate-400 underline hover:text-white"
        >
          {step === 0 ? t('ask.easy.skipQuiz') : t('ask.easy.back')}
        </button>
        <span className="text-xs text-slate-500">{t('ask.easy.tapToContinue')}</span>
      </div>
    </div>
  );
}
