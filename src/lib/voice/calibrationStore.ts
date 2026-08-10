import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { CalibrationAnswer } from './calibration/machine';

/**
 * Where a completed calibration lives.
 *
 * It shares the `voice_interviews` table (migration 0047) rather than adding
 * one, for a specific reason: a new table needs a migration, a migration needs
 * the owner to run it, and a feature that cannot save until someone opens a SQL
 * console is a feature that does not work. The row is the same shape the table
 * already stores — a user id and an opaque JSON state — so nothing about the
 * schema is being bent.
 *
 * Two rules keep it from colliding with the conversational interview that also
 * uses this table:
 *
 *   - Only COMPLETED runs are written, with `status: 'complete'`. The resume
 *     query for the deep interview looks for `status = 'active'`, so it can
 *     never pick a calibration up by accident. An in-progress run lives in the
 *     browser's sessionStorage, which is also what makes a mid-run reload
 *     resume instead of restarting.
 *   - The id is namespaced `calibration:<userId>:<completedAt>`, so the two
 *     kinds of row are distinguishable by key alone.
 *
 * FAIL-SAFE, like its sibling `store.ts`: a write that fails is reported as
 * `false` and logged, never thrown. The user is already looking at their result
 * and must not be shown a crash because a database call was slow.
 */

const TABLE = 'voice_interviews';

export interface StoredCalibration {
  kind: 'calibration';
  version: string;
  userId: string;
  /** Every answer, verbatim, including skips — the provenance is the point. */
  answers: CalibrationAnswer[];
  /** Convenience projection: itemId → 0..10, skips omitted. */
  ratings: Record<string, number>;
  completedAt: number;
}

export function calibrationId(userId: string, completedAt: number): string {
  return `calibration:${userId}:${completedAt}`;
}

/** Returns true when the row landed. Never throws. */
export async function saveCalibrationRun(
  supabase: SupabaseClient,
  record: StoredCalibration,
): Promise<boolean> {
  if (!record.userId) return false;
  const row = {
    id: calibrationId(record.userId, record.completedAt),
    user_id: record.userId,
    status: 'complete',
    state: record,
    overall_confidence: 0,
    updated_at: new Date(record.completedAt).toISOString(),
  };
  try {
    const { error } = await supabase.from(TABLE).upsert(row, { onConflict: 'id' });
    if (error) {
      console.warn('[calibration] save failed:', error.message);
      return false;
    }
    return true;
  } catch (e) {
    console.warn('[calibration] save threw:', e instanceof Error ? e.message : e);
    return false;
  }
}

/** The user's most recent completed calibration, or null. Never throws. */
export async function loadLatestCalibration(
  supabase: SupabaseClient,
  userId: string,
): Promise<StoredCalibration | null> {
  if (!userId) return null;
  try {
    const { data, error } = await supabase
      .from(TABLE)
      .select('id,state')
      .eq('user_id', userId)
      .eq('status', 'complete')
      .like('id', 'calibration:%')
      .order('updated_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error || !data) return null;
    const state = (data as { state?: unknown }).state as StoredCalibration | undefined;
    return state && state.kind === 'calibration' ? state : null;
  } catch {
    return null;
  }
}
