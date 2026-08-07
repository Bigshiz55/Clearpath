// Reader DNA — a durable, evolving model of an individual reader's taste. Each
// dimension tracks not just a value but the evidence behind it: how many
// interactions support or contradict it, confidence, stability, and whether the
// user confirmed it. Nothing here is treated as permanent truth from one click.

import { clamp01, stabilityOf, type Stability } from './confidence';

/** A group for organizing dimensions in the UI. */
export type ReaderDimensionGroup =
  | 'genre'
  | 'structure'
  | 'style'
  | 'content'
  | 'format'
  | 'behavior';

export interface ReaderDimensionDef {
  key: string;
  label: string;
  group: ReaderDimensionGroup;
  /** Meaning of value≈0 and value≈1, so the axis is interpretable. */
  low: string;
  high: string;
}

/**
 * The dimension registry. Values are 0..1 with the documented low/high poles.
 * This is a representative, extensible core — new axes can be appended without
 * migration because Reader DNA is stored as a keyed map.
 */
export const READER_DIMENSIONS: readonly ReaderDimensionDef[] = [
  { key: 'plot_vs_character', label: 'Plot vs character', group: 'structure', low: 'Character-driven', high: 'Plot-driven' },
  { key: 'pacing', label: 'Preferred pacing', group: 'structure', low: 'Slow burn', high: 'Fast-paced' },
  { key: 'slow_burn_tolerance', label: 'Slow-burn tolerance', group: 'structure', low: 'Low', high: 'High' },
  { key: 'complexity', label: 'Complexity', group: 'structure', low: 'Simple', high: 'Complex' },
  { key: 'prose_density', label: 'Prose density', group: 'style', low: 'Spare', high: 'Dense' },
  { key: 'worldbuilding', label: 'Worldbuilding appetite', group: 'structure', low: 'Minimal', high: 'Elaborate' },
  { key: 'chapter_length', label: 'Chapter length', group: 'structure', low: 'Short', high: 'Long' },
  { key: 'book_length', label: 'Book length', group: 'behavior', low: 'Short', high: 'Long' },
  { key: 'series_commitment', label: 'Series commitment', group: 'behavior', low: 'Standalone', high: 'Long series' },
  { key: 'romance', label: 'Romance appetite', group: 'content', low: 'None', high: 'Central' },
  { key: 'spice', label: 'Spice tolerance', group: 'content', low: 'None', high: 'Explicit' },
  { key: 'violence', label: 'Violence tolerance', group: 'content', low: 'Low', high: 'High' },
  { key: 'gore', label: 'Gore tolerance', group: 'content', low: 'Low', high: 'High' },
  { key: 'darkness', label: 'Darkness tolerance', group: 'content', low: 'Light', high: 'Very dark' },
  { key: 'humor', label: 'Humor preference', group: 'content', low: 'Serious', high: 'Funny' },
  { key: 'emotional_intensity', label: 'Emotional intensity', group: 'content', low: 'Restrained', high: 'Intense' },
  { key: 'ambiguous_ending', label: 'Ambiguous-ending tolerance', group: 'structure', low: 'Wants resolution', high: 'Enjoys ambiguity' },
  { key: 'unreliable_narrator', label: 'Unreliable narrator', group: 'style', low: 'Dislikes', high: 'Enjoys' },
  { key: 'multiple_pov', label: 'Multiple POV tolerance', group: 'style', low: 'Prefers single', high: 'Enjoys many' },
  { key: 'nonlinear', label: 'Nonlinear timeline', group: 'style', low: 'Prefers linear', high: 'Enjoys nonlinear' },
  { key: 'pov_person', label: 'POV person', group: 'style', low: 'First person', high: 'Third person' },
  { key: 'present_tense', label: 'Present-tense tolerance', group: 'style', low: 'Dislikes', high: 'Fine with it' },
  { key: 'twist_importance', label: 'Twist importance', group: 'structure', low: 'Unimportant', high: 'Essential' },
  { key: 'ending_satisfaction', label: 'Ending satisfaction importance', group: 'structure', low: 'Flexible', high: 'Critical' },
  { key: 'character_likability', label: 'Character likability importance', group: 'content', low: 'Flexible', high: 'Critical' },
  { key: 'supernatural', label: 'Supernatural appetite', group: 'genre', low: 'Avoids', high: 'Loves' },
  { key: 'scifi', label: 'Science-fiction appetite', group: 'genre', low: 'Avoids', high: 'Loves' },
  { key: 'fantasy', label: 'Fantasy appetite', group: 'genre', low: 'Avoids', high: 'Loves' },
  { key: 'mystery', label: 'Mystery appetite', group: 'genre', low: 'Avoids', high: 'Loves' },
  { key: 'literary_vs_commercial', label: 'Literary vs commercial', group: 'genre', low: 'Commercial', high: 'Literary' },
  { key: 'audiobook_affinity', label: 'Audiobook affinity', group: 'format', low: 'Prefers print', high: 'Prefers audio' },
] as const;

export type ReaderDimensionKey = (typeof READER_DIMENSIONS)[number]['key'];

const DIMENSION_MAP: Record<string, ReaderDimensionDef> = Object.fromEntries(
  READER_DIMENSIONS.map((d) => [d.key, d]),
);

export function dimensionDef(key: string): ReaderDimensionDef | undefined {
  return DIMENSION_MAP[key];
}

/** The evolving state of one Reader DNA dimension. */
export interface DimensionState {
  key: string;
  /** 0..1 current inferred value. */
  value: number;
  /** 0..1 confidence in the value. */
  confidence: number;
  evidenceCount: number;
  supporting: number;
  contradicting: number;
  lastUpdated: string | null;
  userConfirmed: boolean;
  stability: Stability;
}

export interface ReaderDna {
  dimensions: Record<string, DimensionState>;
  /** ISO timestamp of the last update to any dimension. */
  updatedAt: string | null;
}

export function initialReaderDna(): ReaderDna {
  return { dimensions: {}, updatedAt: null };
}

function initState(key: string): DimensionState {
  return {
    key,
    value: 0.5,
    confidence: 0,
    evidenceCount: 0,
    supporting: 0,
    contradicting: 0,
    lastUpdated: null,
    userConfirmed: false,
    stability: 'uncertain',
  };
}

/** One observation about a dimension, e.g. from finishing or abandoning a book. */
export interface Observation {
  key: string;
  /** Observed target value on the axis, 0..1. */
  observed: number;
  /** How strong this signal is, 0..1 (a finish is stronger than a click). */
  weight: number;
  at: string; // ISO timestamp
}

/**
 * Fold one observation into a dimension state. Uses an evidence-weighted running
 * mean toward the observed value; confidence grows with agreeing evidence and is
 * dampened by contradictions. A user-confirmed value resists being moved.
 */
export function applyObservation(
  prev: DimensionState | undefined,
  obs: Observation,
): DimensionState {
  const s = prev ?? initState(obs.key);
  const observed = clamp01(obs.observed);
  const weight = clamp01(obs.weight);

  // Effective learning rate: strong signals move more; confirmed/known values move less.
  const inertia = s.userConfirmed ? 0.25 : 1;
  const priorMass = s.evidenceCount === 0 ? 0 : 1;
  const alpha = (weight * inertia) / (priorMass + weight * inertia + 1);
  const value = clamp01(s.value * (1 - alpha) + observed * alpha);

  // Agreement: did this observation point the same side of 0.5 as the current value?
  const agrees = Math.abs(observed - s.value) <= 0.25;
  const supporting = s.supporting + (agrees ? 1 : 0);
  const contradicting = s.contradicting + (agrees ? 0 : 1);
  const evidenceCount = s.evidenceCount + 1;

  // Confidence: rises with net agreement volume, capped and honest about thin data.
  const net = Math.max(0, supporting - contradicting);
  const confidence = clamp01((net / (net + 4)) * (0.6 + 0.4 * weight));

  return {
    key: s.key,
    value,
    confidence: s.userConfirmed ? Math.max(confidence, 0.8) : confidence,
    evidenceCount,
    supporting,
    contradicting,
    lastUpdated: obs.at,
    userConfirmed: s.userConfirmed,
    stability: stabilityOf(evidenceCount, s.userConfirmed ? 0.9 : confidence),
  };
}

/** Apply a batch of observations, returning a new ReaderDna (immutable). */
export function applyObservations(dna: ReaderDna, observations: Observation[]): ReaderDna {
  if (observations.length === 0) return dna;
  const dimensions = { ...dna.dimensions };
  let latest = dna.updatedAt;
  for (const obs of observations) {
    dimensions[obs.key] = applyObservation(dimensions[obs.key], obs);
    if (!latest || obs.at > latest) latest = obs.at;
  }
  return { dimensions, updatedAt: latest };
}

/** Record an explicit user correction — pins the value and raises confidence. */
export function confirmDimension(
  dna: ReaderDna,
  key: string,
  value: number,
  at: string,
): ReaderDna {
  const prev = dna.dimensions[key] ?? initState(key);
  const next: DimensionState = {
    ...prev,
    value: clamp01(value),
    confidence: 0.85,
    userConfirmed: true,
    lastUpdated: at,
    stability: 'stable',
  };
  return { dimensions: { ...dna.dimensions, [key]: next }, updatedAt: at };
}

/** A human-readable, evidence-grounded explanation for one dimension. */
export function explainDimension(state: DimensionState): string {
  const def = dimensionDef(state.key);
  if (!def) return '';
  const pole = state.value >= 0.5 ? def.high : def.low;
  const strength =
    state.value >= 0.7 || state.value <= 0.3 ? 'a clear' : 'a slight';
  if (state.userConfirmed) {
    return `You told us directly: ${def.label.toLowerCase()} → ${pole}.`;
  }
  if (state.evidenceCount === 0) {
    return `Not enough evidence yet to judge ${def.label.toLowerCase()}.`;
  }
  return (
    `You appear to lean toward ${strength} preference for “${pole}” on ${def.label.toLowerCase()} — ` +
    `${state.supporting} of ${state.evidenceCount} relevant interactions agreed` +
    (state.contradicting > 0 ? ` (${state.contradicting} pushed the other way).` : '.')
  );
}

/** Profile strength: 0..1 across how many dimensions have real evidence. */
export function profileStrength(dna: ReaderDna): number {
  const states = Object.values(dna.dimensions);
  if (states.length === 0) return 0;
  const total = READER_DIMENSIONS.length;
  const meaningful = states.filter((s) => s.evidenceCount > 0 || s.userConfirmed);
  const avgConf =
    meaningful.reduce((a, s) => a + s.confidence, 0) / (meaningful.length || 1);
  return clamp01((meaningful.length / total) * 0.6 + avgConf * 0.4);
}
