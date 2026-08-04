/**
 * THE ONE SOURCE REGISTRY — shared by streaming and linear TV.
 *
 * There is deliberately no second registry, no second provenance model and no
 * second confidence model anywhere in the codebase. Both ingestion systems
 * classify sources here.
 *
 * Pure: no I/O, no DB, no network. The gate that consumes it lives in the
 * ingest layer; keeping the policy pure means it is exhaustively testable and
 * cannot silently depend on request state.
 */

/** What we are actually allowed to do with a source. */
export type SourceState =
  | 'CLEARLY_PERMITTED'
  | 'PRESS_PUBLICITY'
  | 'AMBIGUOUS_FACTS_ONLY'
  | 'ADMIN_OR_PARTNER_SUPPLIED'
  | 'LICENSED'
  | 'REQUIRES_PERMISSION'
  | 'EXPLICITLY_PROHIBITED'
  | 'UNCHARACTERIZED';

/**
 * Crawl guidance, recorded SEPARATELY and never treated as evidence of a
 * licence. robots.txt governs crawler behaviour; it grants no reuse rights.
 * It may support AMBIGUOUS_FACTS_ONLY. It can never justify CLEARLY_PERMITTED.
 */
export type RobotsStatus = 'allows' | 'disallows' | 'partial' | 'absent' | 'unreachable' | 'unchecked';

export interface SourceDefinition {
  key: string;
  displayName: string;
  state: SourceState;
  /** Why it has this state — a quotable fact, not an assumption. */
  basis: string;
  robots: RobotsStatus;
  /** Higher wins when two sources disagree. See SOURCE_AUTHORITY. */
  authority: number;
  /** False disables the adapter regardless of state — the per-source kill switch. */
  enabled: boolean;
  attributionUrl?: string;
  /** Set when a state depends on something a human must still complete. */
  pendingAction?: string;
}

/**
 * Authority tiers for conflict resolution. A licensed feed outranks a press
 * release, which outranks a facts-only page read. Ranking never RESOLVES a
 * conflict on its own — see preserveConflict: both claims are always kept.
 */
export const SOURCE_AUTHORITY = {
  LICENSED: 100,
  OFFICIAL_API: 90,
  ADMIN_SUPPLIED: 80,
  OFFICIAL_PRESS: 70,
  OFFICIAL_PAGE: 50,
  THIRD_PARTY: 30,
} as const;

/** Only these states may ever reach production automatically. */
const AUTO_INGESTIBLE: ReadonlySet<SourceState> = new Set<SourceState>([
  'CLEARLY_PERMITTED',
  'LICENSED',
  'ADMIN_OR_PARTNER_SUPPLIED',
  'PRESS_PUBLICITY',
]);

/**
 * The gate. AMBIGUOUS_FACTS_ONLY is buildable but never auto-ingests: it ships
 * behind its own flag so activation stays a business decision, not a
 * deployment side effect.
 */
export function canIngest(source: SourceDefinition): boolean {
  if (!source.enabled) return false;
  return AUTO_INGESTIBLE.has(source.state);
}

/** Why a source was refused — surfaced in the dashboard, never swallowed. */
export function refusalReason(source: SourceDefinition): string | null {
  if (canIngest(source)) return null;
  // The RIGHTS reason outranks the kill switch. A prohibited source is usually
  // also disabled, and reporting "kill switch off" would hide the fact that
  // flipping the switch would still be wrong.
  switch (source.state) {
    case 'EXPLICITLY_PROHIBITED':
      return `${source.displayName} expressly prohibits this use: ${source.basis}`;
    case 'REQUIRES_PERMISSION':
      return `${source.displayName} needs written permission first.${source.pendingAction ? ` ${source.pendingAction}` : ''}`;
    case 'AMBIGUOUS_FACTS_ONLY':
      return `${source.displayName} is facts-only behind a flag; activation is a business decision.`;
    case 'UNCHARACTERIZED':
      return `${source.displayName} has not been reviewed.`;
    default:
      return !source.enabled
        ? `Kill switch off for ${source.displayName}.`
        : `${source.displayName} is not auto-ingestible.`;
  }
}

/** Verified live 2026-08-04. Every basis is a fact we checked, not an inference. */
export const SOURCES: SourceDefinition[] = [
  {
    key: 'tvmaze',
    displayName: 'TVmaze',
    state: 'CLEARLY_PERMITTED',
    basis: 'CC BY-SA per tvmaze.com/api — any purpose with credit; ShareAlike applies.',
    robots: 'allows',
    authority: SOURCE_AUTHORITY.OFFICIAL_API,
    enabled: true,
    attributionUrl: 'https://www.tvmaze.com/',
  },
  {
    key: 'tmdb',
    displayName: 'TMDB',
    state: 'CLEARLY_PERMITTED',
    basis: 'Existing API terms. Enrichment only — carries no channel schedule.',
    robots: 'allows',
    authority: SOURCE_AUTHORITY.OFFICIAL_API,
    enabled: true,
    attributionUrl: 'https://www.themoviedb.org/',
  },
  {
    key: 'admin_import',
    displayName: 'Administrator / partner supplied',
    state: 'ADMIN_OR_PARTNER_SUPPLIED',
    basis: 'First-party, or supplied under that supplier’s own terms.',
    robots: 'unchecked',
    authority: SOURCE_AUTHORITY.ADMIN_SUPPLIED,
    enabled: true,
  },
  {
    key: 'paramount_press',
    displayName: 'Paramount Press Express',
    state: 'PRESS_PUBLICITY',
    basis: 'HTTP 200; robots.txt disallows only image extensions (*.gif$, *.jpg$). Text/press content permitted.',
    robots: 'partial',
    authority: SOURCE_AUTHORITY.OFFICIAL_PRESS,
    enabled: true,
    attributionUrl: 'https://www.paramountpressexpress.com/',
  },
  {
    key: 'hulu_press',
    displayName: 'Hulu Press',
    state: 'PRESS_PUBLICITY',
    basis: 'HTTP 200; WordPress robots.txt disallows /wp-admin/ only.',
    robots: 'partial',
    authority: SOURCE_AUTHORITY.OFFICIAL_PRESS,
    enabled: true,
    attributionUrl: 'https://press.hulu.com/',
  },
  {
    key: 'britbox_site',
    displayName: 'BritBox',
    state: 'PRESS_PUBLICITY',
    basis: 'HTTP 200; robots.txt disallows account paths only (/us/account/, /ca/ac…).',
    robots: 'partial',
    authority: SOURCE_AUTHORITY.OFFICIAL_PAGE,
    enabled: true,
    attributionUrl: 'https://www.britbox.com/',
  },
  {
    key: 'hallmark_press',
    displayName: 'Hallmark press portal (Clipsource)',
    state: 'REQUIRES_PERMISSION',
    basis: 'Credentialed press portal. Public /post/ pages carry premiere announcements; authenticated content requires approved access.',
    robots: 'absent',
    authority: SOURCE_AUTHORITY.OFFICIAL_PRESS,
    // Adapter ships ready; stays dark until approval is confirmed.
    enabled: false,
    pendingAction: 'Press access APPLIED FOR 2026-08-04 — PENDING APPROVAL. Do not use authenticated content, and never bypass the login, until approval is confirmed.',
    attributionUrl: 'https://press.hallmarkmedia.com/',
  },
  {
    key: 'aenetworks_press',
    displayName: 'A+E Networks press (Lifetime, LMN)',
    state: 'EXPLICITLY_PROHIBITED',
    basis: 'robots.txt is exactly "User-agent: * / Disallow: /" — a blanket prohibition on automated retrieval.',
    robots: 'disallows',
    authority: SOURCE_AUTHORITY.OFFICIAL_PRESS,
    enabled: false,
    pendingAction: 'Only written permission from A+E unblocks this.',
  },
  {
    key: 'mylifetime_site',
    displayName: 'Lifetime / LMN site',
    state: 'AMBIGUOUS_FACTS_ONLY',
    basis: 'Full 24h grid verified parseable; robots allow-all; no account, payment or clickwrap. Commercial republication not expressly authorized.',
    robots: 'allows',
    authority: SOURCE_AUTHORITY.OFFICIAL_PAGE,
    enabled: false,
    attributionUrl: 'https://www.mylifetime.com/schedule',
  },
  {
    key: 'amazon_press',
    displayName: 'Amazon MGM Studios press',
    state: 'UNCHARACTERIZED',
    basis: 'Returns HTTP 403 to us. Not a stated prohibition — simply unreadable.',
    robots: 'unreachable',
    authority: SOURCE_AUTHORITY.OFFICIAL_PRESS,
    enabled: false,
  },
  {
    key: 'peacock_press',
    displayName: 'Peacock press',
    state: 'UNCHARACTERIZED',
    basis: 'No response to our request. Not characterised — do not classify without a real retrieval.',
    robots: 'unreachable',
    authority: SOURCE_AUTHORITY.OFFICIAL_PRESS,
    enabled: false,
  },
  {
    key: 'acorn_press',
    displayName: 'Acorn TV press',
    state: 'UNCHARACTERIZED',
    basis: 'No response to our request. Not characterised.',
    robots: 'unreachable',
    authority: SOURCE_AUTHORITY.OFFICIAL_PRESS,
    enabled: false,
  },
];

export function getSource(key: string): SourceDefinition | undefined {
  return SOURCES.find((s) => s.key === key);
}
