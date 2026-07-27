import { describe, it, expect } from 'vitest';
import { parseAnswer } from './parse';
import { analyze, resolveConflict, titleExpresses, OVERRULE_COUNT } from './contradiction';
import {
  buildProfile, reveal, toDimensionCorrections, coverageSummary, expireTemporary,
  mergeClaims, unconfirmedExceptions, MOOD_TTL_MS,
} from './profile';
import { MAIN_MAX } from './steps';
import {
  startSession, answerQuestion, currentQuestion, toReview, reviewItems,
  canApply, applyReview, undoApply, forgetSession, skipQuestion, applyDecisions,
  goBack, canGoBack, goDeeper, replay, stillUnclear, discussedTitles, unconfirmedTitles,
  DECISION_OPTIONS,
} from './session';
import { buildProbe, cardFollowUp } from './probe';
import { encodeChips, encodeTitles } from './answerCodec';
import { pickCalibrationTitles, calibrationClaim, calibrationAgreement } from './calibration';
import { audioAvailability, transcribe, TRANSCRIPTION_PROVIDERS } from './audio';
import { findAttributes, dimTargetsFor, isUnactionablePraise, ATTRIBUTES } from './lexicon';
import type { Claim, VoiceProfile } from './types';

const AT = 1_700_000_000_000;
const ctx = { source: 'typed_interview' as const, at: AT };
const profileOf = (claims: Claim[], titleFacts = {}) =>
  buildProfile({ claims, now: AT, titleFacts });

function claim(over: Partial<Claim> & { id: string }): Claim {
  return {
    attribute: null, polarity: 1, strength: 0.8, confidence: 0.85,
    durability: 'durable', scope: 'general', source: 'typed_interview',
    quote: 'test', at: AT, ...over,
  };
}

// ── Lexicon ────────────────────────────────────────────────────────────────

describe('lexicon', () => {
  it('prefers the longest phrase, so "science fiction" is never "fiction"', () => {
    expect(findAttributes('I like science fiction').map((h) => h.key)).toEqual(['sci_fi']);
  });

  it('matches on word boundaries only', () => {
    expect(findAttributes('the suburbs are scarce')).toEqual([]);
  });

  it('does not double-count overlapping phrases', () => {
    const keys = findAttributes('slow shows are slow').map((h) => h.key);
    expect(keys).toEqual(['slow_pace']);
  });

  it('credits the opposite pole when an attribute is disliked', () => {
    const liked = dimTargetsFor('slow_pace', 1);
    const disliked = dimTargetsFor('slow_pace', -1);
    expect(liked.find((d) => d.key === 'pacing')?.target).toBe(10);
    expect(disliked.find((d) => d.key === 'pacing')?.target).toBe(90);
  });

  it('every attribute maps to something actionable or is marked structural', () => {
    for (const a of ATTRIBUTES) {
      expect(Boolean(a.dims?.length || a.genres?.length || a.structural), a.key).toBe(true);
    }
  });

  it('recognises praise that cannot become a filter', () => {
    expect(isUnactionablePraise('the writing was great, well written')).toBe(true);
    expect(isUnactionablePraise('I like horror')).toBe(false);
  });
});

// ── Contradictions, exceptions, conditions ─────────────────────────────────

describe('exceptions versus contradictions', () => {
  it('a stated "but" becomes an exception, not a conflict', () => {
    const claims = parseAnswer('I hate horror, but I loved The Silence of the Lambs', ctx);
    const a = analyze({ claims });
    expect(a.exceptions).toHaveLength(1);
    expect(a.exceptions[0]?.stated).toBe(true);
    expect(a.conflicts).toHaveLength(0);
  });

  it('an exception softens the rule but never flips it', () => {
    const claims = parseAnswer('I hate horror, but I loved The Silence of the Lambs', ctx);
    const before = claims.find((c) => c.attribute === 'horror')?.strength ?? 0;
    const a = analyze({ claims });
    const after = a.claims.find((c) => c.attribute === 'horror');
    expect(after?.strength).toBeLessThan(before);
    expect(after?.polarity).toBe(-1);
    expect(after?.strength).toBeGreaterThanOrEqual(0.3);
  });

  it('enough exceptions and we say the rule has stopped being a rule', () => {
    const rule = claim({ id: 'r', attribute: 'horror', polarity: -1, strength: 0.9 });
    const exs = Array.from({ length: OVERRULE_COUNT }, (_, i) =>
      claim({
        id: `e${i}`, polarity: 1, contrasts: ['r'],
        title: { titleId: `t${i}`, text: `Film ${i}`, needsConfirmation: false },
        reaction: 'loved',
      }),
    );
    const p = profileOf([rule, ...exs]);
    expect(p.attributes.horror?.overruled).toBe(true);
    const line = reveal(p, [rule, ...exs]).find((l) => l.attribute === 'horror');
    expect(line?.text).toMatch(/keep making exceptions/i);
  });

  it('notices an unstated tension from the title fingerprint', () => {
    const claims = [
      claim({ id: 'r', attribute: 'horror', polarity: -1, strength: 0.9 }),
      claim({
        id: 't', polarity: 1, reaction: 'loved',
        title: { titleId: 'movie:274', text: 'The Silence of the Lambs', needsConfirmation: false },
      }),
    ];
    const a = analyze({ claims, titleFacts: { 'movie:274': { genres: ['horror', 'thriller'] } } });
    expect(a.exceptions).toHaveLength(1);
    expect(a.exceptions[0]?.stated).toBe(false);
  });

  it('never invents a tension from a title we know nothing about', () => {
    const claims = [
      claim({ id: 'r', attribute: 'horror', polarity: -1 }),
      claim({ id: 't', polarity: 1, title: { titleId: 'x', text: 'Something', needsConfirmation: false }, reaction: 'loved' }),
    ];
    expect(analyze({ claims }).exceptions).toHaveLength(0);
  });

  it('titleExpresses is false when the fingerprint is missing', () => {
    expect(titleExpresses('horror', undefined)).toBe(false);
    expect(titleExpresses('horror', {})).toBe(false);
  });

  it('flags a genuine contradiction and asks rather than picking a winner', () => {
    const claims = [
      claim({ id: 'a', attribute: 'slow_pace', polarity: 1, quote: 'I love slow burns' }),
      claim({ id: 'b', attribute: 'slow_pace', polarity: -1, quote: 'I hate slow shows' }),
    ];
    const a = analyze({ claims });
    expect(a.conflicts).toHaveLength(1);
    expect(a.conflicts[0]?.question).toMatch(/\?$/);
    expect(a.conflicts[0]?.options.map((o) => o.value)).toContain('depends');
  });

  it('treats liking two opposites as a contradiction worth asking about', () => {
    const claims = [
      claim({ id: 'a', attribute: 'slow_pace', polarity: 1 }),
      claim({ id: 'b', attribute: 'fast_pace', polarity: 1 }),
    ];
    expect(analyze({ claims }).conflicts).toHaveLength(1);
  });

  it('a mood claim never contradicts a rule', () => {
    const claims = [
      claim({ id: 'a', attribute: 'dark_tone', polarity: 1 }),
      claim({ id: 'b', attribute: 'dark_tone', polarity: -1, durability: 'temporary' }),
    ];
    expect(analyze({ claims }).conflicts).toHaveLength(0);
  });

  it('a conditional claim never contradicts a rule — the condition explains it', () => {
    const claims = parseAnswer(
      'I dislike foreign-language titles unless they have English audio. I love foreign films.',
      ctx,
    );
    expect(analyze({ claims }).conflicts).toHaveLength(0);
  });

  it('resolving a conflict retires the loser and does not invert it', () => {
    const claims = [
      claim({ id: 'a', attribute: 'slow_pace', polarity: 1 }),
      claim({ id: 'b', attribute: 'slow_pace', polarity: -1 }),
    ];
    const conflict = analyze({ claims }).conflicts[0]!;
    const kept = resolveConflict(claims, conflict, 'negative');
    expect(kept.map((c) => c.id)).toEqual(['b']);
    expect(kept[0]?.polarity).toBe(-1);
  });

  it('"it depends" keeps both but demotes them to mood', () => {
    const claims = [
      claim({ id: 'a', attribute: 'slow_pace', polarity: 1 }),
      claim({ id: 'b', attribute: 'slow_pace', polarity: -1 }),
    ];
    const conflict = analyze({ claims }).conflicts[0]!;
    const kept = resolveConflict(claims, conflict, 'depends');
    expect(kept).toHaveLength(2);
    expect(kept.every((c) => c.durability === 'temporary')).toBe(true);
  });
});

// ── Profile ────────────────────────────────────────────────────────────────

describe('profile', () => {
  it('keeps mood out of the durable model entirely', () => {
    const claims = parseAnswer("Lately I can't stand anything dark. I hate reality TV.", ctx);
    const p = profileOf(claims);
    expect(p.attributes.dark_tone).toBeUndefined();
    expect(p.attributes.reality).toBeDefined();
    expect(p.temporary).toHaveLength(1);
  });

  it('expires mood claims once they age out, and never durable ones', () => {
    const claims = [
      claim({ id: 'm', attribute: 'dark_tone', durability: 'temporary', at: AT }),
      claim({ id: 'd', attribute: 'horror', durability: 'durable', at: AT }),
    ];
    const later = AT + MOOD_TTL_MS + 1;
    expect(expireTemporary(claims, later).map((c) => c.id)).toEqual(['d']);
    expect(expireTemporary(claims, AT + 1000)).toHaveLength(2);
  });

  it('turns a dislike into an axis target at the opposite pole', () => {
    const p = profileOf(parseAnswer('I hate slow shows', ctx));
    expect(p.dims.pacing?.pref).toBeGreaterThan(70);
  });

  it('discounts a gated preference relative to a plain one', () => {
    const plain = profileOf(parseAnswer('I dislike foreign films', ctx));
    const gated = profileOf(parseAnswer('I dislike foreign films unless they have English audio', ctx));
    expect(gated.attributes.foreign_language?.evidence)
      .toBeLessThan(plain.attributes.foreign_language?.evidence ?? 0);
  });

  it('leaves an axis nobody mentioned at neutral with no evidence', () => {
    const p = profileOf(parseAnswer('I hate reality TV', ctx));
    expect(p.dims.romance?.pref).toBe(50);
    expect(p.dims.romance?.evidence).toBe(0);
    expect(toDimensionCorrections(p).some((d) => d.key === 'romance')).toBe(false);
  });

  it('every reveal line quotes something the user actually said', () => {
    const text = 'I hate horror, but I loved The Silence of the Lambs. I love slow burns.';
    const claims = parseAnswer(text, ctx);
    const lines = reveal(profileOf(claims), claims);
    expect(lines.length).toBeGreaterThan(0);
    for (const l of lines) {
      if (!l.quote) continue;
      expect(text.includes(l.quote) || l.quote.startsWith('Calibration')).toBe(true);
    }
  });

  it('the reveal marks mood as mood', () => {
    const claims = parseAnswer('Tonight I want something feel-good', ctx);
    const line = reveal(profileOf(claims), claims).find((l) => l.kind === 'mood');
    expect(line?.text).toMatch(/mood, not a rule/i);
    expect(line?.durability).toBe('temporary');
  });

  it('coverage is described as knowledge, never as accuracy', () => {
    const p = profileOf(parseAnswer('I hate horror', ctx));
    expect(coverageSummary(p)).toMatch(/how much I know about you, not how accurate/i);
  });

  it('coverage rises as more is said', () => {
    const a = profileOf(parseAnswer('I hate horror', ctx));
    const b = profileOf(parseAnswer(
      'I hate horror. I love slow burns. I like crime and thrillers. I avoid reality TV. I prefer true stories.',
      ctx,
    ));
    expect(b.coverage).toBeGreaterThan(a.coverage);
    expect(b.coverage).toBeLessThanOrEqual(1);
  });

  it('merging claims replaces by id rather than duplicating', () => {
    const a = [claim({ id: 'x', attribute: 'horror', polarity: -1 })];
    const b = [claim({ id: 'x', attribute: 'horror', polarity: 1 })];
    const merged = mergeClaims(a, b);
    expect(merged).toHaveLength(1);
    expect(merged[0]?.polarity).toBe(1);
  });
});
// ── The ten-question interview ─────────────────────────────────────────────

describe('Witness Testimony runs as a ten-question interview', () => {
  const sctx = { now: AT };
  type Q = NonNullable<ReturnType<typeof currentQuestion>>;

  function run(reply: (q: Q, n: number) => string | null, limit = 60) {
    let s = startSession('s1', AT);
    const seen: Q[] = [];
    for (let i = 0; i < limit; i++) {
      const q = currentQuestion(s, sctx);
      if (!q) break;
      seen.push(q);
      const value = reply(q, i);
      s = value === null ? skipQuestion(s, q.id, sctx) : answerQuestion(s, q.id, value, sctx);
    }
    return { session: s, seen };
  }

  const titles = (...t: Array<[string | null, string, string[]?]>) =>
    encodeTitles(t.map(([id, text, genres]) => ({ titleId: id, text, ...(genres ? { genres } : {}) })));

  it('TEST 11: never exceeds ten main questions', () => {
    const { seen } = run(() => null);
    const mains = seen.filter((q) => !q.isFollowUp);
    expect(mains.length).toBeLessThanOrEqual(MAIN_MAX);
    expect(Math.max(...seen.map((q) => q.stepIndex))).toBeLessThanOrEqual(MAIN_MAX);
  });

  it('TEST 12: a follow-up keeps its parent question number', () => {
    const { seen } = run((q) => (q.id === 'favourites' ? titles(['tv:1', 'Sherlock', ['crime']]) : null));
    // The first "why" IS question 2. Extra ones are follow-ups inside it, and
    // asking three of them must not turn question 2 into question 5.
    const whys = seen.filter((q) => q.id.startsWith('why|'));
    expect(whys[0]?.isFollowUp).toBeUndefined();
    expect(whys.every((q) => q.stepIndex === 2)).toBe(true);
  });

  it('opens on question 1 with the favourites prompt', () => {
    const q = currentQuestion(startSession('s', AT), sctx);
    expect(q?.stepIndex).toBe(1);
    expect(q?.prompt).toMatch(/two or three films or shows you absolutely love/i);
    expect(q?.kind).toBe('titles');
    expect(q?.maxTitles).toBe(3);
  });

  it('speaks like an interviewer between questions', () => {
    const { seen } = run(() => null);
    const withTransitions = seen.filter((q) => q.transition);
    expect(withTransitions.length).toBeGreaterThan(2);
    for (const q of withTransitions) expect(q.transition!.length).toBeLessThan(40);
  });

  it('TEST 5: a favourite earns a natural "why", with chips that fit the title', () => {
    const { seen } = run((q) => (q.id === 'favourites' ? titles(['tv:1', 'Sherlock', ['crime', 'mystery']]) : null));
    const why = seen.find((q) => q.id.startsWith('why|'));
    expect(why?.prompt).toBe('What did you love most about Sherlock?');
    const values = why?.options?.map((o) => o.value) ?? [];
    expect(values).toContain('investigation');
    expect(values).toContain('clues');
  });

  it('two or more reasons earn a summary the user can correct', () => {
    const { seen } = run((q) => {
      if (q.id === 'favourites') return titles(['tv:1', 'Sherlock', ['crime']]);
      if (q.id.startsWith('why|')) return encodeChips(['investigation', 'clues']);
      return null;
    });
    const summary = seen.find((q) => q.id.startsWith('summary|'));
    expect(summary?.prompt).toMatch(/have i got that right/i);
    expect(summary?.options?.map((o) => o.label)).toEqual(['Exactly', 'Mostly', 'Not quite']);
  });

  it('"Not quite" drops what we concluded rather than keeping it anyway', () => {
    let s = startSession('s', AT);
    s = answerQuestion(s, 'favourites', titles(['tv:1', 'Sherlock', ['crime']]), sctx);
    const why = currentQuestion(s, sctx)!;
    s = answerQuestion(s, why.id, encodeChips(['investigation', 'clues']), sctx);
    const summary = currentQuestion(s, sctx)!;
    const before = s.claims.filter((c) => c.attribute !== null).length;
    const after = answerQuestion(s, summary.id, 'not_quite', sctx);
    expect(after.claims.filter((c) => c.attribute !== null).length).toBeLessThan(before);
  });

  it('TEST 6: a disappointment earns its own "why", with dislike reasons', () => {
    const { seen } = run((q) => (q.id === 'disappointment' ? titles(['tv:9', 'Succession']) : null));
    const why = seen.find((q) => q.prompt.includes('Succession'));
    expect(why?.prompt).toBe('What let you down about Succession?');
    expect(why?.options?.map((o) => o.value)).toContain('too_slow');
  });

  it('TEST 7: "the story was weak in The Notebook" is read correctly', () => {
    const claims = parseAnswer('The story was weak in The Notebook', ctx);
    const aspect = claims.find((c) => c.aspect === 'story');
    expect(aspect).toBeDefined();
    expect(aspect?.polarity).toBe(-1);
    expect(aspect?.title?.text).toBe('The Notebook');
    const title = claims.find((c) => c.attribute === null && !c.aspect && c.title);
    expect(title?.title?.text).toBe('The Notebook');
    expect(title?.polarity).toBe(-1);
  });

  it('an aspect verdict never becomes a standing preference', () => {
    const claims = parseAnswer('The story was weak in The Notebook', ctx);
    const p = buildProfile({ claims, now: AT });
    // Nothing about "weak stories" is a taste axis, so no axis moved.
    expect(Object.keys(p.attributes)).toHaveLength(0);
  });

  it('TEST 8: "the performances — F1" asks instead of guessing', () => {
    let s = startSession('s', AT);
    s = answerQuestion(s, 'favourites', '', sctx);
    s = answerQuestion(s, 'disappointment', 'The performances — F1', sctx);
    const unresolved = s.claims.find((c) => c.unresolved);
    expect(unresolved).toBeDefined();
    expect(unresolved?.aspect).toBe('acting');

    const q = currentQuestion(s, sctx);
    expect(q?.prompt).toMatch(/how did you feel about the performances in F1\?/i);
    expect(q?.options?.map((o) => o.label)).toEqual([
      'I liked it', 'I disliked it', 'Mixed', 'That is not what I meant',
    ]);
  });

  it('answering the clarification resolves it into a real reading', () => {
    let s = startSession('s', AT);
    s = answerQuestion(s, 'favourites', '', sctx);
    s = answerQuestion(s, 'disappointment', 'The performances — F1', sctx);
    const q = currentQuestion(s, sctx)!;
    const after = answerQuestion(s, q.id, 'negative', sctx);
    const resolved = after.claims.find((c) => c.aspect === 'acting');
    expect(resolved?.unresolved).toBeUndefined();
    expect(resolved?.polarity).toBe(-1);
  });

  it('"that is not what I meant" simply removes it', () => {
    let s = startSession('s', AT);
    s = answerQuestion(s, 'favourites', '', sctx);
    s = answerQuestion(s, 'disappointment', 'The performances — F1', sctx);
    const q = currentQuestion(s, sctx)!;
    expect(answerQuestion(s, q.id, 'not_meant', sctx).claims.some((c) => c.unresolved)).toBe(false);
  });

  it('TEST 9: no filter-oriented failure language exists anywhere', () => {
    let s = startSession('s', AT);
    s = answerQuestion(s, 'favourites', titles(['tv:1', 'F1']), sctx);
    const why = currentQuestion(s, sctx)!;
    s = answerQuestion(s, why.id, encodeChips(['acting']), sctx);
    for (const item of reviewItems(toReview(s))) {
      expect(item.statement).not.toMatch(/cannot turn into a filter/i);
      expect(item.statement).not.toMatch(/filter/i);
    }
  });

  it('a praise-only reason reads as a reason on that title', () => {
    let s = startSession('s', AT);
    s = answerQuestion(s, 'favourites', titles(['tv:1', 'F1']), sctx);
    const why = currentQuestion(s, sctx)!;
    s = answerQuestion(s, why.id, encodeChips(['acting']), sctx);
    const row = reviewItems(toReview(s)).find((i) => i.title?.text === 'F1');
    expect(row?.reason ?? '').not.toBe('');
  });

  it('TEST 4 (quit): stopping is asked about, and mood is not a verdict', () => {
    const { session } = run((q) => {
      if (q.id === 'quit') return titles(['tv:5', 'Westworld']);
      if (q.id.startsWith('dnf_progress|')) return 'most';
      if (q.id.startsWith('why|')) return encodeChips(['wrong_mood']);
      return null;
    });
    const t = session.claims.find((c) => c.title?.text === 'Westworld');
    expect(t?.durability).toBe('temporary');
  });

  it('deal-breakers are graded, and only one grade is a ban', () => {
    const { seen, session } = run((q) => {
      if (q.id === 'dealbreakers') return encodeChips(['gore', 'romance_genre']);
      if (q.id.startsWith('db_strength|gore')) return 'hard';
      if (q.id.startsWith('db_strength|romance_genre')) return 'mild';
      return null;
    });
    expect(seen.filter((q) => q.id.startsWith('db_strength|')).length).toBeGreaterThanOrEqual(2);
    expect(session.claims.find((c) => c.attribute === 'gore')?.hardExclusion).toBe(true);
    expect(session.claims.find((c) => c.attribute === 'romance_genre')?.hardExclusion).toBeUndefined();
  });

  it('the last question gives the user the final word', () => {
    const { seen } = run(() => null);
    const last = seen.filter((q) => !q.isFollowUp).pop();
    expect(last?.stepIndex).toBe(MAIN_MAX);
    expect(last?.prompt).toMatch(/get wrong about your taste/i);
  });

  it('TEST 21: an import means fewer questions, not the same ones', () => {
    let s = startSession('s', AT);
    const loaded = { now: AT, priorEvidence: { subtitles: 9, english_audio: 9, comedy: 9, long_runtime: 9, many_seasons: 9, unfinished: 9, serialized: 9, episodic: 9 } };
    const ids: string[] = [];
    for (let i = 0; i < 40; i++) {
      const q = currentQuestion(s, loaded);
      if (!q) break;
      ids.push(q.id);
      s = skipQuestion(s, q.id, loaded);
    }
    expect(ids).not.toContain('comedy_check');
    expect(ids).not.toContain('subtitles');
  });
});

// ── The movie check ────────────────────────────────────────────────────────

describe('the movie check', () => {
  const sctx = { now: AT };

  it('TEST 13: the interview reaches a title card', () => {
    let s = startSession('s', AT);
    const ids: string[] = [];
    for (let i = 0; i < 40; i++) {
      const q = currentQuestion(s, sctx);
      if (!q) break;
      ids.push(q.kind);
      s = skipQuestion(s, q.id, sctx);
    }
    expect(ids).toContain('card');
  });

  it('TEST 14: the card is chosen from what the user actually said', () => {
    const claims = parseAnswer('I love crime dramas but I hate horror', ctx);
    const spec = buildProbe(buildProfile({ claims, now: AT }));
    expect(spec.ready).toBe(true);
    expect(spec.genres).toContain('crime');
    expect(spec.excludeGenres).toContain('horror');
    expect(spec.rationale).toMatch(/you said you go for crime stories/i);
    expect(spec.rationale).toMatch(/steer clear of horror/i);
  });

  it('refuses to show a card when it has nothing to base it on', () => {
    const spec = buildProbe(buildProfile({ claims: [], now: AT }));
    expect(spec.ready).toBe(false);
    expect(spec.rationale).toBe('');
  });

  it('TEST 15: a reaction to the card updates the DNA', () => {
    let s = startSession('s', AT);
    s = answerQuestion(s, 'movie_check', encodeTitles([{ titleId: 'movie:1', text: 'Prisoners' }], 'loved'), sctx);
    const claim = s.claims.find((c) => c.title?.text === 'Prisoners');
    expect(claim?.reaction).toBe('loved');
    expect(claim?.polarity).toBe(1);
  });

  it('TEST 16: "haven’t seen it" teaches nothing', () => {
    let s = startSession('s', AT);
    s = answerQuestion(s, 'movie_check', encodeTitles([{ titleId: 'movie:1', text: 'Prisoners' }], 'unseen'), sctx);
    expect(s.claims).toHaveLength(0);
  });

  it('offers a short follow-up only where one is worth asking', () => {
    expect(cardFollowUp('looks_right')).toMatch(/\?$/);
    expect(cardFollowUp('not_for_me')).toMatch(/\?$/);
    expect(cardFollowUp('loved')).toBeNull();
  });
});

// ── Moving around ──────────────────────────────────────────────────────────

describe('moving around the interview', () => {
  const sctx = { now: AT };

  it('skipping costs nothing', () => {
    let s = startSession('s', AT);
    const first = currentQuestion(s, sctx)!;
    s = skipQuestion(s, first.id, sctx);
    expect(s.claims).toHaveLength(0);
    expect(currentQuestion(s, sctx)?.id).not.toBe(first.id);
  });

  it('TEST 26: Back restores the previous question and un-does its answer', () => {
    let s = startSession('s', AT);
    s = answerQuestion(s, 'favourites', encodeTitles([{ titleId: 'tv:1', text: 'Sherlock' }]), sctx);
    expect(currentQuestion(s, sctx)?.id).not.toBe('favourites');
    s = goBack(s, sctx);
    expect(currentQuestion(s, sctx)?.id).toBe('favourites');
    expect(s.claims).toHaveLength(0);
  });

  it('Back reverses an answer that MUTATED earlier claims', () => {
    let s = startSession('s', AT);
    // Walk to the deal-breakers question the way a user would.
    for (let i = 0; i < 20; i++) {
      const q = currentQuestion(s, sctx)!;
      if (q.id === 'dealbreakers') break;
      s = skipQuestion(s, q.id, sctx);
    }
    s = answerQuestion(s, 'dealbreakers', encodeChips(['gore']), sctx);
    const grade = currentQuestion(s, sctx)!;
    expect(grade.id).toMatch(/^db_strength\|/);
    s = answerQuestion(s, grade.id, 'hard', sctx);
    expect(s.claims.find((c) => c.attribute === 'gore')?.hardExclusion).toBe(true);
    s = goBack(s, sctx);
    expect(s.claims.find((c) => c.attribute === 'gore')?.hardExclusion).toBeUndefined();
  });

  it('Back at the start is a no-op', () => {
    const s = startSession('s', AT);
    expect(canGoBack(s)).toBe(false);
    expect(goBack(s, sctx).answers).toHaveLength(0);
  });

  it('TEST 25: replaying the log restores the session exactly', () => {
    let s = startSession('s', AT);
    s = answerQuestion(s, 'favourites', encodeTitles([{ titleId: 'tv:1', text: 'Sherlock', genres: ['crime'] }]), sctx);
    const why = currentQuestion(s, sctx)!;
    s = answerQuestion(s, why.id, encodeChips(['investigation']), sctx);
    const restored = replay(s.id, s.answers, sctx);
    expect(JSON.stringify(restored.claims)).toBe(JSON.stringify(s.claims));
    expect(currentQuestion(restored, sctx)?.id).toBe(currentQuestion(s, sctx)?.id);
  });

  it('"ask me more" adds follow-ups, never main questions', () => {
    let s = startSession('s', AT);
    s = answerQuestion(s, 'favourites', encodeTitles([
      { titleId: 'tv:1', text: 'A' }, { titleId: 'tv:2', text: 'B' }, { titleId: 'tv:3', text: 'C' },
    ]), sctx);
    const deeper = goDeeper(s);
    expect(deeper.extraDepth).toBe(1);
    const q = currentQuestion(deeper, sctx);
    expect(q!.stepIndex).toBeLessThanOrEqual(MAIN_MAX);
  });
});

// ── Review ─────────────────────────────────────────────────────────────────

describe('the review', () => {
  const sctx = { now: AT };

  function interviewed() {
    let s = startSession('s', AT);
    s = answerQuestion(s, 'favourites', encodeTitles([{ titleId: 'tv:1', text: 'Sherlock', genres: ['crime'] }]), sctx);
    const why = currentQuestion(s, sctx)!;
    s = answerQuestion(s, why.id, encodeChips(['investigation']), sctx);
    s = answerQuestion(s, 'dealbreakers', encodeChips(['gore']), sctx);
    const grade = currentQuestion(s, sctx)!;
    s = answerQuestion(s, grade.id, 'hard', sctx);
    return toReview(s);
  }

  it('TEST 10: no vague correction buttons survive', () => {
    const labels = Object.values(DECISION_OPTIONS).flat().map((o) => o.label);
    for (const banned of ['Right', 'Backwards', 'Just now', 'Drop it']) {
      expect(labels, banned).not.toContain(banned);
    }
    expect(labels).toContain('Exactly');
    expect(labels).toContain('Yes, that’s it');
  });

  it('every row gets wording that fits what it is', () => {
    for (const item of reviewItems(interviewed())) {
      expect(DECISION_OPTIONS[item.decisionKind].length).toBeGreaterThan(1);
    }
  });

  it('TEST 18: the titles discussed are listed', () => {
    const titles = discussedTitles(interviewed());
    expect(titles).toHaveLength(1);
    expect(titles[0]?.title?.text).toBe('Sherlock');
    expect(titles[0]?.reason).toBeDefined();
  });

  it('TEST 2: unconfirmed titles are enumerable, so a count can never outrun them', () => {
    let s = startSession('s', AT);
    s = answerQuestion(s, 'favourites', encodeTitles([
      { titleId: null, text: 'Ozark' }, { titleId: null, text: 'Gone' },
    ]), sctx);
    const list = unconfirmedTitles(toReview(s));
    expect(list).toHaveLength(2);
    expect(list.map((i) => i.title?.text)).toEqual(['Ozark', 'Gone']);
  });

  it('TEST 19: still-unclear is a short list of names, not a paragraph', () => {
    const unclear = stillUnclear(interviewed(), sctx);
    expect(unclear.length).toBeLessThanOrEqual(3);
    for (const u of unclear) expect(u.length).toBeLessThan(30);
  });

  it('TEST 20: unknown areas never block saving', () => {
    const s = interviewed();
    expect(stillUnclear(s, sctx).length).toBeGreaterThan(0);
    expect(canApply(s, {}, sctx).ok).toBe(true);
  });

  it('TEST 21: a guessed title DOES block saving until it is settled', () => {
    let s = startSession('s', AT);
    s = answerQuestion(s, 'favourites', encodeTitles([{ titleId: null, text: 'Ozark' }]), sctx);
    s = toReview(s);
    const gate = canApply(s, {}, sctx);
    expect(gate.ok).toBe(false);
    expect(gate.blockedBy[0]?.title?.text).toBe('Ozark');
    expect(applyReview(s, {}, AT, sctx).stage).toBe('review');
    const id = gate.blockedBy[0]!.claimId;
    expect(applyReview(s, { [id]: 'confirm' }, AT, sctx).stage).toBe('applied');
  });

  it('an unanswered fragment is never saved', () => {
    let s = startSession('s', AT);
    s = answerQuestion(s, 'favourites', '', sctx);
    s = answerQuestion(s, 'disappointment', 'The performances — F1', sctx);
    const applied = applyReview(toReview(s), {}, AT, sctx);
    expect(applied.claims.some((c) => c.unresolved)).toBe(false);
  });

  it('the review decisions do what they say', () => {
    const claims = [claim({ id: 'x', attribute: 'horror', polarity: -1, strength: 0.8 })];
    expect(applyDecisions(claims, { x: 'remove' })).toHaveLength(0);
    expect(applyDecisions(claims, { x: 'flip' })[0]?.polarity).toBe(1);
    expect(applyDecisions(claims, { x: 'mood' })[0]?.durability).toBe('temporary');
    expect(applyDecisions(claims, { x: 'depends' })[0]?.scope).toBe('conditional');
    expect(applyDecisions(claims, { x: 'soften' })[0]?.strength).toBeLessThan(0.8);
    expect(applyDecisions(claims, { x: 'hard' })[0]?.hardExclusion).toBe(true);
    expect(applyDecisions(claims, {})[0]?.reviewed).toBe(true);
  });

  it('removing a title removes what we concluded from it', () => {
    const s = interviewed();
    const titleClaim = s.claims.find((c) => c.title?.text === 'Sherlock' && c.attribute === null)!;
    const kept = applyDecisions(s.claims, { [titleClaim.id]: 'remove' });
    expect(kept.some((c) => c.title?.text === 'Sherlock')).toBe(false);
  });

  it('TEST 29: what saves is structured, with reasons attached', () => {
    const s = applyReview(interviewed(), {}, AT, sctx);
    expect(s.stage).toBe('applied');
    const reason = s.claims.find((c) => c.attribute === 'investigation');
    expect(reason?.title?.text).toBe('Sherlock');
    expect(reason?.confidence).toBeGreaterThan(0.5);
    expect(reason?.source).toBe('typed_interview');
  });

  it('an application can be undone', () => {
    let s = applyReview(interviewed(), {}, AT, sctx);
    s = undoApply(s);
    expect(s.stage).toBe('review');
    expect(s.appliedAt).toBeUndefined();
  });

  it('deletion means deletion', () => {
    const s = forgetSession(interviewed());
    expect(s.claims).toEqual([]);
    expect(s.answers).toEqual([]);
  });
});


// ── Calibration ────────────────────────────────────────────────────────────

describe('five-title calibration', () => {
  const pool = Array.from({ length: 20 }, (_, i) => ({
    titleId: `t${i}`,
    title: `Title ${i}`,
    dims: Object.fromEntries(
      ['pacing', 'darkness', 'warmth', 'humor', 'suspense', 'emotion', 'complexity', 'realism',
       'character', 'stakes', 'morality', 'violence', 'attention', 'serialized', 'romance']
        .map((k, j) => [k, (i * 17 + j * 31) % 101]),
    ),
  }));

  it('picks five, all different', () => {
    const picks = pickCalibrationTitles(pool, profileOf([]));
    expect(picks).toHaveLength(5);
    expect(new Set(picks.map((p) => p.titleId)).size).toBe(5);
  });

  it('is deterministic', () => {
    const p = profileOf([]);
    expect(pickCalibrationTitles(pool, p).map((x) => x.titleId))
      .toEqual(pickCalibrationTitles(pool, p).map((x) => x.titleId));
  });

  it('does not ask about titles the user already named', () => {
    const picks = pickCalibrationTitles(pool, profileOf([]), { exclude: new Set(['t0', 't1']) });
    expect(picks.map((p) => p.titleId)).not.toContain('t0');
  });

  it('each pick explains what it is testing', () => {
    for (const p of pickCalibrationTitles(pool, profileOf([]))) {
      expect(p.reason.length).toBeGreaterThan(10);
    }
  });

  it('diversifies rather than picking five near-clones', () => {
    const picks = pickCalibrationTitles(pool, profileOf([]));
    const pacing = picks.map((p) => p.dims.pacing ?? 50);
    expect(Math.max(...pacing) - Math.min(...pacing)).toBeGreaterThan(20);
  });

  it('having watched something outweighs thinking it looks good', () => {
    const seen = calibrationClaim(pool[0]!, 'seen_liked', { at: AT });
    const guess = calibrationClaim(pool[0]!, 'would_watch', { at: AT });
    expect(seen!.strength).toBeGreaterThan(guess!.strength);
  });

  it('skipping teaches nothing', () => {
    expect(calibrationClaim(pool[0]!, 'skip', { at: AT })).toBeNull();
  });

  it('reports agreement honestly, and reports nothing when it knows nothing', () => {
    const blank: VoiceProfile = profileOf([]);
    const verdicts = Object.fromEntries(pool.slice(0, 5).map((p) => [p.titleId, 'would_watch' as const]));
    const r = calibrationAgreement(pool.slice(0, 5), verdicts, blank);
    expect(r.agreed).toBe(0); // no evidence yet — we do not claim to have predicted anything
    expect(r.answered).toBe(5);
  });
});

// ── Audio ──────────────────────────────────────────────────────────────────

describe('spoken answers', () => {
  it('reports unavailable when no transcription key is configured', () => {
    const a = audioAvailability({});
    expect(a.available).toBe(false);
    expect(a.providerId).toBeNull();
    expect(a.message).toMatch(/no transcription service is configured/i);
    expect(a.message).toMatch(/type your answers/i);
  });

  it('never returns a credential value, only whether one is present', () => {
    const a = audioAvailability({ VOICE_TRANSCRIPTION_API_KEY: 'super-secret-value' });
    expect(JSON.stringify(a)).not.toContain('super-secret-value');
    expect(a.available).toBe(true);
    expect(a.providerId).toBe('whisper');
  });

  it('treats blank and whitespace keys as unconfigured', () => {
    expect(audioAvailability({ VOICE_TRANSCRIPTION_API_KEY: '   ' }).available).toBe(false);
  });

  it('fails loudly rather than returning an empty transcript', async () => {
    await expect(transcribe(new ArrayBuffer(4), {})).rejects.toThrow(/UNCONFIGURED/);
    await expect(transcribe(new ArrayBuffer(4), { DEEPGRAM_API_KEY: 'k' })).rejects.toThrow(/NOT_IMPLEMENTED/);
  });

  it('does not reuse another service credential to enable itself', () => {
    const envVars = TRANSCRIPTION_PROVIDERS.map((p) => p.envVar);
    expect(envVars).not.toContain('OPENAI_API_KEY');
    expect(envVars).not.toContain('TMDB_API_KEY');
    expect(envVars.every((v) => !v.startsWith('NEXT_PUBLIC_'))).toBe(true);
  });
});
