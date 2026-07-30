import 'server-only';

/**
 * Manually-curated per-series correspondent/narrator/host stoplist — names
 * that recur across many unrelated episodes because they're the recurring
 * on-air talent for that series, not because they're the subject of any one
 * specific case. Real, well-known primary correspondents/narrators for these
 * franchises, not fabricated.
 *
 * Suppression is per-series (see `suppressCorrespondents` in extraction.ts):
 * a name listed here for one series has no effect on any other series' Case
 * matching — the same person could, in principle, be a legitimate case
 * subject on a different show.
 *
 * This is a seed list, not exhaustive — it will miss recurring talent this
 * author isn't confident enough about to state as fact (any given season's
 * full correspondent roster, local/regional reporters, guest hosts). The
 * frequency-based safeguard (`CORRESPONDENT_FREQUENCY_THRESHOLD`) exists
 * specifically to catch what this list misses.
 */
export const CORRESPONDENT_STOPLIST: Record<string, string[]> = {
  'Dateline NBC': [
    'Keith Morrison', 'Josh Mankiewicz', 'Andrea Canning', 'Dennis Murphy',
    'Natalie Morales', 'Craig Melvin', 'Lester Holt',
  ],
  '20/20': [
    'David Muir', 'Amy Robach', 'Deborah Roberts', 'Elizabeth Vargas',
    'John Quinones', 'Diane Sawyer',
  ],
  '48 Hours': [
    'Erin Moriarty', 'Peter Van Sant', 'Maureen Maher', 'Susan Spencer',
    'Anne Marie Green', 'Jim Axelrod', 'Tracy Smith', 'Jonathan Vigliotti',
  ],
  Snapped: ['Sharon Martin'],
  'Forensic Files': ['Peter Thomas', 'Stephen Hoye'],
  'Cold Case Files': ['Bill Kurtis'],
  'American Justice': ['Bill Kurtis'],
  'The First 48': ['Joe Schillaci'],
};

/** True if `name` is the known correspondent/narrator/host stoplist for `series`. Per-series only — never checked against any other show's list. */
export function isStoplistedCorrespondent(series: string, name: string): boolean {
  return CORRESPONDENT_STOPLIST[series]?.includes(name) ?? false;
}
