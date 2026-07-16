'use client';

import { useState } from 'react';
import type { EasyAudience, EasyEra, EasyContent } from '@/lib/easyTypes';

export interface QuizResult {
  audience: EasyAudience;
  mediaType: 'any' | 'movie' | 'tv';
  era: EasyEra;
  content: EasyContent;
  maxRuntime: number | null;
  moodGenres: number[];
}

interface Option<T> {
  label: string;
  emoji: string;
  value: T;
}
interface Question<T> {
  key: keyof QuizResult;
  prompt: string;
  options: Option<T>[];
}

// Five plain questions, each a big tap. Answers map straight onto real levers.
const QUESTIONS: Question<string | boolean | number | null | number[]>[] = [
  {
    key: 'audience',
    prompt: 'Who’s watching tonight?',
    options: [
      { label: 'Just me', emoji: '🙂', value: 'me' },
      { label: 'My partner & me', emoji: '💞', value: 'partner' },
      { label: 'The whole family', emoji: '👨‍👩‍👧', value: 'family' },
    ],
  },
  {
    key: 'mediaType',
    prompt: 'A movie or a TV show?',
    options: [
      { label: 'A movie', emoji: '🎬', value: 'movie' },
      { label: 'A TV show', emoji: '📺', value: 'tv' },
      { label: 'Either is fine', emoji: '🍿', value: 'any' },
    ],
  },
  {
    key: 'maxRuntime',
    prompt: 'How much time do you have?',
    options: [
      { label: '30 minutes or less', emoji: '⏱️', value: 30 },
      { label: 'An hour or less', emoji: '🕐', value: 60 },
      { label: 'About 1½ hours', emoji: '🕑', value: 90 },
      { label: 'About 2 hours', emoji: '🕒', value: 120 },
      { label: 'However long', emoji: '♾️', value: null },
    ],
  },
  {
    key: 'era',
    prompt: 'From which era?',
    options: [
      { label: 'Any era', emoji: '🎞️', value: 'any' },
      { label: 'Brand new (2020s)', emoji: '✨', value: 'y2020s' },
      { label: '2000s & 2010s', emoji: '📀', value: 'y2000s' },
      { label: 'The 80s & 90s', emoji: '📼', value: 'y80s90s' },
      { label: 'The 60s & 70s', emoji: '📺', value: 'y60s70s' },
      { label: 'Golden oldies (pre-1960)', emoji: '🎩', value: 'ypre60' },
    ],
  },
  {
    key: 'content',
    prompt: 'How clean should we keep it?',
    options: [
      { label: 'Anything goes', emoji: '😌', value: 'any' },
      { label: 'Nothing too scary', emoji: '🙂', value: 'mild' },
      { label: 'Keep it clean', emoji: '👍', value: 'clean' },
      { label: 'Family-friendly only', emoji: '👨‍👩‍👧', value: 'family' },
    ],
  },
  {
    key: 'moodGenres',
    prompt: 'What sounds good tonight?',
    options: [
      { label: 'Something funny', emoji: '😂', value: [35] },
      { label: 'A gripping drama', emoji: '🎭', value: [18] },
      { label: 'Action & adventure', emoji: '💥', value: [28, 12] },
      { label: 'A true story', emoji: '📖', value: [36, 99] },
      { label: 'Romance', emoji: '❤️', value: [10749] },
      { label: 'Mystery & crime', emoji: '🕵️', value: [9648, 80] },
    ],
  },
];

export function EasyQuiz({ onDone, onCancel }: { onDone: (r: QuizResult) => void; onCancel: () => void }) {
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
    <div className="mx-auto flex min-h-[100dvh] max-w-2xl flex-col px-3 pb-4 pt-3">
      {/* Progress */}
      <div className="flex items-center justify-center gap-1.5">
        {QUESTIONS.map((_, i) => (
          <span key={i} className={`h-2 rounded-full transition-all ${i === step ? 'w-7 bg-brand-400' : i < step ? 'w-2 bg-brand-500' : 'w-2 bg-white/15'}`} />
        ))}
      </div>

      <div className="mt-4 text-center">
        <div className="text-sm font-semibold text-slate-400">Question {step + 1} of {QUESTIONS.length}</div>
        <h1 className="mx-auto mt-1 max-w-xl text-2xl font-black leading-tight text-white sm:text-3xl">{q.prompt}</h1>
      </div>

      {/* Answers fill the remaining space, centered */}
      <div className="flex flex-1 flex-col justify-center">
        <div className={`grid ${cols} gap-2.5`}>
          {q.options.map((o) => {
            // Movies are rarely under an hour — gray out the short options.
            const isMovie = answers.mediaType === 'movie';
            const disabled = q.key === 'maxRuntime' && isMovie && (o.value === 30 || o.value === 60);
            return (
              <button
                key={o.label}
                onClick={() => !disabled && choose(o.value)}
                disabled={disabled}
                title={disabled ? 'Movies are almost never under an hour' : undefined}
                className={`flex min-h-[88px] flex-col items-center justify-center gap-1.5 rounded-2xl border-2 px-2 py-3 text-center text-base font-bold leading-tight transition ${disabled ? 'cursor-not-allowed border-white/10 bg-white/[0.02] text-slate-600' : 'border-white/15 bg-white/[0.04] text-white hover:border-brand-400 hover:bg-brand-500/15 active:scale-[0.98]'}`}
              >
                <span className="text-3xl" aria-hidden>{o.emoji}</span>
                <span>{o.label}{disabled ? ' (TV)' : ''}</span>
              </button>
            );
          })}
        </div>
      </div>

      <div className="flex items-center justify-between pt-2">
        <button
          onClick={() => (step === 0 ? onCancel() : setStep(step - 1))}
          className="text-base font-semibold text-slate-400 underline hover:text-white"
        >
          {step === 0 ? 'Skip the quiz' : '← Back'}
        </button>
        <span className="text-sm text-slate-500">Tap to continue</span>
      </div>
    </div>
  );
}
