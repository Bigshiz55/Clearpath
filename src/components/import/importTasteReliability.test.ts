import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const read = (p: string) => readFileSync(join(__dirname, '..', '..', '..', p), 'utf8');

/**
 * RELIABILITY SPRINT — item 7. Source-level on purpose: ImportTasteFlow is
 * a client component driven by real file parsing and server actions; a
 * meaningful render test would need a live TMDB-backed server.
 *
 * The bug this guards against: the "Add N titles to my Viewer DNA" button's
 * entire handler was `() => setStage('applied')` — no server action, no
 * fetch, no Supabase call anywhere in the file. The applied screen computed
 * its summary purely from local component state and claimed "Added to your
 * Viewer DNA." Nothing was ever written to any table, and "Undo this
 * import" just reset local UI state, which was consistent with there being
 * nothing to undo — the whole confirm/undo pair was decorative.
 */
describe('ImportTasteFlow actually persists what it claims to, and can really undo it', () => {
  const src = read('src/components/import/ImportTasteFlow.tsx');

  it('the apply handler is no longer a bare local state flip', () => {
    expect(src).not.toMatch(/onClick=\{\(\) => setStage\('applied'\)\}/);
  });

  it('calls the real importParsedTitles server action, batched', () => {
    expect(src).toContain("import { importParsedTitles, undoImportedTitles, type ImportRowResult } from '@/lib/actions/import'");
    expect(src).toMatch(/await importParsedTitles\(batch\)/);
    expect(src).toMatch(/IMPORT_BATCH/);
  });

  it('excludes "saved"/"interested" verdicts from the watched-history import — they have not been watched', () => {
    expect(src).toMatch(/i\.verdict !== 'saved' && i\.verdict !== 'interested'/);
  });

  it('the applied screen renders real imported/unmatched counts from the server response, not a fabricated local summary', () => {
    expect(src).toContain('applyResult.imported');
    expect(src).toContain('applyResult.unmatched');
  });

  it('undo calls the real removal action with the actually-imported keys, not just a local state reset', () => {
    expect(src).toMatch(/await undoImportedTitles\(applyResult\.importedKeys\)/);
  });

  it('a "you need to sign in" failure is shown clearly rather than silently discarded', () => {
    expect(src).toContain('data-testid="import-signin-required"');
    expect(src).toMatch(/setSignInRequired\(true\)/);
  });

  it('an invalid-content CSV (right extension, unreadable data) surfaces the parser\'s own warnings instead of a silent empty review screen', () => {
    expect(src).toContain('data-testid="parse-warnings"');
    expect(src).toContain('report.warnings');
  });

  it('the promise copy no longer overclaims "Viewer DNA" for what is actually a watchlist write', () => {
    expect(src).not.toMatch(/added to your Viewer DNA/i);
  });
});

describe('undoImportedTitles is a real deletion, not a decorative reset', () => {
  const src = read('src/lib/actions/import.ts');

  it('deletes real watchlist_items rows scoped to the caller and the given keys', () => {
    expect(src).toMatch(/export async function undoImportedTitles/);
    expect(src).toMatch(/\.delete\(\{ count: 'exact' \}\)/);
    expect(src).toContain(".eq('user_id', user.id)");
  });

  it('ImportRowResult now carries the tmdbId a real undo needs', () => {
    expect(src).toMatch(/tmdbId\?:\s*number/);
  });
});

describe('the import-taste route gets the same auto-provisioned guest identity every other write-on-behalf-of-an-anonymous-visitor path uses', () => {
  it('is listed as a protected prefix in the session middleware', () => {
    const src = read('src/lib/supabase/middleware.ts');
    expect(src).toMatch(/const PROTECTED_PREFIXES = \[.*'\/import-taste'.*\]/);
  });
});
