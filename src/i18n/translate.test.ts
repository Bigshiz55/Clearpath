import { describe, it, expect } from 'vitest';
import { translate, plural, negotiateLocale, type Messages } from './translate';

const EN: Messages = {
  nav: { ask: 'Ask', discover: 'Discover' },
  greet: 'Hi {name}',
  picks: { one: '{count} pick', other: '{count} picks' },
};
const ES: Messages = {
  nav: { ask: 'Preguntar' /* discover intentionally missing */ },
  picks: { one: '{count} selección', other: '{count} selecciones' },
};

describe('translate', () => {
  it('resolves a dot-path key', () => {
    expect(translate(ES, EN, 'nav.ask')).toBe('Preguntar');
  });
  it('falls back to English when a key is missing in the locale', () => {
    expect(translate(ES, EN, 'nav.discover')).toBe('Discover');
  });
  it('falls back to the key itself when missing everywhere', () => {
    expect(translate(ES, EN, 'nav.nope')).toBe('nav.nope');
  });
  it('interpolates {params}', () => {
    expect(translate(EN, EN, 'greet', { name: 'Sam' })).toBe('Hi Sam');
  });
});

describe('plural', () => {
  it('picks one/other by count', () => {
    expect(plural(ES, EN, 'picks', 1)).toBe('1 selección');
    expect(plural(ES, EN, 'picks', 3)).toBe('3 selecciones');
  });
});

describe('negotiateLocale', () => {
  it('honours a valid cookie above all', () => {
    expect(negotiateLocale('zh-Hans', 'en-US,en;q=0.9')).toBe('zh-Hans');
  });
  it('ignores an invalid cookie and uses Accept-Language exact match', () => {
    expect(negotiateLocale('xx', 'es-419,es;q=0.9')).toBe('es-419');
  });
  it('matches by base language (es-MX → es-419, zh-CN → zh-Hans)', () => {
    expect(negotiateLocale(null, 'es-MX,es;q=0.8')).toBe('es-419');
    expect(negotiateLocale(null, 'zh-CN,zh;q=0.9')).toBe('zh-Hans');
  });
  it('respects q-weighting order', () => {
    expect(negotiateLocale(null, 'en-US;q=0.4, es-419;q=0.9')).toBe('es-419');
  });
  it('defaults to en-US when nothing matches', () => {
    expect(negotiateLocale(null, 'de-DE,fr;q=0.9')).toBe('en-US');
    expect(negotiateLocale(null, null)).toBe('en-US');
  });
});
