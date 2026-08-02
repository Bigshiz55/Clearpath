import { describe, it, expect } from 'vitest';
import { sanitizeDbUrl, validateDbUrl } from './adminMigrateUrl';

describe('sanitizeDbUrl', () => {
  it('trims surrounding whitespace and newlines', () => {
    expect(sanitizeDbUrl('  postgres://u:p@host:5432/db\n')).toBe('postgres://u:p@host:5432/db');
  });

  it('strips a single wrapping pair of double quotes', () => {
    expect(sanitizeDbUrl('"postgres://u:p@host:5432/db"')).toBe('postgres://u:p@host:5432/db');
  });

  it('strips a single wrapping pair of single quotes', () => {
    expect(sanitizeDbUrl("'postgres://u:p@host:5432/db'")).toBe('postgres://u:p@host:5432/db');
  });

  it('strips wrapping angle brackets from a copied placeholder', () => {
    expect(sanitizeDbUrl('<postgres://u:p@host:5432/db>')).toBe('postgres://u:p@host:5432/db');
  });

  it('leaves an unwrapped value untouched apart from trimming', () => {
    expect(sanitizeDbUrl('postgres://u:p@host:5432/db')).toBe('postgres://u:p@host:5432/db');
  });

  it('does not strip a quote that only appears on one side', () => {
    expect(sanitizeDbUrl('"postgres://u:p@host:5432/db')).toBe('"postgres://u:p@host:5432/db');
  });
});

describe('validateDbUrl', () => {
  it('accepts a well-formed postgres:// URL', () => {
    expect(validateDbUrl('postgres://user:pass@db.example.co:5432/postgres')).toEqual({ ok: true });
  });

  it('accepts postgresql:// as well as postgres://', () => {
    expect(validateDbUrl('postgresql://user:pass@db.example.co:5432/postgres').ok).toBe(true);
  });

  it('rejects an empty string', () => {
    const r = validateDbUrl('');
    expect(r.ok).toBe(false);
    expect(r.reason).toMatch(/empty/i);
  });

  it('rejects a value with no postgres scheme, naming the requirement', () => {
    const r = validateDbUrl('db.example.co:5432/postgres');
    expect(r.ok).toBe(false);
    expect(r.reason).toMatch(/postgres:\/\/|postgresql:\/\//);
  });

  it('rejects a value with an unescaped @ in the password, explaining why', () => {
    const r = validateDbUrl('postgres://user:p@ss@db.example.co:5432/postgres');
    expect(r.ok).toBe(false);
    expect(r.reason).toMatch(/@/);
    expect(r.reason).toMatch(/percent-encod/i);
  });

  it('never echoes the input value back in the rejection reason', () => {
    const secret = 'postgres://user:p@ss@db.example.co:5432/postgres';
    const r = validateDbUrl(secret);
    expect(r.reason).not.toContain('p@ss');
    expect(r.reason).not.toContain('db.example.co');
  });

  it('rejects a structurally invalid URL after the scheme/@ checks pass', () => {
    const r = validateDbUrl('postgres://');
    expect(r.ok).toBe(false);
  });
});
