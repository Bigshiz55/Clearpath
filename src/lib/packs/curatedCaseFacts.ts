import 'server-only';
import type { CaseSubjectRole, CaseTimelineEventType, FactConfidence } from './types';

export interface CuratedSubject {
  fullName: string;
  role: CaseSubjectRole;
  outcome: string | null;
  sourceUrl: string;
  confidence: FactConfidence;
}

export interface CuratedTimelineEvent {
  eventType: CaseTimelineEventType;
  eventDate: string | null;
  headline: string;
  detail: string | null;
  sourceUrl: string;
  confidence: FactConfidence;
  disputed: boolean;
}

export interface CuratedCaseFact {
  /**
   * Candidate title strings to match against an EXISTING `cases` row (ILIKE).
   * This dataset never creates a case — real case rows only ever come from
   * the extraction/matching pipeline against actual TVmaze episode data
   * (src/lib/cases/matchingJob.ts). If none of these match a real row, the
   * facts below simply aren't attached to anything; nothing is written.
   */
  titleMatches: string[];
  location: string | null;
  incidentDate: string | null;
  statusSummary: string;
  subjects: CuratedSubject[];
  timeline: CuratedTimelineEvent[];
}

/**
 * A small, hand-curated set of extensively documented, high-profile cases —
 * the kind of case a true-crime schedule (Dateline, 48 Hours, ID) covers
 * repeatedly. Every fact below is sourced; `role` (the position a person
 * held AT THE TIME) is kept separate from `outcome` (the eventual, separately
 * -sourced legal result) per this Pack's data-honesty rule — never collapsed
 * into one label. Disputed/contested claims are marked `disputed: true`
 * rather than stated as settled fact.
 */
export const CURATED_CASE_FACTS: CuratedCaseFact[] = [
  {
    titleMatches: ['Laci Peterson', 'Scott Peterson'],
    location: 'Modesto, California',
    incidentDate: '2002-12-24',
    statusSummary: 'Scott Peterson was convicted in 2004 of murdering his wife Laci and their unborn son.',
    subjects: [
      {
        fullName: 'Laci Peterson',
        role: 'victim',
        outcome: null,
        sourceUrl: 'https://www.cnn.com/2024/01/20/us/scott-peterson-laci-peterson-case/index.html',
        confidence: 'verified',
      },
      {
        fullName: 'Scott Peterson',
        role: 'charged',
        outcome: 'Convicted in 2004 of first-degree murder of Laci and second-degree murder of their unborn son; sentenced to death, later reduced to life without parole after California’s Supreme Court overturned the death sentence in 2020.',
        sourceUrl: 'https://www.cnn.com/2024/01/20/us/scott-peterson-laci-peterson-case/index.html',
        confidence: 'verified',
      },
    ],
    timeline: [
      {
        eventType: 'incident',
        eventDate: '2002-12-24',
        headline: 'Laci Peterson reported missing',
        detail: 'Laci Peterson, eight months pregnant, is reported missing from the Petersons’ home in Modesto, California.',
        sourceUrl: 'https://www.cnn.com/2024/01/20/us/scott-peterson-laci-peterson-case/index.html',
        confidence: 'verified',
        disputed: false,
      },
      {
        eventType: 'investigation',
        eventDate: '2003-01-24',
        headline: 'Amber Frey comes forward',
        detail: 'Amber Frey tells police she had been having an affair with Scott Peterson, which began in November 2002.',
        sourceUrl: 'https://www.cnn.com/2024/01/20/us/scott-peterson-laci-peterson-case/index.html',
        confidence: 'verified',
        disputed: false,
      },
      {
        eventType: 'arrest',
        eventDate: '2003-04-18',
        headline: 'Remains identified and Scott Peterson arrested',
        detail: 'Bodies recovered from San Francisco Bay are confirmed as Laci and the couple’s unborn son; Scott Peterson is arrested in San Diego on suspicion of double homicide.',
        sourceUrl: 'https://www.cnn.com/2024/01/20/us/scott-peterson-laci-peterson-case/index.html',
        confidence: 'verified',
        disputed: false,
      },
      {
        eventType: 'trial',
        eventDate: '2004-06-01',
        headline: 'Trial begins',
        detail: 'Opening statements begin in Redwood City after a change of venue from Stanislaus County.',
        sourceUrl: 'https://www.cnn.com/2024/01/20/us/scott-peterson-laci-peterson-case/index.html',
        confidence: 'verified',
        disputed: false,
      },
      {
        eventType: 'verdict',
        eventDate: '2004-11-12',
        headline: 'Convicted on both counts',
        detail: 'A jury convicts Scott Peterson of first-degree murder with special circumstances for Laci’s death and second-degree murder for their unborn son’s death.',
        sourceUrl: 'https://www.cnn.com/2024/01/20/us/scott-peterson-laci-peterson-case/index.html',
        confidence: 'verified',
        disputed: false,
      },
      {
        eventType: 'sentencing',
        eventDate: '2005-03-16',
        headline: 'Sentenced to death',
        detail: 'Judge Alfred Delucchi formally sentences Peterson to death, following the jury’s December 2004 recommendation.',
        sourceUrl: 'https://www.cnn.com/2024/01/20/us/scott-peterson-laci-peterson-case/index.html',
        confidence: 'verified',
        disputed: false,
      },
      {
        eventType: 'appeal',
        eventDate: '2020-08-24',
        headline: 'Death sentence overturned',
        detail: 'The California Supreme Court overturns Peterson’s death sentence over jury-selection errors; the murder convictions themselves stand.',
        sourceUrl: 'https://www.cnn.com/2024/01/20/us/scott-peterson-laci-peterson-case/index.html',
        confidence: 'verified',
        disputed: false,
      },
    ],
  },
  {
    titleMatches: ['Casey Anthony', 'Caylee Anthony'],
    location: 'Orlando, Florida',
    incidentDate: '2008-06-16',
    statusSummary: 'Casey Anthony was tried for the death of her daughter Caylee and acquitted of murder in 2011.',
    subjects: [
      {
        fullName: 'Caylee Anthony',
        role: 'victim',
        outcome: null,
        sourceUrl: 'https://abcnews.com/US/casey-anthony-trial-timeline-key-events/story?id=13990853',
        confidence: 'verified',
      },
      {
        fullName: 'Casey Anthony',
        role: 'defendant',
        outcome: 'Acquitted of first-degree murder, aggravated child abuse, and manslaughter on July 5, 2011; convicted only of four misdemeanor counts of providing false information to law enforcement.',
        sourceUrl: 'https://abcnews.com/US/casey-anthony-trial-timeline-key-events/story?id=13990853',
        confidence: 'verified',
      },
    ],
    timeline: [
      {
        eventType: 'incident',
        eventDate: '2008-06-16',
        headline: 'Caylee Anthony last reported seen',
        detail: 'June 16, 2008 is the date Caylee Anthony was last reported seen alive.',
        sourceUrl: 'https://abcnews.com/US/casey-anthony-trial-timeline-key-events/story?id=13990853',
        confidence: 'reported',
        disputed: false,
      },
      {
        eventType: 'investigation',
        eventDate: '2008-07-15',
        headline: 'Grandmother reports Caylee missing',
        detail: 'Cindy Anthony calls police to report that her granddaughter Caylee had been missing for a month.',
        sourceUrl: 'https://abcnews.com/US/casey-anthony-trial-timeline-key-events/story?id=13990853',
        confidence: 'verified',
        disputed: false,
      },
      {
        eventType: 'charges',
        eventDate: '2008-10-14',
        headline: 'Casey Anthony charged with first-degree murder',
        detail: 'A grand jury indicts Casey Anthony on charges including first-degree murder.',
        sourceUrl: 'https://abcnews.com/US/casey-anthony-trial-timeline-key-events/story?id=13990853',
        confidence: 'verified',
        disputed: false,
      },
      {
        eventType: 'investigation',
        eventDate: '2008-12-19',
        headline: 'Remains identified as Caylee',
        detail: 'Skeletal remains found near the Anthony home in December are confirmed to be Caylee’s.',
        sourceUrl: 'https://abcnews.com/US/casey-anthony-trial-timeline-key-events/story?id=13990853',
        confidence: 'verified',
        disputed: false,
      },
      {
        eventType: 'trial',
        eventDate: '2011-05-24',
        headline: 'Trial opens in Orlando',
        detail: 'Opening statements are delivered in the Orange County courthouse after a change of venue.',
        sourceUrl: 'https://abcnews.com/US/casey-anthony-trial-timeline-key-events/story?id=13990853',
        confidence: 'verified',
        disputed: false,
      },
      {
        eventType: 'verdict',
        eventDate: '2011-07-05',
        headline: 'Acquitted of murder',
        detail: 'The jury acquits Casey Anthony of murder, aggravated child abuse, and manslaughter, convicting her only on four counts of lying to police.',
        sourceUrl: 'https://abcnews.com/US/casey-anthony-trial-timeline-key-events/story?id=13990853',
        confidence: 'verified',
        disputed: false,
      },
    ],
  },
  {
    titleMatches: ['JonBenet Ramsey', 'JonBenét Ramsey', 'JonBenet'],
    location: 'Boulder, Colorado',
    incidentDate: '1996-12-26',
    statusSummary: 'The murder of 6-year-old JonBenét Ramsey remains unsolved; no one has ever been charged.',
    subjects: [
      {
        fullName: 'JonBenét Ramsey',
        role: 'victim',
        outcome: null,
        sourceUrl: 'https://www.biography.com/crime/jonbenet-ramsey-murder-investigation-timeline',
        confidence: 'verified',
      },
      {
        fullName: 'John and Patsy Ramsey',
        role: 'person_of_interest',
        outcome: 'Named the leading suspects by Boulder police in April 1997; formally exonerated by Boulder County DA Mary Lacy in a July 9, 2008 letter citing unmatched “touch DNA” from an unidentified male. Some Boulder detectives who worked the case publicly disputed the exoneration.',
        sourceUrl: 'https://www.goodmorningamerica.com/news/story/da-opens-cleared-ramsey-family-jonbenets-murder-43106426',
        confidence: 'reported',
      },
      {
        fullName: 'John Mark Karr',
        role: 'person_of_interest',
        outcome: 'Arrested in Thailand in August 2006 after claiming involvement; DNA testing excluded him and charges were dropped 12 days later.',
        sourceUrl: 'https://www.cnn.com/us/jonbenet-ramsey-murder-fast-facts',
        confidence: 'verified',
      },
    ],
    timeline: [
      {
        eventType: 'incident',
        eventDate: '1996-12-26',
        headline: 'JonBenét Ramsey found dead',
        detail: 'JonBenét’s body is found in the basement of the family’s Boulder, Colorado home, hours after she was reported missing over a ransom note.',
        sourceUrl: 'https://www.biography.com/crime/jonbenet-ramsey-murder-investigation-timeline',
        confidence: 'verified',
        disputed: false,
      },
      {
        eventType: 'investigation',
        eventDate: '1997-04-01',
        headline: 'Ramseys named suspects',
        detail: 'Boulder police identify John and Patsy Ramsey as the main suspects; handwriting analysis later rules out John Ramsey as the note’s author, while examiners say Patsy Ramsey cannot be ruled out.',
        sourceUrl: 'https://www.newsnationnow.com/crime/jonbenet-ramsey-timeline/',
        confidence: 'reported',
        disputed: true,
      },
      {
        eventType: 'development',
        eventDate: '2006-08-16',
        headline: 'John Mark Karr arrested, then cleared',
        detail: 'Karr is arrested in Thailand after claiming to have killed JonBenét; DNA testing excludes him and prosecutors drop the case on August 28, 2006.',
        sourceUrl: 'https://www.cnn.com/us/jonbenet-ramsey-murder-fast-facts',
        confidence: 'verified',
        disputed: false,
      },
      {
        eventType: 'development',
        eventDate: '2008-07-09',
        headline: 'DA formally clears the Ramsey family',
        detail: 'Boulder County DA Mary Lacy sends a letter stating unmatched touch DNA points to an unknown male, writing "I am deeply sorry" for any suggestion of the family’s involvement. The finding remained contested by some investigators.',
        sourceUrl: 'https://www.goodmorningamerica.com/news/story/da-opens-cleared-ramsey-family-jonbenets-murder-43106426',
        confidence: 'reported',
        disputed: true,
      },
    ],
  },
];
