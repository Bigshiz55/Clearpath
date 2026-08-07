export * from './types';
export { computeMatch, type MatchResult, type AxisContribution } from './match';
export { predictFinish, finishPhrase } from './predict';
export { buildTrial, type BuildTrialInput } from './trial';
export {
  answerCross,
  CROSS_QUESTIONS,
  type SpoilerLevel,
  type CrossAnswer,
  type CrossContext,
} from './crossExamination';
export { inferBookDna } from '@/lib/dna/inferBookDna';
