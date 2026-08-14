/**
 * ONE LANGUAGE INTERPRETATION, NOT TWO.
 *
 * The defect this pins is not a bad regex — it is TWO OWNERS for one sentence.
 * `/api/ask` interpreted the user's words, and then interpreted them AGAIN with
 * a different instrument, and the two readings disagreed:
 *
 *   "Give me a Stallone movie."
 *     canonical reading   person = Stallone
 *     second reading      subjectCanonical = "stallone", subjectStrict = true
 *     what shipped        0 titles — nothing is ABOUT an actor
 *
 *   "I watched 3 movies yesterday. Give me a Stallone movie."
 *     canonical reading   requestedCount = 1
 *     second reading      parseRequestedCount(whole utterance) = 3
 *     resolvePersonId      sent TMDB the string "watched yesterday stallone"
 *
 * Wiring `interpret()` in while leaving those calls underneath would have been
 * cosmetic — the same architectural defect with a canonical layer sitting on
 * top of it. So the invariant is structural: on the canonical execution path,
 * semantics that `CanonicalIntent` already owns may not be re-derived from the
 * raw utterance.
 *
 * SCOPED, NOT GLOBAL. `/api/finder` and asks that produce no canonical request
 * still legitimately need these helpers during migration, and banning the
 * modules outright would break work that is not finished. What is forbidden is
 * reaching them AFTER interpretation on the path interpretation owns — which is
 * why this reads the branch structure rather than merely grepping for names.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = join(__dirname, '..', '..', '..');
const route = readFileSync(join(ROOT, 'src/app/api/ask/route.ts'), 'utf8');

/** The raw-language helpers whose job CanonicalIntent has taken over. */
const RAW_LANGUAGE_HELPERS = [
  // PR #69 upgraded `resolvePersonId` to `resolvePerson` (same whole-utterance
  // reader, now also reporting what it spent). The fence contract transfers to
  // the successor unchanged.
  { name: 'resolvePerson', owns: 'person identity' },
  { name: 'parseRequestedCount', owns: 'requested count' },
  { name: 'applyRequiredSubject', owns: 'required subject' },
] as const;

/** Comments describe the fence; only executable text can breach it. */
const stripComments = (src: string) =>
  src.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/^\s*\/\/.*$/gm, ' ');

/**
 * THE REGION THIS INVARIANT GOVERNS.
 *
 * Earlier branches — exact title, the Critic's comparatives, the conversational
 * turn, AI discovery, "more like X" — each RETURN before interpretation
 * happens, and they are explicitly out of scope for this step. So the fence is
 * checked from the point the canonical reading is established to the end of the
 * handler: that, and only that, is the canonical execution path.
 */
const FENCE = 'const canonicalOwnsLanguage';
const canonicalRegion = (() => {
  const src = stripComments(route);
  const at = src.indexOf(FENCE);
  if (at < 0) throw new Error('the canonical fence is missing from /api/ask');
  return src.slice(at);
})();

/**
 * THE CONDITION THAT ACTUALLY GOVERNS A CALL.
 *
 * A fixed lookbehind window cannot answer this: the canonical branch is a
 * thousand characters long, so its `else` arm sits far past any sane window and
 * a window wide enough to reach the fence would also swallow unrelated code and
 * pass calls it should fail. So the brace structure is walked instead — find
 * the block the call is in, and if that block is an `else`, walk back along the
 * chain to the `if` that opened it. What comes back is the real guard.
 */
function governingCondition(src: string, callIdx: number): string {
  /* A braceless guard on the same statement — `if (cond) limit = f(text);` —
     governs the call without opening a block, so it is checked before the
     brace walk, which would otherwise step straight past it to the enclosing
     block and report the wrong condition. */
  const stmtStart = Math.max(
    src.lastIndexOf(';', callIdx),
    src.lastIndexOf('{', callIdx),
    src.lastIndexOf('}', callIdx),
  );
  const statement = src.slice(stmtStart + 1, callIdx);
  const inline = /\bif\s*\(([\s\S]*?)\)\s*[^;{]*$/.exec(statement);
  if (inline?.[1]) return inline[1];

  let idx = callIdx;
  for (let guard = 0; guard < 50; guard++) {
    // Nearest enclosing `{`.
    let depth = 0;
    let brace = -1;
    for (let i = idx - 1; i >= 0; i--) {
      const ch = src[i];
      if (ch === '}') depth++;
      else if (ch === '{') {
        if (depth === 0) { brace = i; break; }
        depth--;
      }
    }
    if (brace < 0) return '';
    const head = src.slice(0, brace).trimEnd();

    const elseIf = /\belse\s+if\s*\(([\s\S]*)\)$/.exec(head);
    const bareElse = /\belse$/.test(head);
    if (!elseIf && !bareElse) {
      // A plain `if (...) {` — this is the guard.
      const plain = /\bif\s*\(([\s\S]*)\)$/.exec(head);
      return plain?.[1] ?? head.slice(-200);
    }
    // An `else` arm: step back over the sibling block to its `if`.
    const closeAt = head.lastIndexOf('}');
    if (closeAt < 0) return head.slice(-200);
    idx = closeAt;
    if (elseIf?.[1] && /canonicalOwnsLanguage/.test(elseIf[1])) return elseIf[1];
  }
  return '';
}

/** Every executable call site of `fn` after the fence, with its governing condition. */
function callSites(fn: string): string[] {
  const out: string[] = [];
  const re = new RegExp(`\\b${fn}\\s*\\(`, 'g');
  let m: RegExpExecArray | null;
  while ((m = re.exec(canonicalRegion)) !== null) {
    out.push(governingCondition(canonicalRegion, m.index));
  }
  return out;
}

describe('the canonical path does not re-read the raw utterance', () => {
  it.each(RAW_LANGUAGE_HELPERS)(
    'every $name call is fenced off the canonical path (it owns $owns)',
    ({ name }) => {
      const sites = callSites(name);
      expect(sites.length, `${name} is not called at all — the fence has nothing to guard`).toBeGreaterThan(0);

      for (const before of sites) {
        expect(
          /canonicalOwnsLanguage/.test(before),
          `${name}() is reachable after interpretation without a canonical fence. `
            + `CanonicalIntent already carries this meaning; reading it out of the raw `
            + `sentence again is the double interpretation this layer removes.`,
        ).toBe(true);
      }
    },
  );

  it('the canonical fence actually exists', () => {
    expect(route).toMatch(/const canonicalOwnsLanguage\s*=/);
    expect(route).toMatch(/resolveCanonicalExecution\s*\(/);
  });
});

describe('the canonical adapter reads canonical fields only', () => {
  /* Comments in these files NAME the helpers they replace, on purpose — that is
     the record of why the boundary exists. Only code can breach it. */
  const adapter = stripComments(readFileSync(join(ROOT, 'src/lib/ask/canonicalExecution.ts'), 'utf8'));
  const resolver = stripComments(readFileSync(join(ROOT, 'src/lib/ask/personReference.ts'), 'utf8'));

  it.each(['resolvePersonId', 'parseRequestedCount', 'applyRequiredSubject', 'detectGeneralSubject', 'naiveParseQuery'])(
    'the adapter never calls %s',
    (fn) => {
      expect(adapter).not.toContain(fn);
    },
  );

  it('the adapter never receives the raw utterance', () => {
    // Its only input is CanonicalIntent. A `text: string` parameter would be
    // the door through which a second reading walks back in.
    expect(adapter).not.toMatch(/function \w+\([^)]*\btext\s*:\s*string/);
  });

  it('the person resolver takes a span, never a sentence', () => {
    expect(resolver).toMatch(/spokenAs/);
    expect(resolver).not.toContain('stripRequestFrame');
    expect(resolver).not.toContain('NON_NAME');
  });
});
