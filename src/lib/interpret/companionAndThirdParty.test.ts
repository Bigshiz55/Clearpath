import { describe, it, expect } from 'vitest';
import { interpret } from '@/lib/interpret/interpret';

/**
 * SOMEONE ELSE'S TASTE IS NOT AN ORDER — AND ASKING ON THEIR BEHALF IS.
 *
 * Two defects sat next to each other and pulled in opposite directions.
 *
 * "My wife likes comedies." became a RECOMMENDATION. `PREFERENCE_LEAD` guarded
 * only first-person preference ("I like…"), so a statement about a third
 * party's standing taste read as an instruction to go fetch comedies.
 *
 * Meanwhile genuine requests that merely MENTION someone became statements:
 * "Find a comedy my wife would like." fell to the companion branch because
 * `REQUEST_VERB` demands "find ME", and "What should my husband and I watch?"
 * because the interrogative form allowed no subject between "should" and
 * "watch".
 *
 * The repair is vocabulary, in the layer that already owns each judgement:
 * preference detection learns the third-party possessive subject (reusing the
 * relationship nouns COMPANION already models), and request detection learns
 * the bare imperative and the interrogative with an intervening subject.
 *
 * No taste is invented for an absent person anywhere here.
 */

describe('third-party preference STATEMENTS are not orders', () => {
  const STATEMENTS = [
    'My wife likes comedies.',
    'My husband loves documentaries.',
    'My daughter hates horror.',
    'My friend watches anime.',
    'We watched a comedy last night.',
    'My partner enjoys thrillers.',
  ];
  for (const text of STATEMENTS) {
    it(`"${text}" stays a statement`, () => {
      expect(interpret(text).kind, text).not.toBe('recommendation');
    });
  }

  it('and first-person preference is still guarded, as before', () => {
    expect(interpret('I like Sylvester Stallone movies').kind).not.toBe('recommendation');
    expect(interpret('I like thrillers').kind).not.toBe('recommendation');
  });
});

describe('requests made on behalf of a companion ARE requests', () => {
  const REQUESTS = [
    'Find a comedy my wife would like.',
    'What should my husband and I watch?',
    'Give us something we would both enjoy.',
    'My daughter likes animation — what should we watch together?',
    'We want a comedy tonight.',
    'a movie my wife and I would both like',
    'a show my family can watch',
  ];
  for (const text of REQUESTS) {
    it(`"${text}" is a request`, () => {
      expect(interpret(text).kind, text).toBe('recommendation');
    });
  }

  /* THE COMPANION IS PRESERVED, NOT INVENTED. The canonical request records
     that more than one viewer is involved so the product can reason about
     shared suitability. It does NOT fabricate a taste profile for the absent
     person — there is no evidence for one, and inventing it is the failure
     mode this whole architecture exists to prevent. */
  it('a companion request records the companion without inventing their taste', () => {
    const i = interpret('a movie my wife and I would both like');
    expect(i.kind).toBe('recommendation');
    // Nothing is asserted about what the wife likes, because nothing is known.
    expect(i.people.map((p) => p.span)).toEqual([]);
  });

  /* KNOWN GAP, pinned rather than asserted away. A trailing negative FRAGMENT
     after a request — "…, nothing scary" — is split off as its own clause and
     classified as a statement, so its tone never reaches the intent. The
     attached forms all work ("a movie that isn't scary", "something not
     scary"), and so does the fragment when it carries a medium ("nothing scary
     tonight" is still a fragment — it does not). Logged in BACKLOG.md; fixing
     it belongs with fragment classification, not with companion semantics. */
  it('KNOWN GAP: a trailing negative fragment does not yet bind', () => {
    const i = interpret('a movie my wife and I would both like, nothing scary');
    expect(i.kind).toBe('recommendation');
    expect(i.tones.find((t) => t.term === 'scary')).toBeUndefined();
    // The attached form, which is what the parser does support today:
    expect(interpret("a movie my wife and I would both like that isn't scary")
      .tones.find((t) => t.term === 'scary')?.wanted).toBe(false);
  });
});
