/**
 * CONTRADICTIONS, EXCEPTIONS AND CONDITIONS.
 *
 * Real taste is full of apparent contradictions, and most of them are not
 * contradictions at all — they are rules with carve-outs. The difference
 * matters, because handling it wrongly produces the two failure modes that make
 * recommenders feel stupid:
 *
 *   * Treat "I hate horror, but I loved The Silence of the Lambs" as a conflict
 *     and you nag the user about something they already explained.
 *   * Treat it as a plain contradiction and overwrite the rule, and you start
 *     serving slashers to someone who does not want them.
 *
 * So this module sorts every tension into one of three buckets:
 *
 *   EXCEPTION  — a rule survives, with a named carve-out. The rule softens; it
 *                does not vanish. Enough carve-outs and we say so rather than
 *                pretending the rule still holds.
 *   CONDITION  — the rule is gated on a fact ("unless there's English audio").
 *                Already attached by the parser; recorded on the belief here.
 *   CONFLICT   — two durable general claims that genuinely disagree, with no
 *                carve-out to explain them. Only the user can settle it, so we
 *                ask instead of picking a winner.
 *
 * Pure. Deterministic. No I/O.
 */
import type { TitleDimensions } from '@/lib/scoring/dimensions';
import type { Claim, Conflict, Exception } from './types';
import { attributeLabel, attributePhrase, dimTargetsFor, attribute } from './lexicon';

/** Each carve-out multiplies the rule's strength by this. */
export const EXCEPTION_SOFTENING = 0.75;
/** A rule never softens below this — a carve-out is not a reversal. */
export const MIN_RULE_STRENGTH = 0.3;
/** At this many carve-outs the "rule" is not really a rule any more. */
export const OVERRULE_COUNT = 3;
/** How close a title's axis has to sit to count as expressing an attribute. */
export const EXPRESS_TOLERANCE = 25;
/** Below this, a claim is too soft to be worth flagging as a conflict. */
export const CONFLICT_FLOOR = 0.4;

/**
 * Attribute pairs that pull in opposite directions. Liking BOTH is a real
 * ambiguity worth asking about; disliking both is not (it just means the middle).
 */
export const OPPOSITE_PAIRS: ReadonlyArray<readonly [string, string]> = [
  ['slow_pace', 'fast_pace'],
  ['dark_tone', 'feel_good'],
  ['character_driven', 'plot_driven'],
  ['serialized', 'episodic'],
  ['epic_stakes', 'intimate_stakes'],
  ['complex_plot', 'background_friendly'],
  ['cynical', 'feel_good'],
] as const;

function oppositeOf(key: string): string | null {
  for (const [a, b] of OPPOSITE_PAIRS) {
    if (a === key) return b;
    if (b === key) return a;
  }
  return null;
}

export interface TitleFacts {
  dims?: TitleDimensions;
  genres?: string[];
}

export interface AnalysisInput {
  claims: Claim[];
  /** What we know about the titles the user named, keyed by titleId. */
  titleFacts?: Record<string, TitleFacts>;
}

export interface Analysis {
  /** Claims with exception softening applied. Same ids, same order. */
  claims: Claim[];
  exceptions: Exception[];
  conflicts: Conflict[];
}

/**
 * Does this title actually express the attribute? Genre membership is decisive;
 * otherwise we check the axes the attribute pins. Returns false when we simply
 * do not know — an unknown fingerprint must never manufacture a tension.
 */
export function titleExpresses(attrKey: string, facts: TitleFacts | undefined): boolean {
  if (!facts) return false;
  const attr = attribute(attrKey);
  if (!attr) return false;

  if (attr.genres && facts.genres) {
    const have = new Set(facts.genres.map((g) => g.toLowerCase()));
    if (attr.genres.some((g) => have.has(g.toLowerCase()))) return true;
  }

  const targets = dimTargetsFor(attrKey, 1);
  if (targets.length === 0 || !facts.dims) return false;
  let matched = 0;
  let known = 0;
  for (const t of targets) {
    const v = facts.dims[t.key];
    if (typeof v !== 'number') continue;
    known += 1;
    if (Math.abs(v - t.target) <= EXPRESS_TOLERANCE) matched += 1;
  }
  return known > 0 && matched * 2 >= known;
}

function isGeneralRule(c: Claim): boolean {
  return c.attribute !== null && !c.title && c.durability !== 'temporary';
}

function exceptionSummary(ruleAttr: string, polarity: -1 | 1, ex: Claim): string {
  const label = attributePhrase(ruleAttr);
  const what = ex.title?.text ?? 'that';
  return polarity === -1
    ? `You avoid ${label} in general — ${what} is an exception.`
    : `You go for ${label} in general — ${what} is an exception.`;
}

function conflictQuestion(attrKey: string, oppositeKey?: string): Conflict['question'] {
  if (oppositeKey) {
    return `You've told me you go for ${attributePhrase(attrKey)} and also ${attributePhrase(oppositeKey)}. Which one usually wins?`;
  }
  return `You've told me you avoid ${attributePhrase(attrKey)} and also that you go for it. Which is closer to the truth?`;
}

function conflictOptions(attrKey: string, oppositeKey?: string): Conflict['options'] {
  if (oppositeKey) {
    return [
      { value: 'positive', label: attributeLabel(attrKey) },
      { value: 'negative', label: attributeLabel(oppositeKey) },
      { value: 'depends', label: 'It depends on my mood' },
    ];
  }
  return [
    { value: 'positive', label: `I do go for ${attributePhrase(attrKey)}` },
    { value: 'negative', label: `I avoid ${attributePhrase(attrKey)}` },
    { value: 'depends', label: 'Depends — sometimes both' },
  ];
}

/**
 * Sort every tension in `claims` into exceptions and conflicts, and soften the
 * rules that got carved out.
 */
export function analyze(input: AnalysisInput): Analysis {
  const claims = input.claims.map((c) => ({ ...c }));
  const byId = new Map(claims.map((c) => [c.id, c]));
  const facts = input.titleFacts ?? {};
  const exceptions: Exception[] = [];
  const seenException = new Set<string>();

  const addException = (rule: Claim, ex: Claim, stated: boolean) => {
    if (!rule.attribute) return;
    const key = `${rule.id}|${ex.id}`;
    if (seenException.has(key)) return;
    seenException.add(key);
    const entry: Exception = {
      ruleClaimId: rule.id,
      ruleAttribute: rule.attribute,
      exceptionClaimId: ex.id,
      stated,
      summary: exceptionSummary(rule.attribute, rule.polarity, ex),
    };
    if (ex.title) entry.title = ex.title;
    if (ex.condition) entry.condition = ex.condition;
    exceptions.push(entry);
  };

  // 1. Stated tensions — the user said "but" themselves, so we take their word
  //    for it and do not need a fingerprint to confirm the link.
  for (const c of claims) {
    for (const againstId of c.contrasts ?? []) {
      const rule = byId.get(againstId);
      if (!rule || !isGeneralRule(rule)) continue;
      if (c.polarity === rule.polarity) continue; // agreement, not tension
      if (c.title) { addException(rule, c, true); continue; }
      if (c.attribute === rule.attribute) { addException(rule, c, true); continue; }
      // "I hate horror but I love a good thriller" — a neighbouring attribute,
      // not a carve-out. Recorded as its own claim; nothing to reconcile.
    }
  }

  // 2. Unstated tensions — a rule they hold, and a title they loved that
  //    plainly has the thing they said they avoid. We surface it as an
  //    exception to confirm, never as a silent reversal.
  const rules = claims.filter(isGeneralRule);
  const titleClaims = claims.filter((c) => c.attribute === null && c.title?.titleId);
  for (const rule of rules) {
    for (const t of titleClaims) {
      if (t.polarity === rule.polarity) continue;
      if ((t.contrasts ?? []).includes(rule.id)) continue; // already stated
      const id = t.title?.titleId;
      if (!id || !rule.attribute) continue;
      if (!titleExpresses(rule.attribute, facts[id])) continue;
      addException(rule, t, false);
    }
  }

  // 3. Soften every carved-out rule. A carve-out narrows a rule; it never
  //    deletes it, and it never flips its sign.
  const perRule = new Map<string, number>();
  for (const e of exceptions) perRule.set(e.ruleClaimId, (perRule.get(e.ruleClaimId) ?? 0) + 1);
  for (const [ruleId, count] of perRule) {
    const rule = byId.get(ruleId);
    if (!rule) continue;
    rule.strength = Math.max(MIN_RULE_STRENGTH, rule.strength * EXCEPTION_SOFTENING ** count);
    rule.scope = rule.scope === 'conditional' ? 'conditional' : 'general';
  }

  // 4. Genuine conflicts: durable general claims that disagree with nothing to
  //    explain them. Conditional and temporary claims are excluded — a gated or
  //    momentary preference is not a contradiction.
  const carvedOut = new Set(exceptions.map((e) => e.ruleClaimId));
  const conflicts: Conflict[] = [];
  const conflictSeen = new Set<string>();

  const eligible = claims.filter(
    (c) =>
      c.attribute !== null &&
      c.durability === 'durable' &&
      c.scope !== 'conditional' &&
      !c.title &&
      c.strength >= CONFLICT_FLOOR,
  );

  for (const a of eligible) {
    for (const b of eligible) {
      if (a.id >= b.id) continue;
      if (!a.attribute || !b.attribute) continue;

      const sameAttrOpposed = a.attribute === b.attribute && a.polarity !== b.polarity;
      const opposedAttrs =
        a.polarity === 1 && b.polarity === 1 && oppositeOf(a.attribute) === b.attribute;
      if (!sameAttrOpposed && !opposedAttrs) continue;
      if (carvedOut.has(a.id) || carvedOut.has(b.id)) continue;

      const positive = a.polarity === 1 ? a : b;
      const negative = a.polarity === 1 ? b : a;
      const attrKey = positive.attribute ?? negative.attribute ?? '';
      const key = `${positive.id}|${negative.id}`;
      if (conflictSeen.has(key)) continue;
      conflictSeen.add(key);

      const opposite = opposedAttrs ? (negative.attribute ?? undefined) : undefined;
      conflicts.push({
        attribute: attrKey,
        positiveClaimId: positive.id,
        negativeClaimId: negative.id,
        question: conflictQuestion(attrKey, opposite),
        options: conflictOptions(attrKey, opposite),
      });
    }
  }

  return { claims, exceptions, conflicts };
}

/**
 * Apply the user's answer to a conflict.
 *
 *  - `positive` / `negative` keep the chosen side and retire the other. The
 *    loser is dropped rather than inverted: they told us which one is true, not
 *    that the opposite is false.
 *  - `depends` keeps both but marks them mood-dependent, so neither hardens
 *    into a rule the recommender enforces.
 */
export function resolveConflict(
  claims: Claim[],
  conflict: Conflict,
  choice: 'positive' | 'negative' | 'depends',
): Claim[] {
  const loserId = choice === 'positive' ? conflict.negativeClaimId : conflict.positiveClaimId;
  return claims
    .filter((c) => (choice === 'depends' ? true : c.id !== loserId))
    .map((c) => {
      if (c.id !== conflict.positiveClaimId && c.id !== conflict.negativeClaimId) return c;
      if (choice === 'depends') {
        return { ...c, durability: 'temporary' as const, reviewed: true, strength: Math.min(c.strength, 0.4) };
      }
      return { ...c, reviewed: true, confidence: Math.min(0.95, c.confidence + 0.1) };
    });
}

/** How many carve-outs a rule has, and whether it has stopped being a rule. */
export function ruleStanding(
  ruleClaimId: string,
  exceptions: Exception[],
): { exceptions: number; overruled: boolean } {
  const n = exceptions.filter((e) => e.ruleClaimId === ruleClaimId).length;
  return { exceptions: n, overruled: n >= OVERRULE_COUNT };
}
