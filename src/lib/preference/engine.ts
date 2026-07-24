/**
 * The preference engine — folds an append-only event log into three independent
 * DNA channels (Experience / Attraction / Discovery), each with per-trait beliefs
 * and confidence. Pure and deterministic in `(events, now)`:
 *   - mood signals decay by age; permanent signals never fade;
 *   - a title rejected for a SPECIFIC reason doesn't smear blame across every
 *     axis (the reason carries the cause, so the broad signal is dampened);
 *   - Undo = drop an event and re-derive. Nothing is destructive.
 *
 * No I/O. The authoritative scoring engine in `src/lib/scoring/` is untouched;
 * this consumes its `DIMENSION_KEYS` and produces a personalization signal.
 */
import { DIMENSION_KEYS } from '@/lib/scoring/dimensions';
import type {
  ChannelProfile,
  DnaChannel,
  DnaSignal,
  DnaState,
  PreferenceEvent,
  TraitBelief,
  TraitConfidence,
} from './types';
import { accumulate, emptyBelief, evidenceConfidence, resolveConfidence } from './confidence';
import { primarySignal, reasonSignal } from './signals';

/** A title's dim only counts when it's this far off neutral (else it's uninformative). */
export const MIN_INFO_ABS = 15;
/** Mood evidence half-life, in days. */
export const MOOD_HALFLIFE_DAYS = 14;
/** When an explanatory reason is present, scale the broad dim signal down to this. */
export const BROAD_DAMPEN_WITH_REASON = 0.35;

const DAY_MS = 86_400_000;

function emptyChannel(): ChannelProfile {
  const dims: Record<string, TraitBelief> = {};
  for (const k of DIMENSION_KEYS) dims[k] = emptyBelief();
  return { dims, genres: {}, people: {}, novelty: emptyBelief(), samples: 0 };
}

export function emptyDna(): DnaState {
  return { experience: emptyChannel(), attraction: emptyChannel(), discovery: emptyChannel() };
}

/** Mood decays by half-life; permanent evidence is timeless. */
function decayFactor(signal: DnaSignal, ageMs: number): number {
  if (signal.decay !== 'mood') return 1;
  const ageDays = Math.max(0, ageMs) / DAY_MS;
  return Math.pow(0.5, ageDays / MOOD_HALFLIFE_DAYS);
}

function bump(map: Record<string, TraitBelief>, key: string, target: number, weight: number) {
  map[key] = accumulate(map[key] ?? emptyBelief(), target, weight);
}

/**
 * Apply one resolved signal for one title into its channel. Mutates `channel`.
 * Only the PRIMARY signal (`broad`) learns the title's full fingerprint; reason
 * signals are strictly targeted (their own dims/genres/people), so a specific
 * "why" concentrates blame instead of smearing it across every axis.
 */
function applySignal(
  channel: ChannelProfile,
  signal: DnaSignal,
  event: PreferenceEvent,
  ageMs: number,
  broad: boolean,
  broadDampen: number,
) {
  const decay = decayFactor(signal, ageMs);
  const base = signal.strength * decay;
  if (base <= 0) return;
  const target100 = signal.polarity > 0 ? 100 : 0;

  // 1) Targeted follow-up dims (e.g. "too slow" ⇒ pacing→fast): absolute targets.
  if (signal.dims && signal.dims.length) {
    for (const { key, target } of signal.dims) bump(channel.dims, key, target, base);
  }

  // 2) Broad dimensional learning from the title's fingerprint — PRIMARY only.
  if (broad && !signal.presentationOnly && event.dims) {
    const w = base * broadDampen;
    for (const k of DIMENSION_KEYS) {
      const v = event.dims[k];
      if (typeof v !== 'number') continue;
      const info = Math.abs(v - 50); // 0..50
      if (info < MIN_INFO_ABS) continue; // uninformative axis for this title
      const target = signal.polarity > 0 ? v : 100 - v;
      bump(channel.dims, k, target, w * (info / 50));
    }
  }

  // 3) Genre affinity. The PRIMARY signal learns the title's genres; a reason
  //    learns only what it explicitly names (or the title's genres for the
  //    generic "wrong genre" reason).
  if (!signal.presentationOnly) {
    if ((broad || signal.useTitleGenres) && event.genres) {
      for (const g of event.genres) bump(channel.genres, g, target100, base);
    }
    if (signal.genres) for (const g of signal.genres) bump(channel.genres, g, target100, base);

    // 4) Person affinity — same rule.
    if ((broad || signal.useTitlePeople) && event.people) {
      for (const p of event.people) bump(channel.people, p, target100, base);
    }
    if (signal.people) for (const p of signal.people) bump(channel.people, p, target100, base);
  }

  // 5) Novelty appetite (Discovery mostly).
  if (typeof signal.novelty === 'number' && signal.novelty !== 0) {
    const target = signal.novelty > 0 ? 100 : 0;
    channel.novelty = accumulate(channel.novelty, target, base * Math.abs(signal.novelty));
  }

  channel.samples += 1;
}

/**
 * Fold the whole event log into the three DNA channels as of `now`.
 * Deterministic: same (events, now) ⇒ same state.
 */
export function deriveDna(events: PreferenceEvent[], now: number): DnaState {
  const state = emptyDna();
  for (const event of events) {
    const primary = primarySignal(event);
    if (!primary) continue; // skip = zero DNA
    const ageMs = now - event.at;

    // Resolve explanatory follow-up reasons first, so we know whether to dampen
    // the broad primary signal (a specific reason carries the real cause).
    const reasonSignals: DnaSignal[] = [];
    let hasExplanatoryReason = false;
    for (const r of event.reasons ?? []) {
      const s = reasonSignal(r);
      if (!s) continue;
      reasonSignals.push(s);
      if (!s.presentationOnly && s.decay === 'permanent') hasExplanatoryReason = true;
    }
    const broadDampen = hasExplanatoryReason ? BROAD_DAMPEN_WITH_REASON : 1;

    // "Just not in the mood" makes the WHOLE reaction temporary — it must not
    // become a permanent taste penalty. Reclassify the primary signal to decay,
    // unless a real explanatory reason was also given.
    const moodOnly = (event.reasons ?? []).includes('not_in_the_mood') && !hasExplanatoryReason;
    const primaryToApply = moodOnly ? { ...primary, decay: 'mood' as const } : primary;

    applySignal(channelOf(state, primaryToApply.channel), primaryToApply, event, ageMs, true, broadDampen);
    for (const s of reasonSignals) applySignal(channelOf(state, s.channel), s, event, ageMs, false, 1);
  }
  return state;
}

function channelOf(state: DnaState, channel: DnaChannel): ChannelProfile {
  return state[channel];
}

/**
 * Fold explicit corrections into an override map (dim key → target 0..100),
 * last write wins. Corrections are deliberate user statements that OVERRIDE
 * inferred taste for their axes.
 */
export function deriveCorrections(events: PreferenceEvent[]): Record<string, number> {
  const out: Record<string, number> = {};
  for (const e of events) {
    for (const c of e.corrections ?? []) {
      if (typeof c.target === 'number' && Number.isFinite(c.target)) {
        out[c.key] = Math.min(100, Math.max(0, c.target));
      }
    }
  }
  return out;
}

/** Undo: re-derive without the most recent event. */
export function undoLast(events: PreferenceEvent[]): PreferenceEvent[] {
  return events.slice(0, -1);
}

/** Undo: re-derive without a specific event id (edit DNA forever). */
export function withoutEvent(events: PreferenceEvent[], id: string): PreferenceEvent[] {
  return events.filter((e) => e.id !== id);
}

// ---- Read-outs (for UI, explanation, and the recommender) --------------------

export interface DimReadout extends TraitConfidence {
  key: string;
  label: string;
}

/** Resolve a channel's dimension beliefs into confident, sorted read-outs. */
export function channelDims(channel: ChannelProfile): Record<string, TraitConfidence> {
  const out: Record<string, TraitConfidence> = {};
  for (const k of DIMENSION_KEYS) out[k] = resolveConfidence(channel.dims[k] ?? emptyBelief());
  return out;
}

/** The strongest, most confident traits across a channel (dims + genres). */
export function topTraits(
  channel: ChannelProfile,
  opts: { min?: number; limit?: number } = {},
): Array<{ kind: 'dim' | 'genre' | 'person'; key: string; conf: TraitConfidence }> {
  const min = opts.min ?? 0.35;
  const rows: Array<{ kind: 'dim' | 'genre' | 'person'; key: string; conf: TraitConfidence }> = [];
  for (const k of DIMENSION_KEYS) {
    const conf = resolveConfidence(channel.dims[k] ?? emptyBelief());
    if (conf.confidence >= min && conf.polarity !== 0) rows.push({ kind: 'dim', key: k, conf });
  }
  for (const [g, b] of Object.entries(channel.genres)) {
    const conf = resolveConfidence(b);
    if (conf.confidence >= min && conf.polarity !== 0) rows.push({ kind: 'genre', key: g, conf });
  }
  for (const [p, b] of Object.entries(channel.people)) {
    const conf = resolveConfidence(b);
    if (conf.confidence >= min && conf.polarity !== 0) rows.push({ kind: 'person', key: p, conf });
  }
  rows.sort((a, b) => b.conf.confidence - a.conf.confidence);
  return opts.limit ? rows.slice(0, opts.limit) : rows;
}

/**
 * "You're N% understood" — a smooth 0..100 of how well we know this user's taste,
 * from the evidence we've gathered on the taste axes (Experience + Attraction).
 * Never jumps to certainty from a single answer.
 */
export function understanding(state: DnaState): number {
  let sum = 0;
  for (const k of DIMENSION_KEYS) {
    const ev = (state.experience.dims[k]?.evidence ?? 0) + (state.attraction.dims[k]?.evidence ?? 0);
    sum += evidenceConfidence(ev);
  }
  return Math.round((sum / DIMENSION_KEYS.length) * 100);
}
