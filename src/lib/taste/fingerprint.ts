/**
 * TITLE FINGERPRINTS — the candidate side of the canonical vocabulary.
 *
 * A rich user vector is worth nothing if candidates are not described in the
 * same words. Someone whose profile says "wants the uncanny, not merely the
 * grim" can only be served if the catalogue knows which titles are uncanny, and
 * the existing `title_dimensions` cache answers fifteen questions per title.
 *
 * HAND-AUTHORING IS NOT AN ARCHITECTURE. The diagnostic pool's 113 vectors were
 * written by hand, which was right for an instrument and is wrong for a
 * catalogue: it does not reach a thousand titles, it cannot be re-run when the
 * schema changes, and nobody can tell afterwards which numbers were reasoned
 * about and which were typed to fill a row. So curated vectors stay — as a
 * clearly-labelled PROVENANCE, not as the mechanism.
 *
 * WHAT MAKES A CLASSIFICATION PIPELINE AUDITABLE
 *
 * Every fingerprint carries the conditions that produced it: schema version,
 * classifier id, model id, prompt version, and when. That is what makes
 * "reclassify after a schema change" a query rather than an archaeology
 * project — `staleFingerprints` is a filter over recorded metadata, not a guess
 * about which rows are old.
 *
 * IDENTITY IS VERIFIED, NOT ASSUMED. A classifier asked about "Dune" can answer
 * about the wrong Dune, and a fingerprint attached to the wrong tmdbId is worse
 * than a missing one — it is confidently wrong and nothing downstream can tell.
 * So the classifier is handed the identity it must confirm and its answer is
 * checked against it before the row is accepted.
 *
 * CONFIDENCE IS PER AXIS. A classifier reading a synopsis can be sure about
 * `violence` and be guessing at `ambiguity`, and collapsing that into one
 * number per title throws away the distinction the ranker most needs — an axis
 * it is guessing at should move a recommendation less than one it can see.
 *
 * PURE. The I/O lives in the store; everything here is a deterministic function
 * of its inputs, which is what lets the whole pipeline be tested without a
 * network or a key.
 */

import type { TraitEffect } from '@/lib/voice/quickdna/definition';
import type { TitleDimensions } from '@/lib/scoring/dimensions';
import { TASTE_AXIS_KEYS, axisForTrait, TRAIT_ROUTES } from './axes';

/**
 * Bumped whenever the AXIS SET changes. Every stored fingerprint records the
 * version it was produced under, so a schema change turns into a reclassify
 * queue instead of a silent mix of old and new vocabularies in one table.
 */
export const FINGERPRINT_SCHEMA_VERSION = 1;

/** Bumped whenever the classifier's instructions change, independent of the axes. */
export const PROMPT_VERSION = 1;

/**
 * How a fingerprint came to exist. Not decoration — it decides how much to
 * trust the row and whether a re-run should overwrite it.
 *
 * `curated`   hand-authored. Authoritative, never overwritten by a classifier.
 * `classifier` produced by the AI pipeline under the recorded model/prompt.
 * `projected` derived from another representation (e.g. the diagnostic pool's
 *             trait vectors) by a pure, re-runnable transformation.
 */
export type FingerprintSource = 'curated' | 'classifier' | 'projected';

export interface FingerprintProvenance {
  source: FingerprintSource;
  schemaVersion: number;
  promptVersion: number;
  /** Model id for `classifier` rows, e.g. "gpt-4o-mini". Null otherwise. */
  model: string | null;
  /** Epoch ms. Supplied, never read from a clock here. */
  at: number;
}

export interface TitleIdentity {
  tmdbId: number;
  mediaType: 'movie' | 'tv';
  title: string;
  /** Release year. The cheapest guard against the classifier answering about a remake. */
  year: number;
}

export interface TitleFingerprint {
  identity: TitleIdentity;
  /** Canonical axis key → 0..100. Axes the classifier could not judge are ABSENT. */
  axes: Readonly<Record<string, number>>;
  /** Canonical axis key → 0..1. How sure the classifier is about THAT axis. */
  confidence: Readonly<Record<string, number>>;
  /** Genre slugs, for the genre-affinity channel. */
  genres: readonly string[];
  provenance: FingerprintProvenance;
}

/** Deterministic cache key. Same shape `getCachedDimensions` already returns. */
export function fingerprintKey(id: Pick<TitleIdentity, 'tmdbId' | 'mediaType'>): string {
  return `${id.mediaType}-${id.tmdbId}`;
}

/* ------------------------------------------------------------------ *
 * VALIDATION — nothing enters the cache unchecked
 * ------------------------------------------------------------------ */

export interface ValidationResult {
  ok: boolean;
  /** Why it was refused. Empty when `ok`. */
  problems: string[];
  /** Axes present and in range. */
  covered: string[];
  /** Canonical axes this fingerprint says nothing about. */
  missing: string[];
}

/** A title must describe at least this share of the vocabulary to be usable. */
export const MIN_AXIS_COVERAGE = 0.5;

/**
 * Check a fingerprint against the schema AND against the identity it claims.
 *
 * `expected` is the identity we asked about. Passing it is what turns "the
 * classifier returned something" into "the classifier returned something about
 * the right film" — a distinction no downstream consumer can make for itself.
 */
export function validateFingerprint(
  fp: TitleFingerprint,
  expected?: TitleIdentity,
): ValidationResult {
  const problems: string[] = [];
  const covered: string[] = [];

  for (const [key, value] of Object.entries(fp.axes)) {
    if (!TASTE_AXIS_KEYS.includes(key)) {
      problems.push(`unknown axis "${key}" — not in schema v${FINGERPRINT_SCHEMA_VERSION}`);
      continue;
    }
    if (typeof value !== 'number' || !Number.isFinite(value) || value < 0 || value > 100) {
      problems.push(`axis "${key}" is ${String(value)}, expected 0..100`);
      continue;
    }
    const c = fp.confidence[key];
    if (c !== undefined && (!Number.isFinite(c) || c < 0 || c > 1)) {
      problems.push(`confidence for "${key}" is ${String(c)}, expected 0..1`);
      continue;
    }
    covered.push(key);
  }

  const missing = TASTE_AXIS_KEYS.filter((k) => !covered.includes(k));
  if (covered.length / TASTE_AXIS_KEYS.length < MIN_AXIS_COVERAGE) {
    problems.push(
      `covers ${covered.length}/${TASTE_AXIS_KEYS.length} axes, below the ${Math.round(MIN_AXIS_COVERAGE * 100)}% floor`,
    );
  }

  if (expected) {
    /* IDENTITY VERIFICATION. A fingerprint on the wrong title is confidently
       wrong and invisible downstream — far worse than an absent one, because
       nothing later has any way to suspect it. */
    if (fp.identity.tmdbId !== expected.tmdbId) {
      problems.push(`tmdbId ${fp.identity.tmdbId} != requested ${expected.tmdbId}`);
    }
    if (fp.identity.mediaType !== expected.mediaType) {
      problems.push(`mediaType ${fp.identity.mediaType} != requested ${expected.mediaType}`);
    }
    if (normalise(fp.identity.title) !== normalise(expected.title)) {
      problems.push(`title "${fp.identity.title}" != requested "${expected.title}"`);
    }
    // A year off by one is a release-date/region artefact, not a wrong film.
    if (Math.abs(fp.identity.year - expected.year) > 1) {
      problems.push(`year ${fp.identity.year} != requested ${expected.year}`);
    }
  }

  if (fp.provenance.schemaVersion !== FINGERPRINT_SCHEMA_VERSION) {
    problems.push(
      `schema v${fp.provenance.schemaVersion}, current is v${FINGERPRINT_SCHEMA_VERSION}`,
    );
  }

  return { ok: problems.length === 0, problems, covered, missing };
}

function normalise(s: string): string {
  return s
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

/* ------------------------------------------------------------------ *
 * RECLASSIFICATION — a query, not an archaeology project
 * ------------------------------------------------------------------ */

export interface ClassifierVersion {
  schemaVersion: number;
  promptVersion: number;
  model: string;
}

/**
 * Should this row be produced again?
 *
 * Curated rows never go stale from a version bump — a human decided them, and a
 * model re-run must not silently overwrite that. They go stale only when the
 * SCHEMA changes, because a new axis is a question nobody answered yet.
 */
export function needsReclassification(
  fp: TitleFingerprint,
  current: ClassifierVersion = {
    schemaVersion: FINGERPRINT_SCHEMA_VERSION,
    promptVersion: PROMPT_VERSION,
    model: 'gpt-4o-mini',
  },
): boolean {
  if (fp.provenance.schemaVersion !== current.schemaVersion) return true;
  if (fp.provenance.source === 'curated') return false;
  return fp.provenance.promptVersion !== current.promptVersion || fp.provenance.model !== current.model;
}

export function staleFingerprints(
  rows: readonly TitleFingerprint[],
  current?: ClassifierVersion,
): TitleFingerprint[] {
  return rows.filter((r) => needsReclassification(r, current));
}

/* ------------------------------------------------------------------ *
 * COVERAGE — automated detection of missing trait coverage
 * ------------------------------------------------------------------ */

export interface AxisCoverageReport {
  /** Axis → how many titles describe it. */
  perAxis: Record<string, number>;
  /** Axes below the floor, worst first. These are holes in the catalogue. */
  starved: Array<{ key: string; titles: number }>;
  titles: number;
}

/** An axis needs this share of the catalogue behind it to be rankable at all. */
export const MIN_AXIS_TITLE_SHARE = 0.2;

export function axisCoverage(rows: readonly TitleFingerprint[]): AxisCoverageReport {
  const perAxis: Record<string, number> = {};
  for (const k of TASTE_AXIS_KEYS) perAxis[k] = 0;
  for (const r of rows) {
    for (const k of TASTE_AXIS_KEYS) {
      if (typeof r.axes[k] === 'number') perAxis[k] = (perAxis[k] ?? 0) + 1;
    }
  }
  const floor = rows.length * MIN_AXIS_TITLE_SHARE;
  const starved = TASTE_AXIS_KEYS.map((key) => ({ key, titles: perAxis[key] ?? 0 }))
    .filter((a) => a.titles < floor)
    .sort((a, b) => a.titles - b.titles);
  return { perAxis, starved, titles: rows.length };
}

/* ------------------------------------------------------------------ *
 * SPOT-CHECK — comparing two fingerprints of the same title
 * ------------------------------------------------------------------ */

/** How far two answers about one axis may differ before it is worth a human look. */
export const SPOT_CHECK_TOLERANCE = 25;

export interface Disagreement {
  key: string;
  a: number;
  b: number;
  delta: number;
}

/**
 * Where two fingerprints of the same title disagree, worst first.
 *
 * The tool a person uses to decide whether a prompt change was an improvement:
 * run the new classifier over titles that already have curated vectors and look
 * at what moved. A classifier that agrees everywhere learned nothing new; one
 * that disagrees everywhere is broken; the interesting case is the short list in
 * between, and that is what this returns.
 */
export function disagreements(
  a: TitleFingerprint,
  b: TitleFingerprint,
  tolerance = SPOT_CHECK_TOLERANCE,
): Disagreement[] {
  const out: Disagreement[] = [];
  for (const key of TASTE_AXIS_KEYS) {
    const av = a.axes[key];
    const bv = b.axes[key];
    if (typeof av !== 'number' || typeof bv !== 'number') continue;
    const delta = Math.abs(av - bv);
    if (delta >= tolerance) out.push({ key, a: av, b: bv, delta });
  }
  return out.sort((x, y) => y.delta - x.delta);
}

/* ------------------------------------------------------------------ *
 * PROJECTION — curated trait vectors into the canonical vocabulary
 * ------------------------------------------------------------------ */

/**
 * A signed trait pull (-1..1) as a 0..100 axis position.
 *
 * The scale is the one every other fingerprint uses, so a projected row and a
 * classified row are interchangeable to every consumer — which is the property
 * that lets the diagnostic pool be replaced by classified titles without
 * touching anything downstream.
 */
export function pullToAxis(pull: number): number {
  return Math.max(0, Math.min(100, 50 + Math.max(-1, Math.min(1, pull)) * 50));
}

/**
 * Project a curated trait vector into a fingerprint.
 *
 * Genre-routed traits become genre slugs rather than axes, so nothing is lost at
 * the boundary — "likes westerns" reaches the ranker through the channel that
 * means it.
 */
export function projectTraits(
  identity: TitleIdentity,
  traits: readonly TraitEffect[],
  at: number,
  source: FingerprintSource = 'projected',
): TitleFingerprint {
  const pulls: Record<string, number> = {};
  const genres = new Set<string>();

  for (const e of traits) {
    const route = TRAIT_ROUTES[e.key];
    if (route?.kind === 'genre') {
      // Only a POSITIVE assertion implies the genre; an inverted trait says the
      // title is not that thing, which is not an affinity claim about it.
      if (!e.invert && e.strength >= 0.3) genres.add(route.slug);
      continue;
    }
    const mapped = axisForTrait(e.key);
    if (!mapped) continue;
    const signed = (e.invert ? -e.strength : e.strength) * (mapped.invert ? -1 : 1);
    pulls[mapped.axis] = (pulls[mapped.axis] ?? 0) + signed;
  }

  const axes: Record<string, number> = {};
  const confidence: Record<string, number> = {};
  for (const [key, pull] of Object.entries(pulls)) {
    axes[key] = pullToAxis(pull);
    /* CONFIDENCE FROM ASSERTION STRENGTH. A curated vector that says
       `darkness: 1.0` is a firm claim; one that says `0.3` is a lean, and the
       ranker should treat it as one. */
    confidence[key] = Math.min(1, Math.abs(pull));
  }

  return {
    identity,
    axes,
    confidence,
    genres: [...genres].sort(),
    provenance: {
      source,
      schemaVersion: FINGERPRINT_SCHEMA_VERSION,
      promptVersion: PROMPT_VERSION,
      model: null,
      at,
    },
  };
}

/* ------------------------------------------------------------------ *
 * MERGE — the classifier and the curated vector, layered
 * ------------------------------------------------------------------ */

/**
 * Combine a legacy 15-axis classification with a rich fingerprint.
 *
 * THE LEGACY CLASSIFIER WINS ON ITS OWN AXES. It read the real synopsis,
 * keywords and genres for that specific title; a projected vector is an
 * annotation written for a diagnostic instrument, chosen to make a pair
 * separable rather than to describe the film exhaustively. Where both speak,
 * trust the one that looked at the film.
 *
 * Returns the flat `TitleDimensions` shape the ranker already consumes, so the
 * rich axes arrive through the existing pipe rather than a second one.
 */
export function mergeIntoDimensions(
  classified: TitleDimensions | undefined,
  rich: TitleFingerprint | undefined,
): TitleDimensions {
  const out: TitleDimensions = {};
  if (rich) for (const [k, v] of Object.entries(rich.axes)) out[k] = v;
  if (classified) for (const [k, v] of Object.entries(classified)) {
    if (typeof v === 'number' && Number.isFinite(v)) out[k] = v;
  }
  return out;
}
