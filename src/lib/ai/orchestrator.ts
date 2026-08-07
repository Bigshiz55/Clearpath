import 'server-only';
import { getAiProvider } from './provider';
import { recordAiUsage, type AiRoute } from './telemetry';
import type { AiProvider, AiTurn, ExplanationOutcome, InterpretationOutcome } from './types';

/**
 * THE ORCHESTRATOR — the internal interface the rest of the product uses to reach
 * the AI layer. Product code calls THESE functions; it never touches a provider
 * SDK, a prompt, or the schema directly. The functions are provider-independent,
 * self-report usage telemetry, and ALWAYS degrade to a null request/explanation
 * rather than throw — so a discovery route can fall back to its deterministic
 * path on any AI failure (§12 safe fallback).
 *
 * "Claude understands. WatchVerd1ct verifies." The request returned here is
 * already validated against the trust boundary (strict schema + injection scan);
 * the caller still resolves real entities and enforces hard constraints against
 * real data before showing anything.
 */

function todayIso(now: Date): string {
  return now.toISOString().slice(0, 10);
}

/** Interpret a single (or first-turn) discovery request into a validated
 *  CanonicalDiscoveryRequest. Returns request:null on any failure. */
export async function interpretDiscoveryRequest(args: {
  text: string;
  route: AiRoute;
  now?: Date;
  timeoutMs?: number;
  /** When false, telemetry is skipped (e.g. offline evaluation). */
  telemetry?: boolean;
  /** Test/eval seam — inject a provider instead of the env-configured one. */
  provider?: AiProvider | null;
}): Promise<InterpretationOutcome> {
  const provider = args.provider ?? getAiProvider();
  if (!provider) {
    const outcome: InterpretationOutcome = { request: null, usage: null, failureReason: 'no_key' };
    if (args.telemetry !== false) {
      await recordAiUsage({ route: args.route, mode: 'anthropic', success: false, failureReason: 'no_key', escalatedToLegacy: true });
    }
    return outcome;
  }
  const outcome = await provider.interpret({
    text: args.text,
    todayIso: todayIso(args.now ?? new Date()),
    timeoutMs: args.timeoutMs,
  });
  if (args.telemetry !== false) {
    await recordAiUsage({
      route: args.route,
      mode: 'anthropic',
      success: outcome.request != null,
      failureReason: outcome.failureReason,
      clarification: outcome.request?.clarificationRequired ?? false,
      escalatedToLegacy: outcome.request == null,
      usage: outcome.usage,
    });
  }
  return outcome;
}

/** Continue a multi-turn discovery conversation. The compact prior turns are
 *  handed to the model alongside the new text; the returned request is the FULL
 *  merged interpretation (the model reconciles "newer" against the prior ask).
 *  Same safe-degradation contract as interpretDiscoveryRequest. */
export async function continueDiscoveryConversation(args: {
  text: string;
  history: AiTurn[];
  route: AiRoute;
  now?: Date;
  timeoutMs?: number;
  telemetry?: boolean;
  provider?: AiProvider | null;
}): Promise<InterpretationOutcome> {
  const provider = args.provider ?? getAiProvider();
  if (!provider) {
    if (args.telemetry !== false) {
      await recordAiUsage({ route: args.route, mode: 'anthropic', success: false, failureReason: 'no_key', escalatedToLegacy: true });
    }
    return { request: null, usage: null, failureReason: 'no_key' };
  }
  const outcome = await provider.interpret({
    text: args.text,
    history: args.history,
    todayIso: todayIso(args.now ?? new Date()),
    timeoutMs: args.timeoutMs,
  });
  if (args.telemetry !== false) {
    await recordAiUsage({
      route: args.route,
      mode: 'anthropic',
      success: outcome.request != null,
      failureReason: outcome.failureReason,
      clarification: outcome.request?.clarificationRequired ?? false,
      escalatedToLegacy: outcome.request == null,
      usage: outcome.usage,
    });
  }
  return outcome;
}

/** Explain already-qualified recommendations. Never re-ranks and never sources
 *  titles — it only annotates the titles it is given. Returns text:null on
 *  failure (the caller simply omits the explanation). */
export async function explainRecommendations(args: {
  summary: string;
  titles: { title: string; year: number | null; whyQualified: string }[];
  now?: Date;
  timeoutMs?: number;
  provider?: AiProvider | null;
}): Promise<ExplanationOutcome> {
  const provider = args.provider ?? getAiProvider();
  if (!provider) return { text: null, usage: null };
  return provider.explain({
    summary: args.summary,
    titles: args.titles,
    todayIso: todayIso(args.now ?? new Date()),
    timeoutMs: args.timeoutMs,
  });
}
