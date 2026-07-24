'use client';

import { DnaQuiz, type QuizItem, type SubmitPayload } from '@/components/DnaQuiz';

/** A fixed, deterministic pool — including a long title and a missing poster. */
const MOCK: QuizItem[] = [
  { id: 603, mediaType: 'movie', title: 'The Matrix', year: 1999, posterPath: '/x.jpg', posterUrl: 'data:image/gif;base64,R0lGODlhAQABAAAAACw=', genre: 'Sci-Fi' },
  { id: 1396, mediaType: 'tv', title: 'Breaking Bad', year: 2008, posterPath: '/y.jpg', posterUrl: 'data:image/gif;base64,R0lGODlhAQABAAAAACw=', genre: 'Crime' },
  { id: 999, mediaType: 'movie', title: 'A Ridiculously Long Movie Title That Should Wrap Cleanly Without Breaking The Card Layout Or Overflowing', year: 2021, posterPath: null, posterUrl: null, genre: 'Drama' },
  { id: 550, mediaType: 'movie', title: 'Fight Club', year: 1999, posterPath: '/z.jpg', posterUrl: 'data:image/gif;base64,R0lGODlhAQABAAAAACw=', genre: 'Thriller' },
];

declare global {
  interface Window {
    __quizSubmits?: SubmitPayload[];
    __quizUndos?: string[];
  }
}

export function DnaQuizHarness() {
  const onSubmit = async (p: SubmitPayload) => {
    if (typeof window !== 'undefined') (window.__quizSubmits ??= []).push(p);
    await new Promise((r) => setTimeout(r, 30)); // simulate a quick network round-trip
    return { ok: true as const };
  };
  const onUndo = async (eventId: string) => {
    if (typeof window !== 'undefined') (window.__quizUndos ??= []).push(eventId);
    return { ok: true as const };
  };
  return (
    <div className="h-full">
      <DnaQuiz items={MOCK} onSubmit={onSubmit} onUndo={onUndo} />
    </div>
  );
}
