import type { SupabaseClient } from '@supabase/supabase-js';
import { loadPreference } from './store';
import { snapshotDna } from './snapshot';

/**
 * Persist a snapshot of the DERIVED taste state (trait_confidence rows + one
 * dna_strength_history point) from the current event log. Called at natural
 * recompute boundaries (after preferences are recorded), NEVER in a search/grid
 * path. Best-effort and safe-absent: any failure (tables not migrated, RLS,
 * network) is swallowed — the append-only event log remains the source of truth
 * and nothing here is required for correctness. History is APPENDED, never
 * overwritten (each recompute is a new dna_strength_history row).
 */
export async function persistDnaSnapshot(
  supabase: SupabaseClient,
  userId: string,
  now: number = Date.now(),
  roundId?: string,
): Promise<void> {
  if (!userId) return;
  try {
    const { events, dna } = await loadPreference(supabase, userId, now);
    if (!events.length) return;
    const snap = snapshotDna(dna);

    if (snap.traits.length > 0) {
      const rows = snap.traits.map((t) => ({
        user_id: userId,
        channel: t.channel,
        trait_kind: t.traitKind,
        trait_key: t.traitKey,
        pref: t.pref,
        evidence: t.evidence,
        confidence: t.confidence,
        updated_at: new Date(now).toISOString(),
      }));
      await supabase.from('trait_confidence').upsert(rows, { onConflict: 'user_id,channel,trait_kind,trait_key' });
    }

    await supabase.from('dna_strength_history').insert({
      user_id: userId,
      developed: snap.developed,
      categories: snap.categories,
      round_id: roundId ?? null,
      created_at: new Date(now).toISOString(),
    });
  } catch {
    /* safe-absent: derived-state history is an auditability optimization */
  }
}
