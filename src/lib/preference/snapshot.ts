/**
 * TEMPORAL TASTE MEMORY — persisting the DERIVED state, not just the event log.
 *
 * `preference_events` is already the append-only, timestamped, provenance-rich
 * source of truth (the log IS the truth, folded by `deriveDna`). What was
 * missing is a persisted history of the DERIVED state, so "your DNA got
 * stronger over time" is auditable without re-folding the whole log. Migration
 * 0023 declared `trait_confidence` (a per-trait cache) and `dna_strength_history`
 * (a point per recompute) for exactly this, but nothing wrote them. This module
 * turns a `DnaState` into those rows — purely, so it is unit-testable.
 *
 * It is a snapshot of a deterministic fold, never a second source of truth: the
 * event log remains authoritative and re-derivable, and confidence is a pure
 * function of accumulated evidence — so explicit, high-weight signals (a "loved"
 * post-watch grade) dominate weak inferred ones (a click) by construction, and
 * that ordering is preserved into the snapshot.
 */
import type { DnaState, ChannelProfile, TraitBelief } from './types';
import { evidenceConfidence } from './confidence';

export type TraitKind = 'dim' | 'genre' | 'person' | 'novelty';

export interface TraitConfidenceRow {
  channel: 'experience' | 'attraction' | 'discovery';
  traitKind: TraitKind;
  traitKey: string;
  pref: number;
  evidence: number;
  confidence: number;
}

export interface DnaSnapshot {
  traits: TraitConfidenceRow[];
  /** A single integer "developed" strength — count of confident traits. */
  developed: number;
  /** Per-channel sample counts, kept as the history point's categories blob. */
  categories: Record<string, number>;
}

/** Confidence at/above this counts a trait as "developed" for the strength point. */
const DEVELOPED_AT = 0.5;

function channelRows(
  channel: TraitConfidenceRow['channel'],
  profile: ChannelProfile,
): TraitConfidenceRow[] {
  const rows: TraitConfidenceRow[] = [];
  const push = (kind: TraitKind, key: string, b: TraitBelief) => {
    if (!(b.evidence > 0)) return; // never store an all-zero belief
    rows.push({ channel, traitKind: kind, traitKey: key, pref: b.pref, evidence: b.evidence, confidence: evidenceConfidence(b.evidence) });
  };
  for (const [k, b] of Object.entries(profile.dims)) push('dim', k, b);
  for (const [k, b] of Object.entries(profile.genres)) push('genre', k, b);
  for (const [k, b] of Object.entries(profile.people)) push('person', k, b);
  push('novelty', 'novelty', profile.novelty);
  return rows;
}

/** Turn a derived DnaState into persistable snapshot rows. Pure. */
export function snapshotDna(state: DnaState): DnaSnapshot {
  const traits = [
    ...channelRows('experience', state.experience),
    ...channelRows('attraction', state.attraction),
    ...channelRows('discovery', state.discovery),
  ];
  const developed = traits.filter((t) => t.confidence >= DEVELOPED_AT).length;
  const categories = {
    experience: state.experience.samples,
    attraction: state.attraction.samples,
    discovery: state.discovery.samples,
  };
  return { traits, developed, categories };
}
