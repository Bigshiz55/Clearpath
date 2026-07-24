import { describe, it, expect, beforeEach } from 'vitest';
import { localize, hasKey, missingKeyReport, clearMissingKeys } from './localize';
import { baseLocale, isRtl, resolveResponseLocale, LOCALES } from './locale';

describe('localizer — complete keys, placeholders, fallback', () => {
  beforeEach(() => clearMissingKeys());

  it('interpolates placeholders (no fragment concatenation)', () => {
    expect(localize('en', 'meaning.where_to_stream_title', { title: 'Rocky' })).toBe('Where to stream Rocky');
    expect(localize('es', 'meaning.where_to_stream_title', { title: 'Rocky' })).toBe('Dónde ver Rocky');
    expect(localize('zh', 'meaning.where_to_stream_title', { title: '洛奇' })).toContain('洛奇');
  });

  it('falls back locale → base → English and logs the miss', () => {
    // fr is scaffolded (no dictionary) → falls back to English but records it.
    const s = localize('fr', 'clarification.heading');
    expect(s).toBe('Help us narrow the case.');
    expect(missingKeyReport().some((m) => m.requested === 'fr' && m.servedBy === 'en')).toBe(true);
  });

  it('NEVER returns a raw localization key to the user', () => {
    // an unknown key still yields a humanized string, not "clarification.foo"
    const s = localize('en', 'clarification.dismiss');
    expect(s).not.toMatch(/^clarification\./);
  });

  it('regional codes collapse to base locale', () => {
    expect(baseLocale('es-419')).toBe('es');
    expect(baseLocale('zh-Hans')).toBe('zh');
    expect(localize('es-419', 'clarification.which_did_you_mean')).toBe('¿A cuál te refieres?');
  });

  it('shipped locales fully cover the clarification keys (no fallback)', () => {
    for (const loc of ['en', 'es', 'zh']) {
      expect(hasKey(loc, 'clarification.heading'), loc).toBe(true);
      expect(hasKey(loc, 'meaning.title_airing_soon'), loc).toBe(true);
    }
  });
});

describe('locale registry', () => {
  it('marks Arabic RTL and the rest LTR', () => {
    expect(isRtl('ar')).toBe(true);
    expect(isRtl('en')).toBe(false);
    expect(isRtl('zh')).toBe(false);
  });
  it('resolution order: app > query > conversation > default', () => {
    expect(resolveResponseLocale({ appLocale: 'es', queryText: 'The Dark Knight' }).source).toBe('app');
    expect(resolveResponseLocale({ conversationLocale: 'zh', queryText: 'Rocky' }).source).toBe('conversation');
    expect(resolveResponseLocale({ queryText: 'Rocky' }).source).toBe('default');
  });
  it('ships en/es/zh and scaffolds the rest', () => {
    expect(LOCALES.en!.shipped && LOCALES.es!.shipped && LOCALES.zh!.shipped).toBe(true);
    expect(LOCALES.ar!.shipped).toBe(false);
  });
});
