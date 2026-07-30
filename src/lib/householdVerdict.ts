/**
 * HOUSEHOLD VERD1CT (pure, no I/O). Group scoring that is explicitly NOT a
 * blind average: a title scoring 95 for one viewer and 35 for another is not a
 * strong joint pick. The joint score leans on the FLOOR (the least-served
 * member), hard objections cap it, wide spreads downgrade it, and every
 * adjustment is explainable in plain language.
 *
 * Deterministic and unit-tested; UI renders its output verbatim (per-member
 * scores + warnings), so the group math is never hidden.
 */

export interface MemberScore {
  name: string;
  /** Predicted individual enjoyment 0–100 (the member's "Your Match"). */
  match: number;
  /** Explicit content objections for THIS title (e.g. "too violent"). */
  objections?: string[];
}

export type HouseholdCall = 'strong' | 'good' | 'toss_up' | 'warning';

export interface HouseholdVerdict {
  /** Joint score 0–100 — floor-weighted, never a plain average. */
  score: number;
  call: HouseholdCall;
  /** The least-served member (the floor the score leans on). */
  floor: { name: string; match: number };
  /** Gap between the best- and least-served members. */
  spread: number;
  /** Every member's own score, for transparent display. */
  perMember: MemberScore[];
  /** Named objections that capped the verdict. */
  objections: { name: string; reason: string }[];
  /** Plain-language reasons for the call, in display order. */
  explanation: string[];
}

export interface HouseholdOptions {
  /** A member scoring below this forces a warning (default 55). */
  minAcceptable?: number;
  /** Who picked the previous title — used only for a fairness note, never to change the score. */
  lastPickedBy?: string;
}

const clamp = (n: number) => Math.max(0, Math.min(100, Math.round(n)));

export function householdVerdict(members: MemberScore[], opts: HouseholdOptions = {}): HouseholdVerdict {
  if (members.length === 0) throw new Error('householdVerdict needs at least one member');
  const minAcceptable = opts.minAcceptable ?? 55;

  const sorted = [...members].sort((a, b) => a.match - b.match);
  const floor = sorted[0]!;
  const best = sorted[sorted.length - 1]!;
  const mean = members.reduce((s, m) => s + m.match, 0) / members.length;
  const spread = best.match - floor.match;

  // Floor-weighted joint score: half the average, half the least-served member.
  let score = clamp(0.5 * mean + 0.5 * floor.match);

  const objections = members.flatMap((m) => (m.objections ?? []).map((reason) => ({ name: m.name, reason })));
  const explanation: string[] = [];

  // A named objection is a hard drag: the group should see it, and the joint
  // score can't pretend it isn't there.
  if (objections.length > 0) {
    score = Math.min(score, 45);
    for (const o of objections) explanation.push(`${o.name} objects: ${o.reason}.`);
  }

  let call: HouseholdCall;
  if (objections.length > 0) {
    call = 'warning';
  } else if (floor.match < minAcceptable || spread > 30) {
    call = 'warning';
    if (floor.match < minAcceptable) {
      explanation.push(`${floor.name} scores only ${floor.match} — below the household minimum of ${minAcceptable}.`);
    }
    if (spread > 30) {
      explanation.push('Strong mismatch. Better solo recommendation than group recommendation.');
    }
  } else if (score >= 80 && floor.match >= 70) {
    call = 'strong';
    explanation.push('No major objections detected.');
  } else if (score >= 65) {
    call = 'good';
    explanation.push(`Works for everyone — weakest fit is ${floor.name} at ${floor.match}.`);
  } else {
    call = 'toss_up';
    explanation.push('Nobody objects, but nobody is excited either.');
  }

  // Fairness note only — never changes the number.
  if (opts.lastPickedBy && members.length > 1 && call !== 'warning') {
    const others = members.filter((m) => m.name !== opts.lastPickedBy);
    if (others.length > 0 && floor.name !== opts.lastPickedBy) {
      explanation.push(`${opts.lastPickedBy} chose last time — this one leans toward ${floor.name}'s taste.`);
    }
  }

  return {
    score,
    call,
    floor: { name: floor.name, match: floor.match },
    spread,
    perMember: members,
    objections,
    explanation,
  };
}
