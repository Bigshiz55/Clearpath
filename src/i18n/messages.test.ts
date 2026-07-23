import { describe, it, expect } from 'vitest';
import { CATALOGS } from './catalogs';

// Validate the MERGED catalogs (base + every messages/parts/*.json), so any
// screen namespace added as a part is held to the same completeness /
// interpolation-parity / no-leakage bar as the base.
const en = CATALOGS['en-US'];
const es = CATALOGS['es-419'];
const zh = CATALOGS['zh-Hans'];

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

/** Read a dot-path string from a nested object. */
function get(obj: unknown, key: string): string | undefined {
  let node: unknown = obj;
  for (const p of key.split('.')) {
    if (node == null || typeof node !== 'object') return undefined;
    node = (node as Record<string, unknown>)[p];
  }
  return typeof node === 'string' ? node : undefined;
}
const placeholders = (s: string): string[] => (s.match(/\{(\w+)\}/g) ?? []).sort();

describe('interpolation parity', () => {
  const enKeys = keys(en);
  it('every translation uses the same {placeholders} as English', () => {
    const mismatches: string[] = [];
    for (const k of enKeys) {
      const base = placeholders(get(en, k) ?? '');
      for (const [name, cat] of [['es-419', es], ['zh-Hans', zh]] as const) {
        const val = get(cat, k);
        if (val == null) continue; // completeness test covers missing
        if (JSON.stringify(placeholders(val)) !== JSON.stringify(base)) {
          mismatches.push(`${name}:${k} (${base.join(',')} vs ${placeholders(val).join(',')})`);
        }
      }
    }
    expect(mismatches, mismatches.join(' | ')).toEqual([]);
  });
});

describe('no English leakage in translated catalogs', () => {
  // Values that are intentionally identical across locales (brand, trademarks,
  // acronyms) are allow-listed so the leakage guard stays meaningful.
  const ALLOW = new Set(['Pro', 'VERD1CT', 'DNA', 'IMDb', 'TV', 'OK']);
  it('zh-Hans values are not accidental English copies', () => {
    const leaks = keys(en)
      .filter((k) => {
        const e = get(en, k);
        const z = get(zh, k);
        return e && z && e === z && !ALLOW.has(e) && /^[\x00-\x7F]+$/.test(z) && /[a-zA-Z]{3,}/.test(z);
      });
    expect(leaks, `Untranslated in zh-Hans: ${leaks.join(', ')}`).toEqual([]);
  });
});
