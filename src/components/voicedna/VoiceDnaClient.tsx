'use client';

import { useCallback } from 'react';
import { VoiceDnaInterview } from './VoiceDnaInterview';
import { applyVoiceDna } from '@/lib/actions/voiceDna';
import type { VoiceSession } from '@/lib/voicedna/session';
import type { AudioAvailability } from '@/lib/voicedna/audio';

/**
 * Wires the pure interview component to the server action. Kept separate so the
 * interview itself has no server dependency and can be exercised end to end in
 * tests without a database.
 */
export function VoiceDnaClient({
  audio,
  canPersist,
}: {
  audio: AudioAvailability;
  canPersist: boolean;
}) {
  const onApply = useCallback(async (session: VoiceSession) => {
    const res = await applyVoiceDna({
      id: session.id,
      mode: session.mode,
      stage: 'applied',
      inputMode: 'typed',
      asked: session.asked,
      answers: session.answers,
      claims: session.claims,
      startedAt: session.startedAt,
      ...(session.appliedAt ? { appliedAt: session.appliedAt } : {}),
    });
    return { ok: res.ok, written: res.written, ...(res.error ? { error: res.error } : {}) };
  }, []);

  return <VoiceDnaInterview audio={audio} canPersist={canPersist} onApply={onApply} />;
}
