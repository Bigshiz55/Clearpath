'use client';

/**
 * RAPID FIRE, FOR REAL — the live run over the user's own history.
 *
 * Same pure queue, same card component, same answer grammar as the demo —
 * the ONE difference is that answers persist, each through
 * `recordRapidFireAnswer` (the canonical Taste DNA event log). The demo's
 * hard rule inverts here: everything you tap is saved, and the finish screen
 * may honestly offer recommendations because the run really taught them.
 */
import { useState } from 'react';
import { RapidFire } from '@/components/RapidFire';
import { announceDnaChanged } from '@/components/onboarding/DnaProgressMeter';
import type { AnswerKey, RapidFireItem } from '@/lib/import/rapidFire';
import type { TitleRef } from '@/lib/import/historyObservations';
import { recordRapidFireAnswer } from '@/lib/actions/rapidFire';

const uid = () =>
  typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `rf_${Date.now().toString(36)}_${Math.floor(Math.random() * 1e9).toString(36)}`;

export function RapidFireLive({
  queue,
  refs,
  sessionId,
}: {
  queue: RapidFireItem[];
  /** queue key → real title identity (tmdb id) — serialized Map entries. */
  refs: Array<[string, TitleRef]>;
  sessionId?: string;
}) {
  const [failures, setFailures] = useState(0);
  const byKey = new Map(refs);

  function persist(item: RapidFireItem, answer: AnswerKey) {
    const ref = byKey.get(item.key);
    if (!ref) return;
    void recordRapidFireAnswer({
      eventId: uid(),
      tmdbId: ref.tmdbId,
      mediaType: ref.mediaType,
      title: ref.title,
      answer,
      sessionId,
    })
      .then((r) => {
        if (r.ok) announceDnaChanged();
        else setFailures((n) => n + 1);
      })
      .catch(() => setFailures((n) => n + 1));
  }

  return (
    <div className="space-y-3" data-testid="rapid-fire-live">
      <RapidFire queue={queue} onAnswer={persist} savesToDna />
      {failures > 0 && (
        <p className="text-xs font-semibold text-amber-300" data-testid="rapid-live-failures">
          {failures} answer{failures === 1 ? '' : 's'} couldn&rsquo;t be saved — they will be asked again next time.
        </p>
      )}
    </div>
  );
}
