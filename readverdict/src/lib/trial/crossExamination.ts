// Cross-examination — quick, spoiler-controlled questions about a book. Answers
// distinguish sourced facts from inference and never fabricate. When we lack the
// data, the answer says so. Default spoiler level is 'none'.

import type { BookDna } from '@/lib/domain/book';
import type { EvidenceStatus } from '@/lib/domain/confidence';

export type SpoilerLevel = 'none' | 'mild' | 'full';

export interface CrossQuestion {
  id: string;
  label: string;
  /** Whether answering meaningfully can touch spoilers. */
  spoilerSensitive: boolean;
}

export const CROSS_QUESTIONS: readonly CrossQuestion[] = [
  { id: 'slow_burn', label: 'Is it really a slow burn?', spoilerSensitive: false },
  { id: 'romance_takeover', label: 'Does the romance take over?', spoilerSensitive: false },
  { id: 'need_previous', label: 'Do I need to read the previous book?', spoilerSensitive: false },
  { id: 'scary', label: 'Is it genuinely scary?', spoilerSensitive: false },
  { id: 'confusing', label: 'Is it confusing?', spoilerSensitive: false },
  { id: 'improves', label: 'Does it improve after the first 50 pages?', spoilerSensitive: false },
  { id: 'cliffhanger', label: 'Does it end on a cliffhanger?', spoilerSensitive: true },
  { id: 'ending_worth', label: 'Is the ending worth it?', spoilerSensitive: true },
  { id: 'twist_predictable', label: 'Is the twist predictable?', spoilerSensitive: true },
  { id: 'dog_dies', label: 'Does the dog die?', spoilerSensitive: false },
  { id: 'political', label: 'How political is it?', spoilerSensitive: false },
  { id: 'hype_justified', label: 'Is the hype justified?', spoilerSensitive: false },
] as const;

export interface CrossAnswer {
  answer: string;
  status: EvidenceStatus;
  confidence: number;
  /** True when a spoiler-gated answer was withheld at the current level. */
  withheld: boolean;
}

export interface CrossContext {
  book: BookDna;
  seriesPosition: number | null;
  hasAudio: boolean;
}

const val = (a: BookDna[keyof BookDna]): number | null =>
  a && typeof a === 'object' && 'value' in a && 'confidence' in a && a.confidence > 0 ? a.value : null;

function insufficient(answer: string): CrossAnswer {
  return { answer, status: 'insufficient', confidence: 0, withheld: false };
}

export function answerCross(
  id: string,
  ctx: CrossContext,
  spoiler: SpoilerLevel,
): CrossAnswer {
  const q = CROSS_QUESTIONS.find((x) => x.id === id);
  if (q?.spoilerSensitive && spoiler === 'none') {
    return {
      answer: 'That answer can touch spoilers — raise the spoiler level to hear it.',
      status: 'not_applicable' as EvidenceStatus,
      confidence: 0,
      withheld: true,
    };
  }

  const { book, seriesPosition } = ctx;
  switch (id) {
    case 'slow_burn': {
      const p = val(book.pacing);
      if (p == null) return insufficient('No reliable pacing read yet.');
      return {
        answer: p < 0.4 ? 'Yes — it builds deliberately.' : p < 0.6 ? 'Moderately paced.' : 'No — it moves quickly.',
        status: 'inferred',
        confidence: 0.4,
        withheld: false,
      };
    }
    case 'romance_takeover': {
      const r = val(book.romanceEmphasis);
      if (r == null) return insufficient('No clear romance signal.');
      return {
        answer: r > 0.6 ? 'Romance is central.' : r > 0.3 ? 'There is a romantic subplot.' : 'Romance is minor at most.',
        status: 'inferred',
        confidence: 0.4,
        withheld: false,
      };
    }
    case 'need_previous':
      return seriesPosition && seriesPosition > 1
        ? { answer: `Yes — this is entry #${seriesPosition} in a series; start earlier.`, status: 'sourced', confidence: 0.7, withheld: false }
        : { answer: 'No — it reads as a standalone / series opener.', status: 'inferred', confidence: 0.5, withheld: false };
    case 'scary': {
      const d = val(book.darkness);
      if (d == null) return insufficient('No darkness/horror read yet.');
      return { answer: d > 0.7 ? 'It leans dark and can be intense.' : 'Not especially frightening.', status: 'inferred', confidence: 0.4, withheld: false };
    }
    case 'confusing': {
      const c = val(book.complexity);
      if (c == null) return insufficient('No complexity read yet.');
      return { answer: c > 0.7 ? 'It asks for attention — layered and complex.' : 'It is straightforward to follow.', status: 'inferred', confidence: 0.4, withheld: false };
    }
    case 'improves': {
      const p = val(book.pacing);
      if (p != null && p < 0.4) return { answer: 'If slow openings bother you, the early chapters are the real risk.', status: 'inferred', confidence: 0.35, withheld: false };
      return insufficient('No page-level pacing data — cannot say precisely.');
    }
    case 'cliffhanger':
      return book.endingStyle === 'cliffhanger'
        ? { answer: 'Yes — it ends on a cliffhanger.', status: 'inferred', confidence: 0.4, withheld: false }
        : insufficient('No reliable ending data.');
    case 'ending_worth':
    case 'twist_predictable':
      return insufficient('No verified reader data on the ending yet — we won’t guess.');
    case 'dog_dies':
      return insufficient('No content-warning data indicates that — but absence is not proof. Check a content-warning source to be sure.');
    case 'political':
      return insufficient('No reliable signal on political content.');
    case 'hype_justified':
      return insufficient('Not enough matched-reader satisfaction data to compare against the hype.');
    default:
      return insufficient('No answer available for that question yet.');
  }
}
