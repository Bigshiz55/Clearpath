import { describe, it, expect } from 'vitest';
import { parseIntent, scopes, parseRuntime, referenceTitles } from './parseIntent';
import { validateParsed, emptyRequest, requestFingerprint, NEVER_AUTO_RELAX } from './intent';

/**
 * The seven requests in the brief are the acceptance bar for the parser. Each
 * is asserted on the DISTINCTION that makes it hard, not merely on keywords.
 */
describe('the seven mission requests', () => {
  it('1 — separates genre, mood and character trait', () => {
    const r = parseIntent('A gritty science-fiction movie with a strong female lead.');
    expect(r.content_type).toBe('movie');
    expect(r.soft_preferences.genres.map((g) => g.value)).toContain('science_fiction');
    expect(r.soft_preferences.moods.map((m) => m.value)).toContain('gritty');
    expect(r.soft_preferences.character_traits.map((c) => c.value)).toContain('strong_female_lead');
    // Nothing here is a hard constraint — a mood must never remove a title.
    expect(r.hard_filters.excluded_content_traits).toEqual([]);
  });

  it('2 — reads "like X but less Y" as a qualified reference, not a plain one', () => {
    const r = parseIntent('Something like Alien, but with more dialogue and less gore.');
    const ref = r.soft_preferences.reference_titles[0]!;
    expect(ref.title).toBe('Alien');
    expect(ref.relationship).toBe('similar_but_less_graphic');
    expect(r.soft_preferences.narrative_traits.map((n) => n.value)).toContain('dialogue_forward');
    expect(r.negative_preferences.map((n) => n.value)).toContain('graphic_gore');
    // Less gore is a PREFERENCE, not an exclusion — Alien itself must stay eligible.
    expect(r.hard_filters.excluded_content_traits).not.toContain('graphic_gore');
  });

  it('3 — a negation must not swallow the constraints listed after it', () => {
    const r = parseIntent('A funny mystery that is not childish, under two hours, and available on Netflix.');
    expect(r.soft_preferences.genres.map((g) => g.value).sort()).toEqual(['comedy', 'mystery']);
    expect(r.negative_preferences.map((n) => n.value)).toContain('childish');
    // The regression this test exists for: both of these were previously
    // captured inside the negative scope and lost.
    expect(r.hard_filters.max_runtime_minutes).toBe(120);
    expect(r.hard_filters.allowed_streaming_services).toContain('netflix');
  });

  it('4 — "not another superhero movie" demotes without requesting movies', () => {
    const r = parseIntent('Something my wife and I will both like, but not another superhero movie.');
    expect(r.negative_preferences.map((n) => n.value)).toContain('superhero');
    // The word "movie" sits inside the negation, so it must not set the type.
    expect(r.content_type).toBe('any');
    // Superhero is demoted, never excluded — one may still be the best answer.
    expect(r.hard_filters.excluded_content_traits).not.toContain('superhero');
    // Two people, no stated genre → the parser says so instead of guessing.
    expect(r.ambiguities.some((a) => a.field === 'soft_preferences.genres')).toBe(true);
  });

  it('5 — one negator scopes over a whole list, and "dubbed" is HARD', () => {
    const r = parseIntent('A dark thriller, but nothing depressing, slow, dubbed, or overly violent.');
    expect(r.soft_preferences.genres.map((g) => g.value)).toContain('thriller');
    expect(r.soft_preferences.moods.map((m) => m.value)).toContain('bleak');
    const neg = r.negative_preferences.map((n) => n.value);
    expect(neg).toContain('depressing');
    expect(neg).toContain('graphic_violence');
    // Audio is a hard constraint; taste words in the same list are not.
    expect(r.hard_filters.original_audio_only).toBe(true);
    // "not slow" is expressed as wanting pace, not as excluding slow films.
    expect(r.soft_preferences.narrative_traits.map((n) => n.value)).toContain('fast_paced');
  });

  it('6 — "neither of us has seen" is a hard watched-exclusion', () => {
    const r = parseIntent('We want something neither of us has seen, with a satisfying ending.');
    expect(r.hard_filters.exclude_watched).toBe(true);
    expect(r.soft_preferences.narrative_traits.map((n) => n.value)).toContain('satisfying_ending');
  });

  it('7 — "unusual but not obscure" produces two opposing soft pulls', () => {
    const r = parseIntent('Give us something unusual, but not so obscure that it feels low-budget.');
    const moods = r.soft_preferences.moods.map((m) => m.value);
    expect(moods).toContain('unusual');
    // The counter-pull keeps it off the truly obscure end without excluding it.
    expect(moods).toContain('mainstream');
    expect(r.hard_filters.excluded_content_traits).toEqual([]);
  });
});

describe('negation scoping', () => {
  it('runs a negator across a comma list', () => {
    const parts = scopes('nothing depressing, slow, or violent');
    expect(parts.every((p) => p.negated)).toBe(true);
  });

  it('re-opens a positive scope after "but with"', () => {
    const parts = scopes('like Alien but with more dialogue');
    expect(parts.some((p) => !p.negated && p.text.includes('dialogue'))).toBe(true);
  });

  it('ends a negative scope at an availability or runtime cue', () => {
    const parts = scopes('not childish, under two hours, and available on Netflix');
    const netflix = parts.find((p) => p.text.includes('netflix'));
    expect(netflix?.negated).toBe(false);
  });
});

describe('runtime extraction', () => {
  it.each([
    ['under two hours', 120],
    ['under 90 minutes', 90],
    ['less than 2 hours', 120],
    ['no more than 100 mins', 100],
    ['90 minutes or less', 90],
  ])('%s → %i', (text, expected) => {
    expect(parseRuntime(text).max).toBe(expected);
  });

  it('reads a minimum too, without inventing a maximum', () => {
    const r = parseRuntime('at least 100 minutes');
    expect(r.min).toBe(100);
    expect(r.max).toBeNull();
  });

  it('takes the strictest of the request and the control', () => {
    const r = parseIntent('under two hours', { maxRuntimeMinutes: 90 });
    expect(r.hard_filters.max_runtime_minutes).toBe(90);
  });
});

describe('reference titles', () => {
  it('extracts multi-word titles and their relationship', () => {
    expect(referenceTitles('something like Blade Runner')[0]!.title).toBe('Blade Runner');
    expect(referenceTitles('similar to Heat but faster')[0]!.relationship).toBe('similar_but_faster');
  });

  it('never resolves an id itself — resolution is the database’s job', () => {
    const r = parseIntent('something like Alien');
    expect(r.soft_preferences.reference_titles[0]!.resolved_title_id).toBeNull();
  });
});

describe('context merging', () => {
  it('unions every member’s exclusions rather than averaging them', () => {
    const r = parseIntent('a thriller', { memberExclusions: ['horror', 'animal_harm'] });
    expect(r.hard_filters.excluded_content_traits.sort()).toEqual(['animal_harm', 'horror']);
  });

  it('carries court vetoes through as hard filters', () => {
    const r = parseIntent('anything', { vetoedTitleIds: ['t1', 't2'] });
    expect(r.hard_filters.vetoed_title_ids).toEqual(['t1', 't2']);
  });

  it('never lets an empty request throw — it becomes a broad, low-confidence one', () => {
    const r = parseIntent('');
    expect(r.parser_confidence).toBe(0);
    expect(r.content_type).toBe('any');
  });

  it('handles a long rambling request without losing the hard parts', () => {
    const r = parseIntent(
      'ok so it is late and we are tired and honestly we just want something we have not seen, ' +
      'nothing depressing please, under 90 minutes, on Netflix, maybe funny?',
    );
    expect(r.hard_filters.max_runtime_minutes).toBe(90);
    expect(r.hard_filters.allowed_streaming_services).toContain('netflix');
    expect(r.hard_filters.exclude_watched).toBe(true);
    expect(r.negative_preferences.map((n) => n.value)).toContain('depressing');
  });
});

describe('validation is a security boundary', () => {
  it('strips unknown keys and refuses out-of-vocabulary values', () => {
    const hostile = {
      request_version: '1.0',
      content_type: 'movie',
      hard_filters: { region: 'US', sql: 'DROP TABLE titles', table_name: 'users' },
      soft_preferences: { genres: [{ value: 'science_fiction', weight: 0.9 }] },
      negative_preferences: [],
      ambiguities: [],
      parser_confidence: 0.9,
    };
    const out = validateParsed(hostile, emptyRequest());
    expect(out.ok).toBe(true);
    // The injected keys simply do not exist on the validated object.
    expect(JSON.stringify(out.request)).not.toContain('DROP TABLE');
    expect(JSON.stringify(out.request)).not.toContain('table_name');
  });

  it('falls back rather than throwing when the payload is structurally wrong', () => {
    const out = validateParsed({ nonsense: true }, emptyRequest());
    expect(out.ok).toBe(false);
    expect(out.usedFallback).toBe(true);
    expect(out.rejected.length).toBeGreaterThan(0);
  });

  it('caps confidence on a salvaged parse so a partial read never looks certain', () => {
    const partial = {
      request_version: '1.0',
      content_type: 'movie',
      hard_filters: { region: 'US' },
      soft_preferences: { genres: [{ value: 'not_a_real_genre', weight: 0.9 }] },
      negative_preferences: [],
      ambiguities: [],
      parser_confidence: 0.99,
    };
    const out = validateParsed(partial, emptyRequest());
    expect(out.request.parser_confidence).toBeLessThanOrEqual(0.6);
  });

  it('drops an invalid enum value instead of passing it downstream', () => {
    const out = validateParsed({
      request_version: '1.0', content_type: 'movie',
      hard_filters: { region: 'US', excluded_content_traits: ['graphic_gore', 'made_up_trait'] },
      soft_preferences: {}, negative_preferences: [], ambiguities: [], parser_confidence: 0.5,
    }, emptyRequest());
    expect(out.request.hard_filters.excluded_content_traits).not.toContain('made_up_trait');
  });
});

describe('request fingerprint', () => {
  it('is stable across key order and array order', () => {
    const a = parseIntent('a funny mystery on netflix under two hours');
    const b = parseIntent('under two hours, on netflix, a mystery that is funny');
    expect(requestFingerprint(a)).toBe(requestFingerprint(b));
  });

  it('changes when a hard constraint changes', () => {
    const a = parseIntent('a thriller under two hours');
    const b = parseIntent('a thriller under 90 minutes');
    expect(requestFingerprint(a)).not.toBe(requestFingerprint(b));
  });

  it('changes when the member set changes', () => {
    const r = parseIntent('a thriller');
    expect(requestFingerprint(r, { members: ['a'] })).not.toBe(requestFingerprint(r, { members: ['a', 'b'] }));
  });
});

describe('safety exclusions', () => {
  it('lists the trait families that must never be auto-relaxed', () => {
    for (const t of ['sexual_violence', 'animal_harm', 'child_endangerment', 'graphic_gore']) {
      expect(NEVER_AUTO_RELAX).toContain(t);
    }
    // Taste-level dislikes are NOT in that list — they may be offered for relaxing.
    expect(NEVER_AUTO_RELAX).not.toContain('childish');
    expect(NEVER_AUTO_RELAX).not.toContain('superhero');
  });
});
