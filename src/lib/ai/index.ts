/**
 * The provider-independent AI layer. Product code imports from here (or the
 * specific submodule) and depends only on these types + the orchestrator
 * functions — never on a vendor SDK. See CLAUDE.md architecture rules and the
 * discovery-brain design.
 */
export {
  CanonicalDiscoveryRequestSchema,
  validateCanonicalDiscoveryRequest,
  findInjection,
  GENRE_VOCAB,
  MEDIA_TYPES,
  DISCOVERY_INTENTS,
  REFERENCE_RELATIONSHIPS,
  MONETIZATION_KINDS,
  LIMITS,
  type CanonicalDiscoveryRequest,
  type ValidationResult,
} from './schemas';
export {
  interpretDiscoveryRequest,
  continueDiscoveryConversation,
  explainRecommendations,
} from './orchestrator';
export { canonicalToQuery, type MappedQuery, type PendingResolution } from './canonicalToQuery';
export { getAiProvider } from './provider';
export { PROMPT_VERSION } from './prompts';
export type {
  AiProvider,
  AiUsage,
  AiTurn,
  InterpretInput,
  InterpretationOutcome,
  ExplanationOutcome,
} from './types';
