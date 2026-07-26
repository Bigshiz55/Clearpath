import { describe, it, expect } from 'vitest';
import { parseAnswer } from './parse';
import { analyze, resolveConflict, titleExpresses, OVERRULE_COUNT } from './contradiction';
import {
  buildProfile, reveal, toDimensionCorrections, coverageSummary, expireTemporary,
  mergeClaims, unconfirmedExceptions, MOOD_TTL_MS,
} from './profile';
import {
  nextQuestion, expectedGain, QUESTION_BANK, QUESTION_COUNT, conflictQuestionId, progress,
  parseFollowUpId,
} from './questions';
import {
  startSession, answerQuestion, currentQuestion, toReview, reviewItems, canApply,
  applyReview, undoApply, forgetSession, skipQuestion, sessionReveal, applyDecisions,
} from './session';
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

// ── Question engine ────────────────────────────────────────────────────────

describe('the adaptive question engine', () => {
  const empty = profileOf([]);
  const state = (over: Partial<Parameters<typeof nextQuestion>[0]> = {}) => ({
    mode: 'quick' as const, asked: [], profile: empty, claims: [], ...over,
  });

  it('opens with an opening question', () => {
    expect(nextQuestion(state())?.stage).toBe('opening');
  });

  it('stops asking about what it already knows', () => {
    const known = profileOf(parseAnswer('I absolutely hate horror and I never watch reality TV', ctx));
    const before = expectedGain(QUESTION_BANK.find((q) => q.id === 'never_again')!, empty);
    const after = expectedGain(QUESTION_BANK.find((q) => q.id === 'never_again')!, known);
    expect(after).toBeLessThan(before);
  });

  it('never repeats a question', () => {
    let s = state({ mode: 'full' as const });
    const seen = new Set<string>();
    for (let i = 0; i < QUESTION_COUNT.full; i++) {
      const q = nextQuestion(s);
      expect(q).not.toBeNull();
      expect(seen.has(q!.id)).toBe(false);
      seen.add(q!.id);
      s = state({ mode: 'full' as const, asked: [...seen] });
    }
  });

  it('ends after the budget', () => {
    const asked = QUESTION_BANK.slice(0, QUESTION_COUNT.quick).map((q) => q.id);
    expect(nextQuestion(state({ asked }))).toBeNull();
  });

  it('a contradiction jumps the queue and does not spend budget', () => {
    const claims = [
      claim({ id: 'a', attribute: 'slow_pace', polarity: 1 }),
      claim({ id: 'b', attribute: 'slow_pace', polarity: -1 }),
    ];
    const p = profileOf(claims);
    const q = nextQuestion(state({ profile: p, claims }));
    expect(q?.kind).toBe('choice');
    expect(q?.id).toBe(conflictQuestionId(p.conflicts[0]!));
    expect(progress(state({ profile: p, claims })).pendingRepairs).toBe(1);
  });

  it('an unstated exception is confirmed, never applied silently', () => {
    const claims = [
      claim({ id: 'r', attribute: 'horror', polarity: -1 }),
      claim({ id: 't', polarity: 1, reaction: 'loved', title: { titleId: 'm:1', text: 'Hereditary', needsConfirmation: false } }),
    ];
    const p = profileOf(claims, { 'm:1': { genres: ['horror'] } });
    expect(unconfirmedExceptions(p, claims)).toHaveLength(1);
    const q = nextQuestion(state({ profile: p, claims }));
    expect(parseFollowUpId(q!.id)?.kind).toBe('exception');
    expect(q?.options?.map((o) => o.value)).toEqual(['exception', 'rule_wrong', 'title_wrong']);
  });

  it('quick is shorter than full', () => {
    expect(QUESTION_COUNT.quick).toBeLessThan(QUESTION_COUNT.full);
  });

  it('every bank question is answerable in a sentence and has a placeholder or options', () => {
    for (const q of QUESTION_BANK) {
      expect(q.prompt.endsWith('?'), q.id).toBe(true);
      expect(Boolean(q.placeholder || q.options), q.id).toBe(true);
    }
  });
});

// ── Session ────────────────────────────────────────────────────────────────

describe('the interview session', () => {
  const sctx = { now: AT };

  function run(answers: string[], mode: 'quick' | 'full' = 'quick') {
    let s = startSession('s1', mode, AT);
    for (const text of answers) {
      const q = currentQuestion(s, sctx);
      if (!q) break;
      s = answerQuestion(s, q.id, text, sctx);
    }
    return s;
  }

  it('records claims from typed answers', () => {
    const s = run(['I loved Severance', 'I hate reality TV']);
    expect(s.claims.length).toBeGreaterThan(1);
    expect(s.answers).toHaveLength(2);
  });

  it('skipping costs nothing', () => {
    let s = startSession('s', 'quick', AT);
    const q = currentQuestion(s, sctx)!;
    s = skipQuestion(s, q.id);
    expect(s.claims).toHaveLength(0);
    expect(currentQuestion(s, sctx)?.id).not.toBe(q.id);
  });

  it('an unparseable answer adds nothing rather than a guess', () => {
    const s = run(['mmm dunno']);
    expect(s.claims).toHaveLength(0);
  });

  it('HARD: nothing is applied until the user reviews it', () => {
    let s = run(['I hate reality TV']);
    s = toReview(s);
    expect(s.stage).toBe('review');
    expect(reviewItems(s).length).toBeGreaterThan(0);
    s = applyReview(s, {}, AT);
    expect(s.stage).toBe('applied');
  });

  it('HARD: a guessed title blocks apply until it is confirmed', () => {
    let s = run(['I loved Ozark']);
    s = toReview(s);
    const item = reviewItems(s).find((i) => i.needsConfirmation);
    expect(item).toBeDefined();
    expect(canApply(s, {}).ok).toBe(false);
    const blocked = applyReview(s, {}, AT);
    expect(blocked.stage).toBe('review');
    const ok = applyReview(s, { [item!.claimId]: 'keep' }, AT);
    expect(ok.stage).toBe('applied');
  });

  it('review shows the user their own words next to what we concluded', () => {
    let s = run(['I hate reality TV']);
    s = toReview(s);
    const item = reviewItems(s)[0]!;
    expect(item.quote).toBe('I hate reality TV');
    expect(item.statement).toMatch(/you avoid reality tv/i);
  });

  it('a review decision can drop, flip or demote a claim', () => {
    const claims = [claim({ id: 'x', attribute: 'horror', polarity: -1 })];
    expect(applyDecisions(claims, { x: 'drop' })).toHaveLength(0);
    expect(applyDecisions(claims, { x: 'flip' })[0]?.polarity).toBe(1);
    expect(applyDecisions(claims, { x: 'mood' })[0]?.durability).toBe('temporary');
    expect(applyDecisions(claims, {})[0]?.reviewed).toBe(true);
  });

  it('an application can be undone', () => {
    let s = run(['I hate reality TV']);
    s = applyReview(toReview(s), {}, AT);
    s = undoApply(s);
    expect(s.stage).toBe('review');
    expect(s.appliedAt).toBeUndefined();
  });

  it('deletion means deletion', () => {
    const s = forgetSession(run(['I hate reality TV', 'I loved Severance']));
    expect(s.claims).toEqual([]);
    expect(s.answers).toEqual([]);
    expect(s.asked).toEqual([]);
  });

  it('resolving a conflict through the session removes the retired claim', () => {
    let s = startSession('s', 'full', AT);
    s = answerQuestion(s, 'pace', 'I love slow burns', { now: AT });
    s = answerQuestion(s, 'attention', 'I hate slow shows', { now: AT });
    const q = currentQuestion(s, sctx);
    expect(parseFollowUpId(q!.id)?.kind).toBe('conflict');
    const before = s.claims.length;
    s = answerQuestion(s, q!.id, 'negative', sctx);
    expect(s.claims.length).toBe(before - 1);
    expect(parseFollowUpId(currentQuestion(s, sctx)?.id ?? '')?.kind).not.toBe('conflict');
  });

  it('"the rule is wrong" drops the rule, not the title', () => {
    let s = startSession('s', 'full', AT);
    s = answerQuestion(s, 'never_again', 'I hate horror', { now: AT });
    s = answerQuestion(s, 'last_loved', 'I loved Hereditary', {
      now: AT, knownTitles: [{ titleId: 'm:1', title: 'Hereditary' }],
    });
    const s2 = { ...s };
    const q = currentQuestion(s2, { now: AT, titleFacts: { 'm:1': { genres: ['horror'] } } });
    expect(parseFollowUpId(q!.id)?.kind).toBe('exception');
    const after = answerQuestion(s2, q!.id, 'rule_wrong', { now: AT });
    expect(after.claims.some((c) => c.attribute === 'horror')).toBe(false);
    expect(after.claims.some((c) => c.title?.text === 'Hereditary')).toBe(true);
  });

  it('the same transcript always produces the same DNA', () => {
    const a = run(['I hate reality TV', 'I loved Severance', 'I like crime']);
    const b = run(['I hate reality TV', 'I loved Severance', 'I like crime']);
    expect(JSON.stringify(a.claims)).toBe(JSON.stringify(b.claims));
    expect(JSON.stringify(sessionReveal(a, sctx))).toBe(JSON.stringify(sessionReveal(b, sctx)));
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
