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

  return (
    <div className="mx-auto max-w-2xl px-1 pb-16 pt-4">
      {/* Progress */}
      <div className="mb-6 flex items-center justify-center gap-2">
        {QUESTIONS.map((_, i) => (
          <span key={i} className={`h-2.5 rounded-full transition-all ${i === step ? 'w-8 bg-brand-400' : i < step ? 'w-2.5 bg-brand-500' : 'w-2.5 bg-white/15'}`} />
        ))}
      </div>

      <div className="text-center">
        <div className="text-lg font-semibold text-slate-400">Question {step + 1} of {QUESTIONS.length}</div>
        <h1 className="mx-auto mt-2 max-w-xl text-3xl font-black leading-tight text-white">{q.prompt}</h1>
      </div>

      <div className="mt-8 grid grid-cols-1 gap-3 sm:grid-cols-2">
        {q.options.map((o) => (
          <button
            key={o.label}
            onClick={() => choose(o.value)}
            className="flex items-center gap-4 rounded-2xl border-2 border-white/15 bg-white/[0.04] px-5 py-5 text-left text-xl font-bold text-white transition hover:border-brand-400 hover:bg-brand-500/15"
          >
            <span className="text-3xl" aria-hidden>{o.emoji}</span>
            {o.label}
          </button>
        ))}
      </div>

      <div className="mt-8 flex items-center justify-between">
        <button
          onClick={() => (step === 0 ? onCancel() : setStep(step - 1))}
          className="text-lg font-semibold text-slate-400 underline hover:text-white"
        >
          {step === 0 ? 'Skip the quiz' : '← Back'}
        </button>
        <span className="text-base text-slate-500">Tap an answer to continue</span>
      </div>
    </div>
  );
}
