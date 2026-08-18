import { describe, it, expect } from 'vitest';
import { unresolvedClarification } from './unresolvedResponse';

/**
 * WHEN WE CANNOT SATISFY THE REQUEST, WE SAY SO.
 *
 * ── WHAT THIS COMPLETES ───────────────────────────────────────────────────
 * Execution stopped silently dropping a requirement it could not resolve — it
 * now returns `unresolvedRequirements`. But an internal signal nobody renders
 * is only half the repair: the user still sees a list of films chosen without
 * the one thing they actually specified.
 *
 * The rule, in order of preference:
 *   1. resolve it (normalization, already done upstream), else
 *   2. ASK — naming the closest candidates when we have them, else
 *   3. say plainly that we could not, and return nothing rather than something
 *      unrelated.
 *
 * Never a silent drop. Never unrelated recommendations. Never a confident
 * number standing in for an answer we do not have.
 *
 * PURE. No I/O.
 */

describe('a near miss becomes a question', () => {
  it('offers the closest catalog names as options', () => {
    const c = unresolvedClarification(
      [{ type: 'person', entity: 'Samual L Jackson', reason: 'unresolved' }],
      { 'Samual L Jackson': [{ id: 2231, name: 'Samuel L. Jackson', knownFor: 'Pulp Fiction' }] },
    );
    expect(c).not.toBeNull();
    expect(c!.clarify).toContain('Samual L Jackson');
    expect(c!.clarify.toLowerCase()).toContain('did you mean');
    expect(c!.options[0]).toContain('Samuel L. Jackson');
  });

  it('names several candidates when several are plausible', () => {
    const c = unresolvedClarification(
      [{ type: 'person', entity: 'Jackson', reason: 'unresolved' }],
      {
        Jackson: [
          { id: 1, name: 'Samuel L. Jackson', knownFor: 'Pulp Fiction' },
          { id: 2, name: 'Peter Jackson', knownFor: 'The Lord of the Rings' },
        ],
      },
    );
    expect(c!.options).toHaveLength(2);
  });
});

describe('no near miss is an honest admission, not a guess', () => {
  it('says we could not find them, and offers nothing invented', () => {
    const c = unresolvedClarification([{ type: 'person', entity: 'Zzyzx Nobody', reason: 'unresolved' }], {});
    expect(c).not.toBeNull();
    expect(c!.clarify).toContain('Zzyzx Nobody');
    expect(c!.options).toEqual([]);
  });

  it('an unsupported ROLE is left to the route\'s dedicated refusal', () => {
    /* The route already answers that case by name, saying which credit it
       cannot filter by. A second, vaguer message here would preempt the better
       one, so this returns null and lets it through. */
    expect(unresolvedClarification([{ type: 'person', entity: 'Some Writer', reason: 'unsupported-role' }], {})).toBeNull();
  });

  it('A SPURIOUS SPAN DOES NOT DEAD-END A REQUEST THAT HAS OTHER SUBSTANCE', () => {
    /* "Give me a foreign movie with English audio" extracts a "person" called
       English. The request has real constraints, so it runs on those and the
       miss is disclosed — not turned into a question with no answer. */
    const c = unresolvedClarification(
      [{ type: 'person', entity: 'English', reason: 'unresolved' }],
      {},
      { requestHasOtherConstraints: true },
    );
    expect(c).toBeNull();
  });

  it('but a request that was ONLY that person still asks', () => {
    const c = unresolvedClarification(
      [{ type: 'person', entity: 'Zzyzx Nobody', reason: 'unresolved' }],
      {},
      { requestHasOtherConstraints: false },
    );
    expect(c).not.toBeNull();
  });
});

describe('the guarantees', () => {
  it('nothing unresolved means no clarification — an ordinary request is untouched', () => {
    expect(unresolvedClarification([], {})).toBeNull();
  });

  it('MULTIPLE unresolved requirements are all named — none quietly dropped', () => {
    const c = unresolvedClarification(
      [
        { type: 'person', entity: 'Ghost One', reason: 'unresolved' },
        { type: 'person', entity: 'Ghost Two', reason: 'unresolved' },
      ],
      {},
    );
    expect(c!.clarify).toContain('Ghost One');
    expect(c!.clarify).toContain('Ghost Two');
  });

  it('the clarification never claims a match score', () => {
    const c = unresolvedClarification([{ type: 'person', entity: 'Nobody', reason: 'unresolved' }], {});
    expect(JSON.stringify(c)).not.toMatch(/\b100\b/);
  });
});
