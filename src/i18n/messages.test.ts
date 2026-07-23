import { describe, it, expect } from 'vitest';
import en from '../../messages/en-US.json';
import es from '../../messages/es-419.json';
import zh from '../../messages/zh-Hans.json';

/** Flatten a nested messages object into dot-path keys. */
function keys(obj: unknown, prefix = ''): string[] {
  if (obj == null || typeof obj !== 'object') return [];
  return Object.entries(obj as Record<string, unknown>).flatMap(([k, v]) => {
    const path = prefix ? `${prefix}.${k}` : k;
    return typeof v === 'object' && v !== null ? keys(v, path) : [path];
  });
}

describe('message catalog completeness', () => {
  const enKeys = keys(en).sort();
  it('English is the source of truth and non-empty', () => {
    expect(enKeys.length).toBeGreaterThan(0);
  });
  it('es-419 covers every English key (no missing translations)', () => {
    const missing = enKeys.filter((k) => !keys(es).includes(k));
    expect(missing, `Missing in es-419: ${missing.join(', ')}`).toEqual([]);
  });
  it('zh-Hans covers every English key (no missing translations)', () => {
    const missing = enKeys.filter((k) => !keys(zh).includes(k));
    expect(missing, `Missing in zh-Hans: ${missing.join(', ')}`).toEqual([]);
  });
  it('no locale has stray keys English lacks', () => {
    expect(keys(es).filter((k) => !enKeys.includes(k))).toEqual([]);
    expect(keys(zh).filter((k) => !enKeys.includes(k))).toEqual([]);
  });
});
