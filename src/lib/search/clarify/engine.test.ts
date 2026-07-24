import { describe, it, expect } from 'vitest';
import { clarify } from './engine';
import { resolveEntities } from './entities';
import { generateInterpretations } from './interpret';
import { decidePolicy } from './policy';
import { resolveResponseLocale, detectQueryLanguage } from './locale';
import { CANONICAL_INTENTS } from './canonical';

describe('confidence policy bands (language-independent)', () => {
  it('HIGH → answer for a clean unique title', () => {
    expect(clarify('Inception', { appLocale: 'en' }).decision.action).toBe('answer');
  });
  it('LOW → clarify for an ambiguous airing verb (Rocky coming)', () => {
    const r = clarify('Rocky coming', { appLocale: 'en' });
    expect(r.decision.action).toBe('clarify');
    expect(r.decision.topConfidence).toBeLessThan(0.55);
    expect(r.clarification!.options.length).toBeGreaterThanOrEqual(3);
  });
  it('LOW → clarify for a bare franchise name (Batman)', () => {
    expect(clarify('Batman', { appLocale: 'en' }).decision.action).toBe('clarify');
  });
  it('HIGH → answer when the action is explicit (where can I watch Rocky)', () => {
    const r = clarify('where can I watch Rocky', { appLocale: 'en' });
    expect(r.decision.action).toBe('answer');
    expect(r.decision.primary!.intent).toBe('streaming_lookup');
  });
  it('could_not_identify for a description, never a raw dead end', () => {
    const r = clarify('that train movie', { appLocale: 'en' });
    expect(r.decision.action).toBe('could_not_identify');
    expect(r.clarification!.options.length).toBeGreaterThan(0);
  });
});

describe('canonical vocabulary (never translated identifiers)', () => {
  it('every interpretation uses a canonical intent key', () => {
    const set = generateInterpretations('Rocky viene');
    for (const i of set.interpretations) expect(CANONICAL_INTENTS).toContain(i.intent);
  });
  it('analytics event stores canonical intent + meaning keys, not labels', () => {
    const ev = clarify('Rocky viene', { appLocale: 'es' }).event;
    expect(CANONICAL_INTENTS).toContain(ev.canonicalIntent!);
    expect(ev.interpretationKeys[0]!.meaningKey).toMatch(/^[a-z_]+$/);
    expect(ev.detectedQueryLanguage).toBe('es');
  });
});

describe('multilingual entity resolution → one universal id', () => {
  it('resolves Rocky across scripts to movie:1366', () => {
    for (const q of ['Rocky', 'ロッキー', 'рокки', '洛奇', 'روكي']) {
      expect(resolveEntities(q).title?.id, q).toBe('movie:1366');
    }
  });
  it('resolves Money Heist / La Casa de Papel / Haus des Geldes to one series', () => {
    for (const q of ['Money Heist', 'La Casa de Papel', 'Haus des Geldes']) {
      expect(resolveEntities(q).title?.id, q).toBe('tv:71446');
    }
  });
  it('does not let a word inside a title fire a cue (The Dark Knight ≠ mood dark)', () => {
    const r = clarify('The Dark Knight', { appLocale: 'en' });
    expect(r.decision.primary!.intent).toBe('find_title');
  });
});

describe('response language vs title language are separate', () => {
  it('Spanish app locale wins over an English title', () => {
    const r = clarify('The Dark Knight', { appLocale: 'es' });
    expect(r.locale).toBe('es');
    expect(r.primaryLabel).toContain('Buscar');
  });
  it('English app locale wins over a Spanish title', () => {
    const r = clarify('La Casa de Papel', { appLocale: 'en' });
    expect(r.locale).toBe('en');
    expect(r.primaryLabel).toContain('Find');
  });
  it('falls back to detected query language when no app locale', () => {
    const sel = resolveResponseLocale({ queryText: '¿dónde puedo ver Rocky?' });
    expect(sel.locale).toBe('es');
    expect(sel.source).toBe('query');
  });
});

describe('query-language detection by script + function words', () => {
  it('detects scripts', () => {
    expect(detectQueryLanguage('أين أشاهد روكي').lang).toBe('ar');
    expect(detectQueryLanguage('ロッキーやる').lang).toBe('ja');
    expect(detectQueryLanguage('洛奇在哪看').lang).toBe('zh');
  });
  it('is not flipped by a foreign title in an English sentence', () => {
    expect(detectQueryLanguage('where can I watch La Casa de Papel').lang).toBe('en');
  });
});

describe('RTL + localized rendering', () => {
  it('Arabic renders RTL with localized clarification text', () => {
    const r = clarify('روكي', { appLocale: 'ar' });
    expect(r.dir).toBe('rtl');
    // ar dictionary present → heading is Arabic, not a raw key
    expect(r.primaryLabel ?? r.clarification?.heading ?? '').not.toMatch(/clarification\./);
  });
  it('Spanish clarify options are Spanish', () => {
    const r = clarify('Rocky viene', { appLocale: 'es' });
    expect(r.clarification!.heading).toContain('¿A cuál te refieres?');
    expect(r.clarification!.options.some((o) => /Dónde ver|Buscar|estreno/.test(o.label))).toBe(true);
  });
});

describe('policy is driven by the distribution, not wording', () => {
  it('identical intent in different languages yields the same action', () => {
    const en = decidePolicy(generateInterpretations('where can I watch Rocky')).action;
    const es = decidePolicy(generateInterpretations('dónde puedo ver Rocky')).action;
    const de = decidePolicy(generateInterpretations('wo kann ich Rocky streamen')).action;
    expect(en).toBe('answer');
    expect(es).toBe('answer');
    expect(de).toBe('answer');
  });
});
