// The Book Trial composer. Turns a Work + chosen Edition + Reader DNA into a
// full personalized trial: charges, prosecution, defense, evidence, witnesses,
// jury, prediction, and a decisive verdict. Pure and deterministic.
//
// Discipline: nothing here fabricates a statistic. Completion/DNF/cohort figures
// we do not have are emitted as 'insufficient' with a null value, and the jury
// is explicitly labelled modeled-similarity (not real cohort votes) until such
// data exists.

import type { Work, Edition, BookDna, RatingAggregate } from '@/lib/domain/book';
import { primaryAuthor } from '@/lib/domain/book';
import type { ReaderDna } from '@/lib/domain/readerDna';
import { confidenceLabel } from '@/lib/domain/confidence';
import { readingMinutes } from '@/lib/format';
import { inferBookDna } from '@/lib/dna/inferBookDna';
import { computeMatch, type MatchResult } from './match';
import { predictFinish, finishPhrase } from './predict';
import type {
  Trial,
  TrialPoint,
  EvidenceItem,
  WitnessGroup,
  JuryOutcome,
  Verdict,
  VerdictCall,
  Defendant,
  Prediction,
} from './types';

export interface BuildTrialInput {
  work: Work;
  edition?: Edition | null;
  dna: ReaderDna;
  now: string;
}

function hasNumericAxes(dna: BookDna): boolean {
  return [
    dna.pacing, dna.complexity, dna.darkness, dna.proseDensity, dna.worldbuilding,
    dna.romanceEmphasis, dna.humor, dna.emotionalIntensity, dna.literaryVsCommercial,
  ].some((a) => a && a.confidence > 0);
}

function docketFor(title: string, year: number | null): string {
  let h = 0;
  for (let i = 0; i < title.length; i++) h = (h * 31 + title.charCodeAt(i)) % 100000;
  return `RV-${year ?? '0000'}-${String(h).padStart(5, '0')}`;
}

function readerVal(dna: ReaderDna, key: string): number | null {
  const d = dna.dimensions[key];
  return d && d.confidence > 0 ? d.value : null;
}

function buildDefendant(work: Work, edition: Edition | undefined): Defendant {
  const pageCount = edition?.pageCount?.value ?? null;
  const audio = edition?.audioDurationMin?.value ?? null;
  return {
    title: work.title,
    author: primaryAuthor(work),
    year: work.firstPublishYear?.value ?? null,
    pageCount,
    estimatedReadingMinutes: readingMinutes(pageCount),
    audioDurationMin: audio,
    format: edition?.format ?? null,
    coverUrl: edition?.coverUrl ?? null,
    series: work.series?.name ?? null,
    seriesPosition: work.series?.position ?? null,
  };
}

function buildArguments(match: MatchResult): { prosecution: TrialPoint[]; defense: TrialPoint[] } {
  const prosecution: TrialPoint[] = [];
  const defense: TrialPoint[] = [];
  for (const c of match.contributions) {
    const point: TrialPoint = {
      label: c.label,
      detail:
        c.alignment >= 0
          ? `${c.label} sits close to your preference.`
          : `${c.label} pulls away from your preference.`,
      status: 'inferred',
      confidence: Math.abs(c.alignment) * c.weight,
      basis: c.readerKey,
    };
    if (c.alignment >= 0.25) defense.push(point);
    else if (c.alignment <= -0.25) prosecution.push(point);
  }
  return { prosecution: prosecution.slice(0, 5), defense: defense.slice(0, 5) };
}

function buildCharges(
  defendant: Defendant,
  prediction: Prediction,
  book: BookDna,
): string[] {
  const charges: string[] = [];
  if (prediction.strugglePoint) {
    charges.push(`Moving too slowly for pacing-sensitive readers`);
  }
  if (defendant.pageCount && defendant.pageCount > 600) {
    const hrs = defendant.estimatedReadingMinutes
      ? Math.round(defendant.estimatedReadingMinutes / 60)
      : null;
    charges.push(
      hrs ? `Demanding roughly ${hrs} hours of your attention` : 'Demanding a lengthy commitment',
    );
  }
  if (book.unreliableNarrator) charges.push('Depending on an unreliable narrator');
  if (defendant.seriesPosition && defendant.seriesPosition > 1) {
    charges.push('Assuming you have already read earlier books in the series');
  }
  const dark = book.darkness;
  if (dark && dark.confidence > 0 && dark.value > 0.7) {
    charges.push('Venturing into notably dark territory');
  }
  if (charges.length === 0) {
    charges.push('Standing accused of being a perfectly reasonable use of your time');
  }
  return charges;
}

function buildEvidence(
  edition: Edition | undefined,
  book: BookDna,
  defendant: Defendant,
): EvidenceItem[] {
  const items: EvidenceItem[] = [];
  const rating = edition?.rating;
  if (rating) {
    const agg = rating.value as RatingAggregate;
    items.push({
      key: 'reader_rating',
      label: 'General-reader rating',
      value: `${agg.average.toFixed(1)}/5 from ${agg.count.toLocaleString()} ratings`,
      status: rating.status,
      confidence: rating.confidence,
      source: rating.provenance.source,
    });
  } else {
    items.push({
      key: 'reader_rating',
      label: 'General-reader rating',
      value: null,
      status: 'insufficient',
      confidence: 0,
      source: null,
    });
  }

  const pacing = book.pacing;
  items.push({
    key: 'pacing_profile',
    label: 'Pacing profile',
    value: pacing && pacing.confidence > 0 ? (pacing.value >= 0.6 ? 'Brisk' : pacing.value >= 0.4 ? 'Moderate' : 'Slow build') : null,
    status: pacing && pacing.confidence > 0 ? 'inferred' : 'insufficient',
    confidence: pacing?.confidence ?? 0,
    source: pacing && pacing.confidence > 0 ? 'readverdict-inference' : null,
  });

  items.push({
    key: 'reading_time',
    label: 'Estimated reading time',
    value: defendant.estimatedReadingMinutes
      ? `≈ ${Math.round(defendant.estimatedReadingMinutes / 60)}h`
      : null,
    status: defendant.estimatedReadingMinutes ? 'estimated' : 'insufficient',
    confidence: defendant.estimatedReadingMinutes ? 0.6 : 0,
    source: defendant.estimatedReadingMinutes ? 'readverdict-estimate' : null,
  });

  // We do NOT have real completion/DNF cohort data — say so, never fabricate.
  items.push({
    key: 'completion_data',
    label: 'Completion / DNF data',
    value: null,
    status: 'insufficient',
    confidence: 0,
    source: null,
  });

  if (book.contentWarnings.length > 0) {
    items.push({
      key: 'content_warnings',
      label: 'Content considerations',
      value: book.contentWarnings.map((c) => c.label).join(', '),
      status: 'sourced',
      confidence: 0.5,
      source: 'readverdict-inference',
    });
  }
  return items;
}

function buildWitnesses(): WitnessGroup[] {
  // No matched-reader cohort data yet — one honest witness statement.
  return [
    {
      group: 'Readers with a similar taste profile',
      statement:
        'Not enough matched-reader data yet — this trial weighs your Reader DNA against the book’s profile, not other readers’ votes.',
      sampleSize: null,
      status: 'insufficient',
    },
  ];
}

function buildJury(match: MatchResult): JuryOutcome {
  const lean = match.score >= 62 ? 'for' : match.score <= 45 ? 'against' : 'split';
  const headline =
    lean === 'for'
      ? 'Jury leans toward reading.'
      : lean === 'against'
        ? 'Jury leans toward skipping.'
        : 'Jury is divided.';
  return {
    lean,
    headline,
    split: null, // no real cohort → never show a fake N–M tally
    sampleSize: null,
    confidence: match.confidence,
    rationale:
      'Based on how the book’s profile aligns with your Reader DNA across the axes we could assess.',
    dissent:
      match.contributions.find((c) => c.alignment < -0.25)?.label
        ? `Dissent centers on ${match.contributions.find((c) => c.alignment < -0.25)!.label.toLowerCase()}.`
        : null,
    basis: 'modeled-similarity',
  };
}

const SENTENCES: Record<VerdictCall, string> = {
  'READ IT': 'Clear a couple of evenings — this one earns the time.',
  'SKIP IT': 'Let this one walk; your shelf has better cases waiting.',
  'BORROW—DON’T BUY': 'Borrow it first; grant shelf space only if it delivers.',
  'BUY IT': 'Worth owning — buy it and settle in.',
  'LISTEN—DON’T READ': 'Queue the audiobook; the narration strengthens the case.',
  'READ—DON’T LISTEN': 'Read this one on the page; it rewards the eye.',
  'SAMPLE IT FIRST': 'Sample the first 30 pages before committing.',
  'WAIT FOR THE ADAPTATION': 'Hold for the adaptation unless the premise grabs you.',
  'SAVE FOR THE RIGHT MOOD': 'Shelve it for the right mood; not tonight.',
  'READ THE FIRST BOOK FIRST': 'Start at book one, then return for the verdict.',
  'CONTINUE THE SERIES': 'You’re invested — continue the series.',
  'DISMISS THE SERIES': 'A fair place to close the series out.',
  'RECONSIDER LATER': 'Set it aside and reconsider down the road.',
};

function decideCall(
  matchScore: number,
  prediction: Prediction,
  defendant: Defendant,
  dna: ReaderDna,
): VerdictCall {
  if (defendant.seriesPosition && defendant.seriesPosition > 1 && matchScore >= 55) {
    return 'READ THE FIRST BOOK FIRST';
  }
  const audio = readerVal(dna, 'audiobook_affinity');
  if (matchScore >= 78 && prediction.finishProbability >= 0.65) {
    if (audio != null && audio >= 0.7 && defendant.audioDurationMin != null) return 'LISTEN—DON’T READ';
    return 'READ IT';
  }
  if (matchScore >= 68) return 'BORROW—DON’T BUY';
  if (matchScore >= 57) return 'SAMPLE IT FIRST';
  if (matchScore >= 45) return 'SAVE FOR THE RIGHT MOOD';
  return 'SKIP IT';
}

function buildVerdict(
  match: MatchResult,
  prediction: Prediction,
  defendant: Defendant,
  dna: ReaderDna,
  defense: TrialPoint[],
  prosecution: TrialPoint[],
): Verdict {
  const call = decideCall(match.score, prediction, defendant, dna);
  const audio = readerVal(dna, 'audiobook_affinity');
  const bestFormat =
    audio == null ? null : audio >= 0.6 ? 'Audiobook' : audio <= 0.4 ? 'Print / e-book' : null;
  const ratingKnown = match.confidence !== 'low' && match.confidence !== 'none';
  const predictedRating = ratingKnown ? Math.round((match.score / 20) * 2) / 2 : null;

  return {
    call,
    matchScore: match.score,
    matchConfidence: match.confidence,
    predictedRating: predictedRating != null ? Math.min(5, predictedRating) : null,
    ratingConfidence: match.confidence,
    bestFormat,
    strongestReason: defense[0]?.label ?? null,
    strongestConcern: prosecution[0]?.label ?? null,
    sentence: SENTENCES[call],
  };
}

export function buildTrial(input: BuildTrialInput): Trial {
  const { work, dna, now } = input;
  const edition = input.edition ?? work.editions[0];
  const book: BookDna = hasNumericAxes(work.bookDna)
    ? work.bookDna
    : inferBookDna({ subjects: work.subjects, pageCount: edition?.pageCount?.value ?? null });

  const defendant = buildDefendant(work, edition);
  const match = computeMatch(dna, book);
  const prediction = predictFinish({
    match,
    book,
    dna,
    pageCount: defendant.pageCount,
  });
  const { prosecution, defense } = buildArguments(match);
  const charges = buildCharges(defendant, prediction, book);
  const evidence = buildEvidence(edition, book, defendant);
  const witnesses = buildWitnesses();
  const jury = buildJury(match);
  const verdict = buildVerdict(match, prediction, defendant, dna, defense, prosecution);

  const noteBits: string[] = [];
  noteBits.push(`Match confidence: ${match.confidence}.`);
  noteBits.push(finishPhrase(prediction) + '.');
  if (match.confidence === 'low' || match.confidence === 'none') {
    noteBits.push('Reader DNA is still thin — add reading history to sharpen this verdict.');
  }

  return {
    caseName: `THE PEOPLE v. ${work.title.toUpperCase()}`,
    docket: docketFor(work.title, defendant.year),
    defendant,
    charges,
    prosecution,
    defense,
    evidence,
    witnesses,
    jury,
    prediction,
    verdict,
    confidenceNote: noteBits.join(' '),
    generatedAt: now,
  };
}

export { finishPhrase };
