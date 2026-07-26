import { describe, it, expect } from 'vitest';
import { parseAnswer } from './parse';
import { analyze, resolveConflict, titleExpresses, OVERRULE_COUNT } from './contradiction';
import {
  buildProfile, reveal, toDimensionCorrections, coverageSummary, expireTemporary,
  mergeClaims, unconfirmedExceptions, MOOD_TTL_MS,
} from './profile';
import {
  parseFollowUpId, PROGRESS_LABELS, MAIN_COUNT, STAGE_ORDER,
} from './questions';
import {
  startSession, answerQuestion, currentQuestion, toReview, reviewItems, reviewSections,
  canApply, applyReview, undoApply, forgetSession, skipQuestion, applyDecisions,
  goBack, canGoBack, replay, sectionOf, sessionProgress, stillUnclear,
} from './session';
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

// ── The adaptive interview engine ──────────────────────────────────────────

describe('the interview asks a real sequence of questions', () => {
  const sctx = { now: AT };

  /** Drive the interview, answering with whatever the handler returns. */
  function run(
    reply: (q: NonNullable<ReturnType<typeof currentQuestion>>, n: number) => string | null,
    mode: 'quick' | 'full' = 'full',
    limit = 40,
  ) {
    let s = startSession('s1', mode, AT);
    const seen: NonNullable<ReturnType<typeof currentQuestion>>[] = [];
    for (let i = 0; i < limit; i++) {
      const q = currentQuestion(s, sctx);
      if (!q) break;
      seen.push(q);
      const value = reply(q, i);
      s = value === null
        ? skipQuestion(s, q.id, sctx)
        : answerQuestion(s, q.id, value, sctx);
    }
    return { session: s, seen };
  }

  const titles = (...t: Array<[string | null, string, string[]?]>) =>
    encodeTitles(t.map(([id, text, genres]) => ({
      titleId: id, text, ...(genres ? { genres } : {}),
    })));

  it('opens by asking for favourite titles, not for a life story', () => {
    const q = currentQuestion(startSession('s', 'quick', AT), sctx);
    expect(q?.id).toBe('fav_titles');
    expect(q?.kind).toBe('titles');
    expect(q?.maxTitles).toBe(3);
    expect(q?.stageLabel).toBe('Your favourites');
  });

  it('TEST 1+2: three favourites each earn their own follow-up', () => {
    const { seen } = run((q) =>
      q.id === 'fav_titles'
        ? titles(['tv:1', 'Sherlock'], ['tv:2', 'Dexter'], ['movie:3', 'Heat'])
        : null,
    );
    const whys = seen.filter((q) => q.id.startsWith('why|'));
    expect(whys).toHaveLength(3);
    for (const t of ['Sherlock', 'Dexter', 'Heat']) {
      expect(whys.some((q) => q.prompt.includes(t)), t).toBe(true);
    }
  });

  it('TEST 3: the follow-up asks what they loved, with chips that fit the title', () => {
    const { seen } = run((q) => (q.id === 'fav_titles' ? titles(['tv:1', 'Sherlock', ['crime', 'mystery']]) : null));
    const why = seen.find((q) => q.id.startsWith('why|'));
    expect(why?.prompt).toMatch(/what did you love most about sherlock/i);
    const values = why?.options?.map((o) => o.value) ?? [];
    // Crime vocabulary, not the generic one.
    expect(values).toContain('investigation');
    expect(values).toContain('clues');
    expect(why?.allowFreeText).toBe(true);
  });

  it('a science-fiction title gets a different vocabulary than a crime one', () => {
    const chipsFor = (genres: string[]) => {
      const { seen } = run((q) => (q.id === 'fav_titles' ? titles(['tv:1', 'A Show', genres]) : null));
      return seen.find((q) => q.id.startsWith('why|'))?.options?.map((o) => o.value) ?? [];
    };
    expect(chipsFor(['crime'])).toContain('investigation');
    expect(chipsFor(['science-fiction'])).toContain('world');
    expect(chipsFor(['science-fiction'])).not.toContain('investigation');
  });

  it('the reasons actually become beliefs', () => {
    const { session } = run((q) => {
      if (q.id === 'fav_titles') return titles(['tv:1', 'Sherlock', ['crime']]);
      if (q.id.startsWith('why|')) return encodeChips(['investigation', 'clues']);
      return null;
    });
    const p = buildProfile({ claims: session.claims, now: AT });
    expect(p.attributes.investigation?.lean).toBeGreaterThan(0);
    expect(p.attributes.investigation?.evidence).toBeGreaterThan(0);
  });

  it('praise we cannot filter on is recorded, not silently dropped or used', () => {
    const { session } = run((q) => {
      if (q.id === 'fav_titles') return titles(['tv:1', 'A Show']);
      if (q.id.startsWith('why|')) return encodeChips(['acting']);
      return null;
    });
    const note = session.claims.find((c) => c.unactionable);
    expect(note).toBeDefined();
    expect(note?.strength).toBe(0);
    expect(sectionOf(note!)).toBe('Noted, but not used');
  });

  it('TEST 4+5: a disliked title is asked about, with dislike reasons', () => {
    const { seen } = run((q) => (q.id === 'dislike_title' ? titles(['tv:9', 'Succession']) : null));
    const why = seen.find((q) => q.id.startsWith('why|') && q.prompt.includes('Succession'));
    expect(why?.prompt).toMatch(/what did not work about succession/i);
    const values = why?.options?.map((o) => o.value) ?? [];
    expect(values).toContain('too_slow');
    expect(values).toContain('characters');
  });

  it('a dislike reason lands as a negative belief', () => {
    const { session } = run((q) => {
      if (q.id === 'dislike_title') return titles(['tv:9', 'A Show']);
      if (q.id.startsWith('why|')) return encodeChips(['too_slow']);
      return null;
    });
    const p = buildProfile({ claims: session.claims, now: AT });
    expect(p.attributes.slow_pace?.lean).toBeLessThan(0);
  });

  it('TEST 6: an abandoned title is asked how far they got, then why', () => {
    const { seen } = run((q) => (q.id === 'dnf_title' ? titles(['tv:5', 'Westworld']) : null));
    const ids = seen.map((q) => q.id);
    const progressIdx = ids.findIndex((id) => id.startsWith('dnf_progress|'));
    const whyIdx = ids.findIndex((id) => id.startsWith('why|') && seen[ids.indexOf(id)]);
    expect(progressIdx).toBeGreaterThanOrEqual(0);
    expect(seen[progressIdx]?.prompt).toMatch(/how far into westworld/i);
    expect(whyIdx).toBeGreaterThan(progressIdx);
  });

  it('TEST 7: giving up is not automatically a permanent dislike', () => {
    const { session } = run((q) => {
      if (q.id === 'dnf_title') return titles(['tv:5', 'Westworld']);
      if (q.id.startsWith('dnf_progress|')) return 'most';
      if (q.id.startsWith('why|')) return encodeChips(['wrong_mood']);
      return null;
    });
    const title = session.claims.find((c) => c.title?.text === 'Westworld');
    expect(title?.durability).toBe('temporary');
    const p = buildProfile({ claims: session.claims, now: AT });
    expect(p.temporary.some((c) => c.title?.text === 'Westworld')).toBe(true);
  });

  it('but a stated dislike after abandoning IS durable', () => {
    const { session } = run((q) => {
      if (q.id === 'dnf_title') return titles(['tv:5', 'Westworld']);
      if (q.id.startsWith('dnf_progress|')) return 'barely';
      if (q.id.startsWith('why|')) return encodeChips(['disliked', 'pacing']);
      return null;
    });
    const title = session.claims.find((c) => c.title?.text === 'Westworld');
    expect(title?.durability).toBe('durable');
  });

  it('bailing early counts for more than bailing near the end', () => {
    const strengthFor = (progress: string) => {
      const { session } = run((q) => {
        if (q.id === 'dnf_title') return titles(['tv:5', 'A Show']);
        if (q.id.startsWith('dnf_progress|')) return progress;
        if (q.id.startsWith('why|')) return encodeChips(['pacing']);
        return null;
      });
      return session.claims.find((c) => c.attribute === 'slow_pace')?.strength ?? 0;
    };
    expect(strengthFor('barely')).toBeGreaterThan(strengthFor('most'));
  });

  it('TEST 8: picking a genre opens a question about what matters inside it', () => {
    const { seen } = run((q) => (q.id === 'genres' ? encodeChips(['investigation', 'comedy']) : null));
    const depth = seen.find((q) => q.id.startsWith('genre_depth|'));
    expect(depth).toBeDefined();
    expect(depth?.prompt).toMatch(/what matters most/i);
    expect(depth?.options?.map((o) => o.value)).toContain('investigation');
  });

  it('TEST 9: deal-breakers are graded, and only one grade means never-recommend', () => {
    const { seen, session } = run((q) => {
      if (q.id === 'dealbreakers') return encodeChips(['gore', 'romance_genre']);
      if (q.id.startsWith('db_strength|gore')) return 'hard';
      if (q.id.startsWith('db_strength|romance_genre')) return 'mild';
      return null;
    });
    const strengths = seen.filter((q) => q.id.startsWith('db_strength|'));
    expect(strengths.length).toBeGreaterThanOrEqual(2);
    expect(strengths[0]?.options?.map((o) => o.value)).toEqual(
      ['hard', 'strong', 'mild', 'conditional', 'temporary'],
    );

    const gore = session.claims.find((c) => c.attribute === 'gore');
    const romance = session.claims.find((c) => c.attribute === 'romance_genre');
    expect(gore?.hardExclusion).toBe(true);
    expect(romance?.hardExclusion).toBeUndefined();
    expect(romance?.strength).toBeLessThan(gore!.strength);
    expect(sectionOf(gore!)).toBe('Never recommend');
    expect(sectionOf(romance!)).not.toBe('Never recommend');
  });

  it('a picked deal-breaker is never a ban until the user says so', () => {
    const { session } = run((q) => (q.id === 'dealbreakers' ? encodeChips(['violence']) : null));
    const v = session.claims.find((c) => c.attribute === 'violence');
    expect(v).toBeDefined();
    expect(v?.hardExclusion).toBeUndefined();
  });

  it('"fine if the rest is right" becomes a conditional preference', () => {
    const { session } = run((q) => {
      if (q.id === 'dealbreakers') return encodeChips(['violence']);
      if (q.id.startsWith('db_strength|violence')) return 'conditional';
      return null;
    });
    const v = session.claims.find((c) => c.attribute === 'violence');
    expect(v?.scope).toBe('conditional');
    expect(v?.condition?.mode).toBe('suspends');
    expect(sectionOf(v!)).toBe('Conditional tastes');
  });

  it('TEST 10: format questions adapt to the previous answer', () => {
    const askedWith = (choice: string) => {
      const { seen } = run((q) => (q.id === 'movies_or_shows' ? choice : null));
      return seen.map((q) => q.id);
    };
    // Someone who only watches films is not asked about season structure.
    expect(askedWith('movies')).not.toContain('series_shape');
    expect(askedWith('shows')).toContain('series_shape');
    // ...and someone who only watches series is not asked about film runtime.
    expect(askedWith('shows')).not.toContain('runtime');
  });

  it('TEST 21: ground already covered by an import is not asked about again', () => {
    const bare = currentQuestion(
      answerQuestion(startSession('s', 'full', AT), 'fav_titles', '', sctx),
      sctx,
    );
    expect(bare).toBeDefined();

    // With heavy prior evidence on every axis the comedy calibration is pointless.
    const loaded = { now: AT, priorEvidence: { comedy: 9 } };
    let s = startSession('s2', 'full', AT);
    const ids: string[] = [];
    for (let i = 0; i < 30; i++) {
      const q = currentQuestion(s, loaded);
      if (!q) break;
      ids.push(q.id);
      s = skipQuestion(s, q.id, loaded);
    }
    expect(ids).not.toContain('comedy_check');
  });

  it('and comedy IS asked about when nothing has touched it', () => {
    let s = startSession('s3', 'full', AT);
    const ids: string[] = [];
    for (let i = 0; i < 30; i++) {
      const q = currentQuestion(s, sctx);
      if (!q) break;
      ids.push(q.id);
      s = skipQuestion(s, q.id, sctx);
    }
    expect(ids).toContain('comedy_check');
  });

  it('TEST 11+12: a contradiction interrupts, and the answer is stored', () => {
    let s = startSession('s', 'full', AT);
    s = answerQuestion(s, 'fav_titles', 'I love slow burns', sctx);
    s = answerQuestion(s, 'dislike_title', 'I hate slow shows', sctx);
    const q = currentQuestion(s, sctx);
    expect(parseFollowUpId(q!.id)?.kind).toBe('conflict');
    expect(q?.options?.map((o) => o.value)).toContain('depends');
    const after = answerQuestion(s, q!.id, 'negative', sctx);
    expect(after.claims.filter((c) => c.attribute === 'slow_pace')).toHaveLength(1);
  });

  it('TEST 12: a stated exception survives as a conditional carve-out', () => {
    let s = startSession('s', 'full', AT);
    s = answerQuestion(s, 'exception_open', 'I hate sci-fi but I loved Arrival', sctx);
    const p = buildProfile({ claims: s.claims, now: AT });
    expect(p.exceptions).toHaveLength(1);
    expect(p.attributes.sci_fi?.lean).toBeLessThan(0);
    expect(p.attributes.sci_fi?.exceptions).toHaveLength(1);
  });

  it('TEST 19+20: quick is short, full goes deeper', () => {
    const count = (mode: 'quick' | 'full') => run(() => null, mode).seen.length;
    expect(count('quick')).toBeLessThan(count('full'));
    expect(count('quick')).toBeGreaterThanOrEqual(5);
    expect(count('full')).toBeGreaterThanOrEqual(10);
  });

  it('a stage is never revisited once it is behind us', () => {
    const { seen } = run(() => null, 'full');
    const order = seen.filter((q) => !q.isFollowUp).map((q) => STAGE_ORDER.indexOf(q.stage));
    for (let i = 1; i < order.length; i++) {
      expect(order[i]).toBeGreaterThanOrEqual(order[i - 1]!);
    }
  });

  it('never asks the same question twice', () => {
    const { seen } = run(() => null, 'full', 60);
    expect(new Set(seen.map((q) => q.id)).size).toBe(seen.length);
  });

  it('the progress rail names the stage the user is in', () => {
    const s = startSession('s', 'quick', AT);
    const p = sessionProgress(s, sctx);
    expect(PROGRESS_LABELS).toContain(p.stageLabel);
    expect(p.stageIndex).toBe(0);
    expect(p.total).toBe(MAIN_COUNT.quick);
  });
});

// ── Back, skip, and restore ────────────────────────────────────────────────

describe('moving around the interview', () => {
  const sctx = { now: AT };

  it('TEST 14: skipping costs nothing and moves on', () => {
    let s = startSession('s', 'quick', AT);
    const first = currentQuestion(s, sctx)!;
    s = skipQuestion(s, first.id, sctx);
    expect(s.claims).toHaveLength(0);
    expect(currentQuestion(s, sctx)?.id).not.toBe(first.id);
  });

  it('TEST 13: Back returns to the previous question and un-does its answer', () => {
    let s = startSession('s', 'quick', AT);
    const first = currentQuestion(s, sctx)!;
    s = answerQuestion(s, first.id, encodeTitles([{ titleId: 'tv:1', text: 'Sherlock' }]), sctx);
    const second = currentQuestion(s, sctx)!;
    expect(second.id).not.toBe(first.id);

    s = goBack(s, sctx);
    expect(currentQuestion(s, sctx)?.id).toBe(first.id);
    expect(s.claims).toHaveLength(0);
  });

  it('Back genuinely reverses an answer that MUTATED earlier claims', () => {
    let s = startSession('s', 'full', AT);
    s = answerQuestion(s, 'dealbreakers', encodeChips(['gore']), sctx);
    const strength = currentQuestion(s, sctx)!;
    s = answerQuestion(s, strength.id, 'hard', sctx);
    expect(s.claims.find((c) => c.attribute === 'gore')?.hardExclusion).toBe(true);

    s = goBack(s, sctx);
    expect(s.claims.find((c) => c.attribute === 'gore')?.hardExclusion).toBeUndefined();
  });

  it('Back at the very start is a no-op, not a crash', () => {
    const s = startSession('s', 'quick', AT);
    expect(canGoBack(s)).toBe(false);
    expect(goBack(s, sctx).answers).toHaveLength(0);
  });

  it('TEST 15+16: replaying the answer log restores the session exactly', () => {
    let s = startSession('s', 'full', AT);
    s = answerQuestion(s, 'fav_titles', encodeTitles([{ titleId: 'tv:1', text: 'Sherlock', genres: ['crime'] }]), sctx);
    const why = currentQuestion(s, sctx)!;
    s = answerQuestion(s, why.id, encodeChips(['investigation']), sctx);

    const restored = replay(s.id, s.mode, s.answers, sctx);
    expect(JSON.stringify(restored.claims)).toBe(JSON.stringify(s.claims));
    expect(currentQuestion(restored, sctx)?.id).toBe(currentQuestion(s, sctx)?.id);
  });

  it('the same transcript always produces the same DNA', () => {
    const answers = [
      { questionId: 'fav_titles', value: encodeTitles([{ titleId: 'tv:1', text: 'Sherlock' }]), at: AT },
      { questionId: 'genres', value: encodeChips(['investigation']), at: AT },
    ];
    const a = replay('x', 'quick', answers, sctx);
    const b = replay('x', 'quick', answers, sctx);
    expect(JSON.stringify(a.claims)).toBe(JSON.stringify(b.claims));
  });
});

// ── Review ─────────────────────────────────────────────────────────────────

describe('review', () => {
  const sctx = { now: AT };

  function interviewed() {
    let s = startSession('s', 'full', AT);
    s = answerQuestion(s, 'fav_titles', encodeTitles([{ titleId: 'tv:1', text: 'Sherlock', genres: ['crime'] }]), sctx);
    const why = currentQuestion(s, sctx)!;
    s = answerQuestion(s, why.id, encodeChips(['investigation']), sctx);
    s = answerQuestion(s, 'dealbreakers', encodeChips(['gore']), sctx);
    const strength = currentQuestion(s, sctx)!;
    s = answerQuestion(s, strength.id, 'hard', sctx);
    return toReview(s);
  }

  it('TEST 17: everything is grouped into named sections the user can act on', () => {
    const sections = reviewSections(interviewed());
    const names = sections.map((x) => x.name);
    expect(names).toContain('Titles discussed');
    expect(names).toContain('Never recommend');
    expect(sections.every((x) => x.items.length > 0)).toBe(true);
  });

  it('a claim appears in exactly one section, so editing is unambiguous', () => {
    const sections = reviewSections(interviewed());
    const ids = sections.flatMap((x) => x.items.map((i) => i.claimId));
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('every row shows the user their own words', () => {
    for (const item of reviewItems(interviewed())) {
      expect(item.quote.length).toBeGreaterThan(0);
    }
  });

  it('HARD: nothing is applied until the user confirms', () => {
    const s = interviewed();
    expect(s.stage).toBe('review');
    const applied = applyReview(s, {}, AT);
    expect(applied.stage).toBe('applied');
  });

  it('HARD: a hand-typed title blocks the save until it is confirmed', () => {
    let s = startSession('s', 'quick', AT);
    s = answerQuestion(s, 'fav_titles', encodeTitles([{ titleId: null, text: 'Ozark' }]), sctx);
    s = toReview(s);
    const item = reviewItems(s).find((i) => i.needsConfirmation);
    expect(item).toBeDefined();
    expect(canApply(s, {}).ok).toBe(false);
    expect(applyReview(s, {}, AT).stage).toBe('review');
    expect(applyReview(s, { [item!.claimId]: 'keep' }, AT).stage).toBe('applied');
  });

  it('a title chosen from search needs no confirmation', () => {
    let s = startSession('s', 'quick', AT);
    s = answerQuestion(s, 'fav_titles', encodeTitles([{ titleId: 'tv:1', text: 'Sherlock' }]), sctx);
    expect(canApply(toReview(s), {}).ok).toBe(true);
  });

  it('a decision can drop, flip, demote or escalate a claim', () => {
    const claims = [claim({ id: 'x', attribute: 'horror', polarity: -1 })];
    expect(applyDecisions(claims, { x: 'drop' })).toHaveLength(0);
    expect(applyDecisions(claims, { x: 'flip' })[0]?.polarity).toBe(1);
    expect(applyDecisions(claims, { x: 'mood' })[0]?.durability).toBe('temporary');
    expect(applyDecisions(claims, { x: 'hard' })[0]?.hardExclusion).toBe(true);
    expect(applyDecisions(claims, {})[0]?.reviewed).toBe(true);
  });

  it('never-recommend is only ever the user asking for it', () => {
    const s = interviewed();
    // Nothing in the pipeline sets it except the explicit grade and the explicit
    // review action.
    const auto = s.claims.filter((c) => c.hardExclusion && c.attribute !== 'gore');
    expect(auto).toHaveLength(0);
  });

  it('TEST 18: an application can be undone', () => {
    let s = applyReview(interviewed(), {}, AT);
    expect(s.stage).toBe('applied');
    s = undoApply(s);
    expect(s.stage).toBe('review');
    expect(s.appliedAt).toBeUndefined();
  });

  it('it says what it still does not know rather than implying full coverage', () => {
    const unclear = stillUnclear(interviewed(), sctx);
    expect(unclear.length).toBeGreaterThan(0);
    expect(stillUnclear(interviewed(), { now: AT, priorEvidence: { subtitles: 5 } }))
      .not.toContain('Subtitles');
  });

  it('deletion means deletion', () => {
    const s = forgetSession(interviewed());
    expect(s.claims).toEqual([]);
    expect(s.answers).toEqual([]);
    expect(s.asked).toEqual([]);
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
