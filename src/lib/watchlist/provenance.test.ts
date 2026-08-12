import { describe, it, expect } from 'vitest';
import {
  LIST_PROVENANCES,
  PROVENANCE_LABEL,
  isCurated,
  isEvidenceOnly,
  isFixture,
  reconcile,
  type ListProvenance,
} from './provenance';

/**
 * "WHY IS THIS TITLE IN MY LIST?"
 *
 * A real account showed ~525 watchlist titles with ~518 marked WATCHED, most of
 * which the owner did not recognise. The cause was not one bug:
 *
 *   `watchlist_items` stores LIST MEMBERSHIP and RATING EVIDENCE in one table,
 *   `TasteGame` tops its deck up so the game "feels endless" and calls
 *   `rateQuizTitle` on every tap, and `rateQuizTitle` wrote `status: 'watched'`.
 *   518 is a play count.
 *
 * These pin the rules that stop it recurring, and — just as importantly — pin
 * that the fix does not throw the user's ratings away.
 */

describe('a rating is not a request to save something', () => {
  it('taste-game ratings are evidence, never list membership', () => {
    expect(isEvidenceOnly('taste_game_rating')).toBe(true);
    expect(isCurated('taste_game_rating'), 'a game rating counted as curation').toBe(false);
  });

  it('titles named during onboarding are evidence too', () => {
    // "What do you want to avoid?" produced watched rows. Naming a film is not
    // asking for it to be in a collection, in either direction.
    expect(isEvidenceOnly('onboarding_seed')).toBe(true);
  });

  it('but a deliberate save or mark-seen IS the list', () => {
    expect(isCurated('explicit_user_save')).toBe(true);
    expect(isCurated('explicit_mark_seen')).toBe(true);
    expect(isCurated('user_import')).toBe(true);
    expect(isCurated('pack_checklist')).toBe(true);
    expect(isCurated('account_merge')).toBe(true);
  });

  it('and evidence-only rows are never silently treated as curated', () => {
    for (const p of LIST_PROVENANCES) {
      if (isEvidenceOnly(p)) expect(isCurated(p), `${p} is both`).toBe(false);
    }
  });
});

describe('unknown history is unclassified, not condemned', () => {
  it('a row with no provenance is neither curated nor evidence', () => {
    /* THE ROWS THAT PREDATE THE COLUMN. Most are legitimate. Treating them as
       junk would delete real history; treating them as curated would put the
       518 back. They are their own state, and the product owes the user a way
       to sort them out rather than a verdict it cannot justify. */
    expect(isCurated(null)).toBe(false);
    expect(isCurated(undefined)).toBe(false);
    expect(isEvidenceOnly(null)).toBe(false);
  });

  it('counts each state separately so nothing is hidden in an average', () => {
    const report = reconcile([
      { status: 'possible', provenance: 'explicit_user_save' },
      { status: 'watched', provenance: 'explicit_mark_seen' },
      { status: 'watched', provenance: 'taste_game_rating' },
      { status: 'watched', provenance: 'taste_game_rating' },
      { status: 'watched', provenance: null },
      { status: 'possible', provenance: 'test_fixture' },
    ]);
    expect(report).toEqual({
      total: 6,
      curated: 2,
      evidenceOnly: 2,
      unclassified: 1,
      fixtures: 1,
    });
  });

  it('reconciliation reports and never mutates', () => {
    // Deliberately read-only: with 518 bad rows the tempting fix is a delete,
    // and that is the one operation that cannot be undone if the rule is wrong.
    const rows = [{ status: 'watched', provenance: 'taste_game_rating' as ListProvenance }];
    const before = JSON.stringify(rows);
    reconcile(rows);
    expect(JSON.stringify(rows)).toBe(before);
  });
});

describe('fixtures must never look like user data', () => {
  it('is its own state, not folded into legacy', () => {
    expect(isFixture('test_fixture')).toBe(true);
    expect(isFixture('unknown_legacy')).toBe(false);
    expect(isCurated('test_fixture'), 'a test fixture would render as the user’s own save').toBe(false);
  });
});

describe('every provenance can be explained to the user', () => {
  it('has a label — an unexplainable row is the original bug', () => {
    for (const p of LIST_PROVENANCES) {
      expect(PROVENANCE_LABEL[p], `no label for ${p}`).toBeTruthy();
    }
  });
});
