import { NEUTRAL_MODEL, type RerankModel } from './reranker';

/**
 * The SHIPPED re-ranker model. Starts NEUTRAL (a strict no-op) so ranking is
 * unchanged until there's enough training data. Once the admin calibration
 * reports a fitted model that beats the objective-only baseline on held-out
 * data, a human promotes its coefficients here — exactly like `standardWeights.ts`.
 */
export const RERANK_MODEL: RerankModel = NEUTRAL_MODEL;
