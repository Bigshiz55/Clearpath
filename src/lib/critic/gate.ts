/**
 * THE COMPARATIVE INTENT BOUNDARY — one semantic contract, every serving mode.
 *
 * ── THE HOLE THIS CLOSES ──────────────────────────────────────────────────
 * GC1 put the critic path at step 0.9 of `/api/ask`. The AI orchestrator sits
 * at 0.7 and, in `AI_DISCOVERY_MODE='anthropic'`, RETURNS A FINISHED SEARCH
 * RESPONSE before `parseCriticRequest` is ever called. So the claim "one pure
 * parser for conversational, AI and naive modes" was not yet true: the same
 * comparative sentence would get the canonical GC1–GC5 pipeline under `legacy`
 * and an entirely independent interpretation under `anthropic`.
 *
 * The default mode being `legacy` does not make that safe. It makes it latent.
 *
 * ── THE RULE ──────────────────────────────────────────────────────────────
 * UNDERSTANDING WHAT WAS ASKED PRECEDES CHOOSING WHO ANSWERS IT. Provider
 * selection is downstream of comprehension, so comparative intent is detected
 * before any provider-specific brain can consume the request:
 *
 *   raw request
 *     -> comparative intent boundary        <- THIS MODULE
 *        -> comparative  : canonical GC1–GC5 path
 *        -> otherwise    : AI or legacy discovery routing, unchanged
 *
 * What this makes impossible: `anthropic` mode producing an independent
 * recommendation for a sentence that `legacy` mode routes into the critic.
 *
 * ── WHY IT IS A FUNCTION AND NOT A COMMENT IN THE ROUTE ───────────────────
 * An ordering rule that lives only as the physical position of two blocks is
 * one refactor away from silently reversing, and the failure would be invisible
 * until a provider flag flipped in production. Here it is a pure decision the
 * route delegates to and tests can execute directly.
 *
 * NOT a second parser. It calls `parseCriticRequest` — there is exactly one
 * implementation of what a comparison means, and no Anthropic-specific variant.
 *
 * PURE. No I/O, no model call.
 */

import { parseCriticRequest, type CriticRequest } from './request';

/** The serving modes `serverEnv.aiDiscoveryMode()` can return. */
export type ServingMode = 'legacy' | 'shadow' | 'anthropic';

/** Who is allowed to answer this request. */
export type AskConsumer = 'critic' | 'ai_discovery' | 'legacy_discovery';

export interface AskRouteDecision {
  comparative: boolean;
  /** The canonical request — IDENTICAL across serving modes, or null. */
  request: CriticRequest | null;
  consumer: AskConsumer;
}

export interface GateOptions {
  /** Conversation mode already bypasses the AI orchestrator upstream. */
  conversational?: boolean;
  /** A bare vocabulary word ("crime", "Hulu") is a browse, never a comparison. */
  lexical?: boolean;
}

/**
 * Decide who answers, having first decided what was asked.
 *
 * `mode` is read AFTER comparative intent, never before, and that ordering is
 * the entire content of this function.
 */
export function routeAsk(
  text: string,
  mode: ServingMode,
  opts: GateOptions = {},
): AskRouteDecision {
  /* 1 · WHAT WAS ASKED. One parser, no provider in scope yet. A bare
     vocabulary word ("crime", "Hulu") is a browse and never a comparison. */
  const request = opts.lexical ? null : parseCriticRequest(text ?? '');

  /* 2 · A COMPARISON IS THE CRITIC'S, IN EVERY MODE.
     Returning here before `mode` is consulted is what makes the guarantee
     structural: there is no expression below this line that a serving flag
     could evaluate differently. */
  if (request) return { comparative: true, request, consumer: 'critic' };

  /* 3 · ONLY NOW does provider selection happen, and only for requests the
     critic does not own. The AI orchestrator's purpose is untouched — it keeps
     every non-comparative ask it had before. */
  if (mode === 'anthropic' && !opts.conversational && (text ?? '').trim()) {
    return { comparative: false, request: null, consumer: 'ai_discovery' };
  }
  return { comparative: false, request: null, consumer: 'legacy_discovery' };
}
