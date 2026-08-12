/**
 * WHY IS THIS TITLE IN MY LIST?
 *
 * A real account showed ~525 watchlist titles with ~518 marked WATCHED, most of
 * which the owner did not recognise. That is not a display bug. Traced to the
 * source, three things were true at once:
 *
 *   ONE TABLE, TWO MEANINGS. `watchlist_items` stores both LIST MEMBERSHIP
 *   ("I want to watch this", "I finished this") and RATING EVIDENCE ("here is
 *   what I think of it"). They are different claims with different lifetimes,
 *   and conflating them means every rating becomes a list entry.
 *
 *   THE DOCKET IS ENDLESS. `TasteGame` tops its deck up so "the game feels
 *   endless", and every ruling calls `rateQuizTitle`, which writes
 *   `status: 'watched'`. Play it for ten minutes and you have hundreds of
 *   watched rows. 518 is not a mystery; it is a play count.
 *
 *   AND EACH TAP IS DEFENSIBLE ON ITS OWN. The Docket does offer "Haven't seen
 *   this one — skip", and it asks "Have you seen it?" before the four ratings,
 *   so a player who taps "Liked it" really is asserting they watched it. That is
 *   what makes this the interesting kind of data bug: no single write is wrong.
 *   The defect is that a RATINGS LOG is rendered as a CURATED COLLECTION, and
 *   hundreds of individually-correct rows add up to a page the owner does not
 *   recognise.
 *
 * Plus one clean defect: the Build-a-Case flow takes the titles a user says they
 * want to AVOID and files them at rating 2 with `status: 'watched'`. Saying "not
 * that" marked it as seen.
 *
 * PROVENANCE IS THE FIX THAT DOES NOT DESTROY ANYTHING. Every row records how it
 * came to exist, so the Watchlist can show what the user actually put there
 * while the recommendation engine keeps every rating it has always had. No
 * history is deleted, nothing is guessed, and the rows that cannot be explained
 * are labelled as such rather than quietly presented as the user's own curation.
 *
 * PURE. No I/O — this is the vocabulary and the rules about it.
 */

/**
 * How a `watchlist_items` row came to exist.
 *
 * ORDERED BY HOW MUCH THE USER MEANT IT. The distinction that matters is not
 * where the write came from technically, it is whether a person INTENDED this
 * title to be in their collection.
 */
export type ListProvenance =
  /** They pressed Save / Add. The strongest claim there is. */
  | 'explicit_user_save'
  /** They pressed "I've seen it" / gave a post-watch verdict on a title they chose. */
  | 'explicit_mark_seen'
  /** They imported a list they own from another service. */
  | 'user_import'
  /** They ticked a title off inside a Pack checklist. */
  | 'pack_checklist'
  /**
   * A rating collected by a calibration game. REAL EVIDENCE, NOT A LIST ENTRY —
   * the user told us what they think of a film, which is not the same as asking
   * for it to appear in their collection.
   */
  | 'taste_game_rating'
  /** A title the user NAMED in free text during onboarding. Evidence, not curation. */
  | 'onboarding_seed'
  /** Merged in when an anonymous session was attached to a new account. */
  | 'account_merge'
  /** Written by a migration or backfill script. */
  | 'migration'
  /** Test or demo fixture. Must never appear on a real account. */
  | 'test_fixture'
  /**
   * Predates provenance tracking. NOT a synonym for "junk" — most of these are
   * legitimate, and the whole point of a separate value is that we do not know
   * which, so we do not pretend to.
   */
  | 'unknown_legacy';

export const LIST_PROVENANCES: readonly ListProvenance[] = [
  'explicit_user_save',
  'explicit_mark_seen',
  'user_import',
  'pack_checklist',
  'taste_game_rating',
  'onboarding_seed',
  'account_merge',
  'migration',
  'test_fixture',
  'unknown_legacy',
];

/**
 * Provenances that mean THE USER PUT THIS HERE.
 *
 * These are the rows the Watchlist may present as the user's own collection.
 * Everything else still exists, still feeds recommendations, and is still
 * theirs — it simply was not a request to add something to a list, and showing
 * it as one is what destroyed trust in the page.
 */
const CURATED = new Set<ListProvenance>([
  'explicit_user_save',
  'explicit_mark_seen',
  'user_import',
  'pack_checklist',
  'account_merge',
]);

export function isCurated(provenance: ListProvenance | null | undefined): boolean {
  // A row with no provenance predates the column. See `unknown_legacy`.
  return CURATED.has((provenance ?? 'unknown_legacy') as ListProvenance);
}

/**
 * Provenances that are EVIDENCE ONLY — never shown as list membership.
 *
 * Deliberately a separate predicate rather than `!isCurated`, because
 * `unknown_legacy` is neither: it is unclassified, and the product owes the user
 * a way to sort it out rather than a verdict it cannot justify.
 */
const EVIDENCE_ONLY = new Set<ListProvenance>([
  'taste_game_rating',
  'onboarding_seed',
]);

export function isEvidenceOnly(provenance: ListProvenance | null | undefined): boolean {
  return EVIDENCE_ONLY.has((provenance ?? 'unknown_legacy') as ListProvenance);
}

/** Rows that must never exist on a real account. */
export function isFixture(provenance: ListProvenance | null | undefined): boolean {
  return provenance === 'test_fixture';
}

/** What the user is told, when they ask why something is in their list. */
export const PROVENANCE_LABEL: Record<ListProvenance, string> = {
  explicit_user_save: 'You saved this',
  explicit_mark_seen: 'You marked this watched',
  user_import: 'From your import',
  pack_checklist: 'Ticked off in a Pack',
  taste_game_rating: 'You rated this in a taste game',
  onboarding_seed: 'You named this when you signed up',
  account_merge: 'Carried over when you created your account',
  migration: 'Added by a system update',
  test_fixture: 'Test data',
  unknown_legacy: 'Added before we tracked this',
};

export interface ListRow {
  status: string;
  provenance?: ListProvenance | null;
  rating?: number | null;
}

export interface ReconciliationReport {
  total: number;
  /** Rows the user genuinely curated. These are the watchlist. */
  curated: number;
  /** Ratings that were never a list request. Kept as evidence, hidden from the list. */
  evidenceOnly: number;
  /** Predates provenance. Needs the user's help, not a guess. */
  unclassified: number;
  /** Fixtures on a real account. Always a bug. */
  fixtures: number;
}

/**
 * Describe a user's list without changing it.
 *
 * DELIBERATELY READ-ONLY. The temptation with 518 bad rows is to write a
 * cleanup that deletes them, and that is exactly the operation that cannot be
 * undone if the heuristic is wrong. Counting first means the user is shown what
 * would happen before anything happens.
 */
export function reconcile(rows: readonly ListRow[]): ReconciliationReport {
  const report: ReconciliationReport = {
    total: rows.length,
    curated: 0,
    evidenceOnly: 0,
    unclassified: 0,
    fixtures: 0,
  };
  for (const row of rows) {
    const p = row.provenance ?? 'unknown_legacy';
    if (isFixture(p)) report.fixtures++;
    else if (isEvidenceOnly(p)) report.evidenceOnly++;
    else if (p === 'unknown_legacy') report.unclassified++;
    else if (isCurated(p)) report.curated++;
  }
  return report;
}
