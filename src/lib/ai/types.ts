import type { CanonicalDiscoveryRequest } from './schemas';

/**
 * PROVIDER-INDEPENDENT AI TYPES.
 *
 * Product code (Finder, Ask, DNA, validation, tools) depends only on the shapes
 * in this file and the orchestrator's functions — never on a vendor SDK. Swapping
 * `AI_PROVIDER=anthropic` for another provider later changes only which
 * `AiProvider` implementation the factory returns; nothing here moves.
 */

/** Per-call usage + cost accounting, normalized across providers. */
export interface AiUsage {
  provider: string;
  model: string;
  inputTokens: number;
  outputTokens: number;
  /** Prompt-cache read/creation tokens when the provider reports them. */
  cacheReadInputTokens: number;
  cacheCreationInputTokens: number;
  latencyMs: number;
  /** USD estimate from the provider's per-token price table. */
  estimatedCostUsd: number;
}

/** A compact multi-turn transcript entry. We keep canonical state, not raw prose,
 *  as the durable memory (see §8); these are only the immediate turns handed to
 *  the model for the current interpretation. */
export interface AiTurn {
  role: 'user' | 'assistant';
  content: string;
}

/** What every provider call returns: the validated request (or null on any
 *  failure) plus usage. `null` request means "degrade to the deterministic
 *  path" — it is never an error to handle upstream, only a signal. */
export interface InterpretationOutcome {
  request: CanonicalDiscoveryRequest | null;
  usage: AiUsage | null;
  /** Short machine reason when request is null: 'no_key' | 'timeout' | 'invalid' | 'error'. */
  failureReason?: string;
}

/** A free-text explanation of why qualified results fit — never a re-ranking and
 *  never a source of new titles. */
export interface ExplanationOutcome {
  text: string | null;
  usage: AiUsage | null;
}

export interface InterpretInput {
  /** The user's raw request text. */
  text: string;
  /** Prior turns for a multi-turn refinement (compact; optional). */
  history?: AiTurn[];
  /** Wall-clock ISO date so "the last 20 years" resolves deterministically
   *  server-side and the model needn't guess today's date. */
  todayIso: string;
  /** Abort deadline in ms; the provider must not exceed it. */
  timeoutMs?: number;
}

/**
 * THE ONE INTERFACE A PROVIDER IMPLEMENTS.
 *
 * Implementations MUST be server-only, MUST degrade to `request: null` on any
 * failure (missing key, timeout, non-200, unparseable/invalid output) rather
 * than throw, and MUST NOT invent catalog facts — they return interpreted
 * intent that the app resolves and verifies afterward.
 */
export interface AiProvider {
  readonly name: string;
  readonly model: string;
  interpret(input: InterpretInput): Promise<InterpretationOutcome>;
  explain(input: {
    summary: string;
    titles: { title: string; year: number | null; whyQualified: string }[];
    todayIso: string;
    timeoutMs?: number;
  }): Promise<ExplanationOutcome>;
}
