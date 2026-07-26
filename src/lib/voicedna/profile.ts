/**
 * CLAIMS → PROFILE.
 *
 * Folds a pile of claims into the thing the recommender can act on: a lean per
 * attribute, a target per content-DNA axis, a genre affinity, and the carve-outs
 * and conditions that qualify them.
 *
 * Three properties are load-bearing:
 *
 *  1. TEMPORARY NEVER MERGES. Mood claims are kept in their own bucket and
 *     expire. A bad week must not become a permanent rule.
 *  2. EVERY NUMBER IS TRACEABLE. `reveal()` returns the user's own words next
 *     to each belief, so nothing in the DNA read-out is unattributable.
 *  3. COVERAGE IS NOT ACCURACY. `coverage` says how much of the person we have
 *     heard, not how good the recommendations will be — and the copy says so.
 *
 * Pure. The deterministic Watchability engine in `src/lib/scoring/` is untouched;
 * this only feeds the personalization layer.
 */
import { DIMENSION_KEYS } from '@/lib/scoring/dimensions';
import type { Claim, Exception, RevealLine, VoiceProfile, AttributeBelief } from './types';
import { analyze, ruleStanding, type AnalysisInput } from './contradiction';
import { attribute, attributeLabel, attributePhrase, dimTargetsFor } from './lexicon';

/** How much a claim counts, by where it came from. */
export const SOURCE_WEIGHT: Record<Claim['source'], number> = {
  manual_edit: 1.2,
  typed_interview: 1,
  voice_interview: 1,
  quiz: 0.8,
  import: 0.4,
  behaviour: 0.3,
};

/** A gated preference is real, but it should not drive as hard as a plain one. */
export const CONDITIONAL_DISCOUNT = 0.6;

/** Evidence at which an attribute belief is treated as settled. */
export const CONFIDENCE_HALF = 1.5;

/** How long a mood claim survives before it stops shaping anything. */
export const MOOD_TTL_MS = 3 * 24 * 60 * 60 * 1000;

/** Durable claims needed before coverage stops being dominated by volume. */
export const COVERAGE_TARGET_CLAIMS = 12;

const clamp = (n: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, n));

function weightOf(c: Claim): number {
  const base = (SOURCE_WEIGHT[c.source] ?? 0.5) * c.strength * c.confidence;
  return c.scope === 'conditional' ? base * CONDITIONAL_DISCOUNT : base;
}

/** Merge new claims into existing ones, replacing any with the same id. */
export function mergeClaims(existing: Claim[], incoming: Claim[]): Claim[] {
  const byId = new Map(existing.map((c) => [c.id, c]));
  for (const c of incoming) byId.set(c.id, c);
  return Array.from(byId.values());
}

/** Drop mood claims that have aged out. Durable claims are never touched. */
export function expireTemporary(claims: Claim[], now: number, ttlMs = MOOD_TTL_MS): Claim[] {
  return claims.filter((c) => c.durability !== 'temporary' || now - c.at < ttlMs);
}

function emptyBelief(): AttributeBelief {
  return { lean: 0, evidence: 0, confidence: 0, exceptions: [], conditions: [], overruled: false };
}

export interface BuildInput extends AnalysisInput {
  /** Epoch ms, used only to expire mood claims. */
  now: number;
}

/**
 * Build the profile. Runs contradiction analysis first, so the beliefs already
 * reflect softened rules and the conflicts come back unresolved for the user.
 */
export function buildProfile(input: BuildInput): VoiceProfile {
  const live = expireTemporary(input.claims, input.now);
  const analysis = analyze({ claims: live, ...(input.titleFacts ? { titleFacts: input.titleFacts } : {}) });
  const { claims, exceptions, conflicts } = analysis;

  const temporary = claims.filter((c) => c.durability === 'temporary');
  const durable = claims.filter((c) => c.durability !== 'temporary');

  const attributes: Record<string, AttributeBelief> = {};
  const dimSum: Record<string, { wv: number; w: number }> = {};
  const genreSum: Record<string, { lv: number; w: number }> = {};
  for (const k of DIMENSION_KEYS) dimSum[k] = { wv: 0, w: 0 };

  for (const c of durable) {
    if (!c.attribute) continue;
    const w = weightOf(c);
    if (w <= 0) continue;

    const belief = (attributes[c.attribute] ??= emptyBelief());
    belief.lean += c.polarity * c.strength * w;
    belief.evidence += w;
    if (c.condition && !belief.conditions.some((x) => x.text === c.condition?.text)) {
      belief.conditions.push(c.condition);
    }

    for (const t of dimTargetsFor(c.attribute, c.polarity)) {
      const bucket = dimSum[t.key];
      if (!bucket) continue;
      bucket.wv += w * t.target;
      bucket.w += w;
    }

    const attr = attribute(c.attribute);
    for (const g of attr?.genres ?? []) {
      const bucket = (genreSum[g] ??= { lv: 0, w: 0 });
      bucket.lv += c.polarity * c.strength * w;
      bucket.w += w;
    }
  }

  // Normalise leans and attach carve-outs.
  for (const [key, belief] of Object.entries(attributes)) {
    belief.lean = belief.evidence > 0 ? clamp(belief.lean / belief.evidence, -1, 1) : 0;
    belief.confidence = belief.evidence / (belief.evidence + CONFIDENCE_HALF);
    belief.exceptions = exceptions.filter((e) => e.ruleAttribute === key);
    const ruleIds = durable.filter((c) => c.attribute === key).map((c) => c.id);
    belief.overruled = ruleIds.some((id) => ruleStanding(id, exceptions).overruled);
  }

  const dims: VoiceProfile['dims'] = {};
  for (const k of DIMENSION_KEYS) {
    const b = dimSum[k] ?? { wv: 0, w: 0 };
    dims[k] = { pref: b.w > 0 ? b.wv / b.w : 50, evidence: b.w };
  }

  const genres: VoiceProfile['genres'] = {};
  for (const [g, b] of Object.entries(genreSum)) {
    genres[g] = { lean: b.w > 0 ? clamp(b.lv / b.w, -1, 1) : 0, evidence: b.w };
  }

  const titles = claims
    .filter((c) => c.attribute === null && c.title && c.reaction)
    .map((c) => ({ title: c.title!, reaction: c.reaction!, claimId: c.id }));

  const axesCovered = DIMENSION_KEYS.filter((k) => (dims[k]?.evidence ?? 0) >= 0.5).length / DIMENSION_KEYS.length;
  const volume = Math.min(1, durable.length / COVERAGE_TARGET_CLAIMS);
  const coverage = clamp(0.5 * axesCovered + 0.5 * volume, 0, 1);

  return {
    attributes,
    dims,
    genres,
    exceptions,
    conflicts,
    temporary,
    titles,
    claimCount: durable.length,
    coverage,
  };
}

function beliefSentence(key: string, belief: AttributeBelief): string {
  const phrase = attributePhrase(key);
  const mag = Math.abs(belief.lean);
  if (belief.overruled) return `You say you avoid ${phrase}, but you keep making exceptions.`;
  if (belief.lean > 0) {
    if (mag >= 0.7) return `You go for ${phrase}.`;
    if (mag >= 0.4) return `You lean toward ${phrase}.`;
    return `You are mildly drawn to ${phrase}.`;
  }
  if (mag >= 0.7) return `You avoid ${phrase}.`;
  if (mag >= 0.4) return `You lean away from ${phrase}.`;
  return `You are mildly put off by ${phrase}.`;
}

function quoteFor(claims: Claim[], predicate: (c: Claim) => boolean): string {
  return claims.find(predicate)?.quote ?? '';
}

/**
 * The Instant DNA reveal: what we now believe, strongest first, each line
 * carrying the sentence it came from. Rules first, then their carve-outs and
 * conditions, then mood — so the read-out never presents this week as forever.
 */
export function reveal(profile: VoiceProfile, claims: Claim[], limit = 8): RevealLine[] {
  const lines: RevealLine[] = [];

  const ranked = Object.entries(profile.attributes)
    .filter(([, b]) => b.evidence > 0)
    .sort((a, b) => Math.abs(b[1].lean) * b[1].confidence - Math.abs(a[1].lean) * a[1].confidence);

  for (const [key, belief] of ranked.slice(0, limit)) {
    lines.push({
      attribute: key,
      text: beliefSentence(key, belief),
      quote: quoteFor(claims, (c) => c.attribute === key && c.durability !== 'temporary'),
      confidence: belief.confidence,
      durability: 'durable',
      kind: 'rule',
    });

    for (const ex of belief.exceptions.slice(0, 2)) {
      lines.push({
        attribute: key,
        text: ex.summary,
        quote: quoteFor(claims, (c) => c.id === ex.exceptionClaimId),
        confidence: belief.confidence,
        durability: 'durable',
        kind: 'exception',
      });
    }

    for (const cond of belief.conditions.slice(0, 2)) {
      const verb = cond.mode === 'suspends' ? 'except' : 'but only';
      lines.push({
        attribute: key,
        text: `${beliefSentence(key, belief).replace(/\.$/, '')} — ${verb} ${cond.text.replace(/^(they|it|there)\s+/i, '')}.`,
        quote: cond.text,
        confidence: belief.confidence * 0.9,
        durability: 'durable',
        kind: 'condition',
      });
    }
  }

  for (const t of profile.temporary.slice(0, 3)) {
    const what = t.attribute ? attributePhrase(t.attribute) : (t.title?.text ?? 'that');
    lines.push({
      attribute: t.attribute,
      text: t.polarity === 1
        ? `Right now you are after ${what} — I will treat that as a mood, not a rule.`
        : `Right now you are avoiding ${what} — I will treat that as a mood, not a rule.`,
      quote: t.quote,
      confidence: t.confidence,
      durability: 'temporary',
      kind: 'mood',
    });
  }

  return lines;
}

/**
 * The axis corrections this profile implies, for the personalization layer.
 * Only axes with real evidence are emitted — an axis nobody has spoken about
 * stays neutral rather than being pushed to 50 on purpose.
 */
export function toDimensionCorrections(
  profile: VoiceProfile,
  minEvidence = 0.5,
): Array<{ key: string; target: number }> {
  return DIMENSION_KEYS.flatMap((k) => {
    const d = profile.dims[k];
    if (!d || d.evidence < minEvidence) return [];
    return [{ key: k, target: Math.round(clamp(d.pref, 0, 100)) }];
  });
}

/** A one-line summary of coverage, phrased so it cannot be read as accuracy. */
export function coverageSummary(profile: VoiceProfile): string {
  const pct = Math.round(profile.coverage * 100);
  const n = profile.claimCount;
  return `${pct}% — based on ${n} thing${n === 1 ? '' : 's'} you told me. This is how much I know about you, not how accurate my picks will be.`;
}

/** Attributes we have heard nothing about, for the question engine to target. */
export function unknownAttributes(profile: VoiceProfile, keys: readonly string[]): string[] {
  return keys.filter((k) => (profile.attributes[k]?.evidence ?? 0) <= 0);
}

/** Exceptions the user has not yet confirmed — review must surface these. */
export function unconfirmedExceptions(profile: VoiceProfile, claims: Claim[]): Exception[] {
  const reviewed = new Set(claims.filter((c) => c.reviewed).map((c) => c.id));
  return profile.exceptions.filter((e) => !e.stated && !reviewed.has(e.exceptionClaimId));
}

export { attributeLabel };
