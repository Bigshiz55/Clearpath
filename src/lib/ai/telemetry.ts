import { recordAnalyticsEvent } from '@/lib/actions/passFeedback';
import { PROMPT_VERSION } from './prompts';
import type { AiUsage } from './types';

/**
 * AI USAGE TELEMETRY (§10). Records per-request accounting — provider, model,
 * token split, latency, estimated cost, route, outcome — so cost at 100k+ MAU is
 * observable. It records METADATA ONLY: never the raw request text, never the
 * interpreted subjects/titles, never any private message content. The one shape
 * fields carry is counts, enums, and booleans.
 *
 * Best-effort and non-throwing: telemetry can never break a discovery request.
 */

export type AiRoute = 'finder' | 'ask';
export type AiMode = 'shadow' | 'anthropic';

export interface AiEventFields {
  route: AiRoute;
  mode: AiMode;
  /** true when the model produced a validated request. */
  success: boolean;
  /** present only on failure: 'no_key' | 'timeout' | 'invalid' | 'error'. */
  failureReason?: string;
  /** the model asked for a disambiguating answer. */
  clarification?: boolean;
  /** discovery fell back to the deterministic path this request. */
  escalatedToLegacy?: boolean;
  usage?: AiUsage | null;
}

export async function recordAiUsage(fields: AiEventFields): Promise<void> {
  const u = fields.usage;
  const props: Record<string, unknown> = {
    promptVersion: PROMPT_VERSION,
    route: fields.route,
    mode: fields.mode,
    success: fields.success,
    failureReason: fields.failureReason ?? null,
    clarification: fields.clarification ?? false,
    escalatedToLegacy: fields.escalatedToLegacy ?? false,
    provider: u?.provider ?? null,
    model: u?.model ?? null,
    inputTokens: u?.inputTokens ?? null,
    outputTokens: u?.outputTokens ?? null,
    cacheReadInputTokens: u?.cacheReadInputTokens ?? null,
    cacheCreationInputTokens: u?.cacheCreationInputTokens ?? null,
    latencyMs: u?.latencyMs ?? null,
    estimatedCostUsd: u?.estimatedCostUsd ?? null,
  };
  await recordAnalyticsEvent('ai_discovery', props).catch(() => {});
}

/**
 * SHADOW COMPARISON telemetry (§13). In shadow mode legacy still serves the user;
 * this stores a SAFE structural comparison of what Claude would have done vs what
 * legacy did — again metadata only (counts and booleans), no query text, no
 * title lists — so the two brains can be evaluated before any switch-over.
 */
export interface ShadowCompareFields {
  route: AiRoute;
  aiSucceeded: boolean;
  aiClarification: boolean;
  aiIntent: string | null;
  /** structural deltas, not content */
  aiHardConstraintCount: number | null;
  aiReferenceTitleCount: number | null;
  legacyResultCount: number;
  usage?: AiUsage | null;
}

export async function recordShadowComparison(fields: ShadowCompareFields): Promise<void> {
  const u = fields.usage;
  await recordAnalyticsEvent('ai_discovery_shadow', {
    promptVersion: PROMPT_VERSION,
    route: fields.route,
    aiSucceeded: fields.aiSucceeded,
    aiClarification: fields.aiClarification,
    aiIntent: fields.aiIntent,
    aiHardConstraintCount: fields.aiHardConstraintCount,
    aiReferenceTitleCount: fields.aiReferenceTitleCount,
    legacyResultCount: fields.legacyResultCount,
    model: u?.model ?? null,
    inputTokens: u?.inputTokens ?? null,
    outputTokens: u?.outputTokens ?? null,
    cacheReadInputTokens: u?.cacheReadInputTokens ?? null,
    latencyMs: u?.latencyMs ?? null,
    estimatedCostUsd: u?.estimatedCostUsd ?? null,
  }).catch(() => {});
}
