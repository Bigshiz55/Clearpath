import type {
  BookMetadata,
  ContentSignal,
  PrimaryCall,
  ReadingOption,
  ReadVerdictScore,
  VerdictReport,
  VerdictTier,
} from '@/lib/types';
import {
  eraBand,
  eraLabel,
  lengthBand,
  lengthLabel,
  readingTimeLabel,
} from '@/lib/format';
import { computeGeneralScore } from './general';

export interface BuildVerdictInput {
  meta: BookMetadata;
  /** ISO timestamp; injected for determinism/testability. */
  now?: string;
  /** Reference year for age-based signals. */
  refYear?: number;
}

export function tierFromScore(score: number): VerdictTier {
  if (score >= 85) return 'Must Read';
  if (score >= 75) return 'Strong Read';
  if (score >= 65) return 'Worth Reading';
  if (score >= 50) return 'Possible Read';
  if (score >= 35) return 'Low Priority';
  return 'Skip';
}

export function primaryCallFromTier(tier: VerdictTier): PrimaryCall {
  switch (tier) {
    case 'Must Read':
    case 'Strong Read':
      return 'READ IT';
    case 'Worth Reading':
    case 'Possible Read':
      return 'MAYBE';
    case 'Low Priority':
    case 'Skip':
    default:
      return 'SKIP IT';
  }
}

/** The Open Library work page — the canonical "learn more" link. */
function workUrl(workId: string): string {
  return `https://openlibrary.org/works/${workId}`;
}

function buildReadingOptions(meta: BookMetadata): ReadingOption[] {
  const options: ReadingOption[] = [];
  const readUrl = `${workUrl(meta.workId)}`;

  switch (meta.ebookAccess) {
    case 'public':
      options.push({
        label: 'Read free',
        detail: 'Full text available in the public domain via Open Library.',
        href: readUrl,
        kind: 'read-free',
      });
      break;
    case 'borrowable':
      options.push({
        label: 'Borrow',
        detail: 'Lendable digitally through the Internet Archive / Open Library.',
        href: readUrl,
        kind: 'borrow',
      });
      break;
    case 'printdisabled':
      options.push({
        label: 'Accessible copy',
        detail: 'A digital copy exists for print-disabled readers.',
        href: readUrl,
        kind: 'info',
      });
      break;
    case 'no_ebook':
    case 'unknown':
    default:
      // Nothing digital known — fall through to buy/info below.
      break;
  }

  // A generic buy/find path is always honest: we link to the catalogue page,
  // never a fabricated price or retailer.
  options.push({
    label: 'Find a copy',
    detail: 'Editions, libraries, and booksellers on the Open Library page.',
    href: readUrl,
    kind: meta.ebookAccess === 'no_ebook' || meta.ebookAccess === 'unknown' ? 'buy' : 'info',
  });

  return options;
}

function buildSignals(meta: BookMetadata, refYear: number): ContentSignal[] {
  const signals: ContentSignal[] = [];

  const band = lengthBand(meta.pageCount);
  signals.push({
    label: 'Length',
    level: 'none',
    note:
      meta.pageCount != null && meta.pageCount > 0
        ? `${lengthLabel(band)} · ${meta.pageCount} pages · ${readingTimeLabel(meta.pageCount)}`
        : lengthLabel(band),
  });

  const era = eraBand(meta.firstPublishYear, refYear);
  signals.push({
    label: 'Era',
    level: 'none',
    note:
      meta.firstPublishYear != null
        ? `${eraLabel(era)} · first published ${meta.firstPublishYear}`
        : eraLabel(era),
  });

  const accessNote: Record<BookMetadata['ebookAccess'], string> = {
    public: 'Free full text (public domain)',
    borrowable: 'Borrowable digitally',
    printdisabled: 'Accessible copy for print-disabled readers',
    no_ebook: 'No digital edition found — print only',
    unknown: 'Availability unknown',
  };
  signals.push({
    label: 'Availability',
    level: 'none',
    note: accessNote[meta.ebookAccess],
  });

  signals.push({
    label: 'Editions',
    level: 'none',
    note:
      meta.editionCount > 0
        ? `${meta.editionCount.toLocaleString()} known edition${meta.editionCount === 1 ? '' : 's'}`
        : 'Unknown',
  });

  const englishish = meta.languages.some((l) => l.toLowerCase().startsWith('en'));
  signals.push({
    label: 'Language',
    level: 'none',
    note:
      meta.languages.length === 0
        ? 'Unknown'
        : englishish
          ? 'English edition available'
          : `Primarily ${meta.languages.slice(0, 3).join(', ')} — may need a translation`,
  });

  return signals;
}

function buildReasonsFor(
  meta: BookMetadata,
  general: ReadVerdictScore,
  refYear: number,
): string[] {
  const reasons: string[] = [];
  const src = general.sources[0];
  if (src?.available && general.breakdown.acclaim >= 74) {
    reasons.push(`Strongly rated by readers (${src.raw}).`);
  }
  if (general.breakdown.popularity >= 72) {
    reasons.push('A widely read title — lots of readers have picked it up.');
  }
  if (general.breakdown.readability >= 78) {
    reasons.push('Approachable length — an easy commitment to take on.');
  }
  if (general.breakdown.stayingPower >= 78) {
    const age = meta.firstPublishYear != null ? refYear - meta.firstPublishYear : null;
    reasons.push(
      age != null && age >= 25
        ? `Enduring — still in print ${age} years on, across ${meta.editionCount} editions.`
        : `Well established, with ${meta.editionCount} editions in circulation.`,
    );
  }
  if (meta.ebookAccess === 'public') {
    reasons.push('Free to read right now — full text is in the public domain.');
  } else if (meta.ebookAccess === 'borrowable') {
    reasons.push('Easy to start — borrowable digitally through Open Library.');
  }
  if (general.confidence === 'high') {
    reasons.push('Backed by a solid pool of rating data.');
  }
  if (reasons.length === 0) {
    reasons.push('A reasonable pick if the subject matter appeals to you.');
  }
  return reasons.slice(0, 6);
}

function buildReasonsAgainst(
  meta: BookMetadata,
  general: ReadVerdictScore,
): string[] {
  const reasons: string[] = [];
  const src = general.sources[0];
  if (src?.available && general.breakdown.acclaim < 50) {
    reasons.push(`Middling reader reception (${src.raw}).`);
  }
  if (meta.pageCount != null && meta.pageCount > 700) {
    reasons.push(`A long read (${meta.pageCount} pages) — a real time commitment.`);
  }
  const englishish = meta.languages.some((l) => l.toLowerCase().startsWith('en'));
  if (meta.languages.length > 0 && !englishish) {
    reasons.push('No English edition surfaced — you may need a translation.');
  }
  if (meta.ebookAccess === 'no_ebook') {
    reasons.push('No digital edition found — you would need a print copy.');
  }
  if (general.confidence === 'low') {
    reasons.push('Limited data available — this verdict is lower confidence.');
  }
  if (meta.ratingsCount > 0 && meta.ratingsCount < 15) {
    reasons.push(`Only ${meta.ratingsCount} ratings — reception is thinly sampled.`);
  }
  if (reasons.length === 0) {
    reasons.push('No major red flags — mostly a question of whether the premise grabs you.');
  }
  return reasons.slice(0, 6);
}

function buildOneLiner(tier: VerdictTier, meta: BookMetadata): string {
  const author = meta.authors[0] ? ` by ${meta.authors[0]}` : '';
  switch (tier) {
    case 'Must Read':
      return `A standout${author} — clear a weekend for this one.`;
    case 'Strong Read':
      return `A strong recommendation${author} — move it up your list.`;
    case 'Worth Reading':
      return 'Worth your time when the subject is calling to you.';
    case 'Possible Read':
      return 'A maybe — depends on your mood and how the premise lands.';
    case 'Low Priority':
      return 'Low priority — fine, but plenty of stronger options ahead of it.';
    case 'Skip':
    default:
      return 'Probably a skip unless the topic is exactly your thing.';
  }
}

export function buildVerdict(input: BuildVerdictInput): VerdictReport {
  const { meta } = input;
  const refYear = input.refYear ?? 2026;
  const general = computeGeneralScore(meta, { refYear });
  const tier = tierFromScore(general.score);

  return {
    book: meta,
    general,
    primaryCall: primaryCallFromTier(tier),
    tier,
    oneLiner: buildOneLiner(tier, meta),
    reasonsFor: buildReasonsFor(meta, general, refYear),
    reasonsAgainst: buildReasonsAgainst(meta, general),
    signals: buildSignals(meta, refYear),
    readingOptions: buildReadingOptions(meta),
    generatedAt: input.now ?? new Date().toISOString(),
  };
}
