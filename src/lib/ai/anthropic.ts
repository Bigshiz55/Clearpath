import 'server-only';
import Anthropic from '@anthropic-ai/sdk';
import { zodOutputFormat } from '@anthropic-ai/sdk/helpers/zod';
import { serverEnv } from '@/lib/env';
import {
  CanonicalDiscoveryRequestSchema,
  validateCanonicalDiscoveryRequest,
} from './schemas';
import { INTERPRETER_SYSTEM_PROMPT, EXPLAINER_SYSTEM_PROMPT } from './prompts';
import type {
  AiProvider,
  AiUsage,
  ExplanationOutcome,
  InterpretInput,
  InterpretationOutcome,
} from './types';

/**
 * THE ANTHROPIC PROVIDER — the one concrete implementation of AiProvider.
 *
 * It is the ONLY module in the product allowed to import the Anthropic SDK. It
 * turns a viewer request into a validated CanonicalDiscoveryRequest via the
 * official server-side API (messages.parse + a Zod output format), and it
 * ALWAYS degrades to `request: null` rather than throwing: no key, timeout,
 * non-200, or output that fails our trust-boundary validation each return a
 * null request so the caller can fall back to the deterministic path.
 *
 * The API key is read server-side only (serverEnv.anthropicKey) and is never
 * logged, echoed, or attached to any response.
 */

/** Per-1M-token USD prices for cost estimation only (telemetry). Approximate and
 *  intentionally conservative; not used for anything user-facing. Cache reads are
 *  ~0.1x input, cache writes ~1.25x input (Anthropic's published ratios). */
const PRICING: Record<string, { input: number; output: number }> = {
  'claude-sonnet-5': { input: 3, output: 15 },
  'claude-opus-5': { input: 5, output: 25 },
  'claude-opus-4-8': { input: 5, output: 25 },
  'claude-haiku-4-5': { input: 1, output: 5 },
};

function estimateCostUsd(model: string, u: Omit<AiUsage, 'estimatedCostUsd' | 'provider' | 'model' | 'latencyMs'>): number {
  const price = PRICING[model] ?? { input: 3, output: 15 };
  const freshInput = Math.max(0, u.inputTokens);
  const cost =
    (freshInput * price.input +
      u.cacheReadInputTokens * price.input * 0.1 +
      u.cacheCreationInputTokens * price.input * 1.25 +
      u.outputTokens * price.output) /
    1_000_000;
  return Math.round(cost * 1e6) / 1e6;
}

const DEFAULT_TIMEOUT_MS = 9000;
/** Bounded output — a canonical request is small; this caps cost and latency. */
const MAX_OUTPUT_TOKENS = 700;

type RawUsage = {
  input_tokens?: number | null;
  output_tokens?: number | null;
  cache_read_input_tokens?: number | null;
  cache_creation_input_tokens?: number | null;
};

function toUsage(model: string, raw: RawUsage | undefined, latencyMs: number): AiUsage {
  const partial = {
    inputTokens: raw?.input_tokens ?? 0,
    outputTokens: raw?.output_tokens ?? 0,
    cacheReadInputTokens: raw?.cache_read_input_tokens ?? 0,
    cacheCreationInputTokens: raw?.cache_creation_input_tokens ?? 0,
  };
  return {
    provider: 'anthropic',
    model,
    ...partial,
    latencyMs,
    estimatedCostUsd: estimateCostUsd(model, partial),
  };
}

export class AnthropicProvider implements AiProvider {
  readonly name = 'anthropic';
  readonly model: string;
  private readonly apiKey: string;

  constructor(apiKey: string, model: string) {
    this.apiKey = apiKey;
    this.model = model;
  }

  private client(): Anthropic {
    return new Anthropic({ apiKey: this.apiKey, timeout: DEFAULT_TIMEOUT_MS, maxRetries: 1 });
  }

  async interpret(input: InterpretInput): Promise<InterpretationOutcome> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), input.timeoutMs ?? DEFAULT_TIMEOUT_MS);
    const started = Date.now();
    try {
      const userContent = [
        `today: ${input.todayIso}`,
        `request: ${input.text}`,
      ].join('\n');

      const messages: Anthropic.MessageParam[] = [
        ...(input.history ?? []).map((t) => ({ role: t.role, content: t.content }) as Anthropic.MessageParam),
        { role: 'user', content: userContent },
      ];

      const res = await this.client().messages.parse(
        {
          model: this.model,
          max_tokens: MAX_OUTPUT_TOKENS,
          // The system prompt is the stable, cacheable prefix (§10 prompt caching).
          system: [{ type: 'text', text: INTERPRETER_SYSTEM_PROMPT, cache_control: { type: 'ephemeral' } }],
          messages,
          output_config: { format: zodOutputFormat(CanonicalDiscoveryRequestSchema) },
        },
        { signal: controller.signal },
      );

      const usage = toUsage(this.model, res.usage as RawUsage | undefined, Date.now() - started);

      // The SDK already parsed against the schema, but the trust boundary is OUR
      // validator (strict + injection scan) — re-validate before trusting it.
      const raw = res.parsed_output;
      if (raw == null) return { request: null, usage, failureReason: 'invalid' };
      const validated = validateCanonicalDiscoveryRequest(raw);
      if (!validated.ok) return { request: null, usage, failureReason: 'invalid' };
      return { request: validated.value, usage };
    } catch (err) {
      const reason =
        err instanceof Error && (err.name === 'AbortError' || /abort|timeout/i.test(err.message))
          ? 'timeout'
          : 'error';
      return { request: null, usage: null, failureReason: reason };
    } finally {
      clearTimeout(timer);
    }
  }

  async explain(input: {
    summary: string;
    titles: { title: string; year: number | null; whyQualified: string }[];
    todayIso: string;
    timeoutMs?: number;
  }): Promise<ExplanationOutcome> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), input.timeoutMs ?? DEFAULT_TIMEOUT_MS);
    const started = Date.now();
    try {
      const payload = {
        request_summary: input.summary,
        titles: input.titles.slice(0, 20),
      };
      const res = await this.client().messages.create(
        {
          model: this.model,
          max_tokens: 600,
          system: [{ type: 'text', text: EXPLAINER_SYSTEM_PROMPT, cache_control: { type: 'ephemeral' } }],
          messages: [{ role: 'user', content: JSON.stringify(payload) }],
        },
        { signal: controller.signal },
      );
      const usage = toUsage(this.model, res.usage as RawUsage | undefined, Date.now() - started);
      const text = res.content
        .filter((b): b is Anthropic.TextBlock => b.type === 'text')
        .map((b) => b.text)
        .join('\n')
        .trim();
      return { text: text || null, usage };
    } catch {
      return { text: null, usage: null };
    } finally {
      clearTimeout(timer);
    }
  }
}

/** Build the provider from server env, or null when no key is configured. */
export function createAnthropicProvider(): AnthropicProvider | null {
  const key = serverEnv.anthropicKey();
  if (!key) return null;
  return new AnthropicProvider(key, serverEnv.aiModel());
}
