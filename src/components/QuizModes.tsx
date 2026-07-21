'use client';

import { useState } from 'react';
import { LikeHateGame } from './LikeHateGame';
import { QuizGame } from './QuizGame';

/** Taste-building: the fast Like/Nope game by default, or the finer 1–10 scale. */
export function QuizModes() {
  const [mode, setMode] = useState<'quick' | 'scale'>('quick');
  return (
    <div className="mt-5">
      <div className="inline-flex rounded-xl border border-white/12 bg-white/5 p-1">
        <button
          onClick={() => setMode('quick')}
          className={`rounded-lg px-3.5 py-1.5 text-sm font-bold transition ${mode === 'quick' ? 'bg-brand-500 text-white shadow' : 'text-slate-300 hover:text-white'}`}
        >
          ⚡ Like / Nope
        </button>
        <button
          onClick={() => setMode('scale')}
          className={`rounded-lg px-3.5 py-1.5 text-sm font-bold transition ${mode === 'scale' ? 'bg-brand-500 text-white shadow' : 'text-slate-300 hover:text-white'}`}
        >
          ★ Rate 1–10
        </button>
      </div>
      {mode === 'quick' ? <LikeHateGame /> : <QuizGame />}
    </div>
  );
}
