import { describe, it, expect, vi, beforeEach } from 'vitest';

// Capture every analytics event the telemetry layer emits, so we can assert both
// that usage is recorded AND that no private content ever leaks into it.
const events: { name: string; props: Record<string, unknown> }[] = [];
vi.mock('@/lib/actions/passFeedback', () => ({
  recordAnalyticsEvent: (name: string, props: Record<string, unknown>) => {
    events.push({ name, props });
    return Promise.resolve();
  },
}));

import { interpretDiscoveryRequest, explainRecommendations } from './orchestrator';
import { CanonicalDiscoveryRequestSchema } from './schemas';
import type { AiProvider } from './types';

const SECRET_TEXT = 'a boxing movie about a secret underdog named Zephyrina';

function validRequest() {
  return CanonicalDiscoveryRequestSchema.parse({
    intent: 'discover',
    mediaTypes: ['movie'],
    hardConstraints: { requiredSubjects: ['boxing'] },
    referenceTitles: [{ text: 'Rocky', relationship: 'similar_to' }],
    interpretationSummary: SECRET_TEXT,
  });
}

/** A provider stub whose behavior each test dictates. */
function mockProvider(over: Partial<AiProvider> = {}): AiProvider {
  return {
    name: 'mock',
    model: 'mock-model',
    interpret: async () => ({
      request: validRequest(),
      usage: {
        provider: 'mock',
        model: 'mock-model',
        inputTokens: 100,
        outputTokens: 40,
        cacheReadInputTokens: 0,
        cacheCreationInputTokens: 0,
        latencyMs: 12,
        estimatedCostUsd: 0.001,
      },
    }),
    explain: async () => ({ text: 'because it fits', usage: null }),
    ...over,
  };
}

beforeEach(() => {
  events.length = 0;
});

describe('interpretDiscoveryRequest — happy path', () => {
  it('returns the validated request and records usage telemetry', async () => {
    const out = await interpretDiscoveryRequest({ text: SECRET_TEXT, route: 'ask', provider: mockProvider() });
    expect(out.request).not.toBeNull();
    expect(out.request?.hardConstraints.requiredSubjects).toEqual(['boxing']);
    const ev = events.find((e) => e.name === 'ai_discovery');
    expect(ev).toBeTruthy();
    expect(ev?.props.success).toBe(true);
    expect(ev?.props.inputTokens).toBe(100);
    expect(ev?.props.route).toBe('ask');
  });
});

describe('interpretDiscoveryRequest — safe degradation', () => {
  it('returns no_key and flags legacy escalation when no provider is configured', async () => {
    const out = await interpretDiscoveryRequest({ text: SECRET_TEXT, route: 'finder', provider: null });
    expect(out.request).toBeNull();
    expect(out.failureReason).toBe('no_key');
    const ev = events.find((e) => e.name === 'ai_discovery');
    expect(ev?.props.escalatedToLegacy).toBe(true);
    expect(ev?.props.success).toBe(false);
  });

  it('degrades to null (not throw) when the provider returns a failure outcome', async () => {
    const provider = mockProvider({ interpret: async () => ({ request: null, usage: null, failureReason: 'timeout' }) });
    const out = await interpretDiscoveryRequest({ text: SECRET_TEXT, route: 'ask', provider });
    expect(out.request).toBeNull();
    expect(out.failureReason).toBe('timeout');
    const ev = events.find((e) => e.name === 'ai_discovery');
    expect(ev?.props.escalatedToLegacy).toBe(true);
  });
});

describe('telemetry privacy — no raw content is ever logged', () => {
  it('never includes the request text or interpreted subjects/titles in any event', async () => {
    await interpretDiscoveryRequest({ text: SECRET_TEXT, route: 'ask', provider: mockProvider() });
    const serialized = JSON.stringify(events);
    expect(serialized).not.toContain('boxing');
    expect(serialized).not.toContain('Rocky');
    expect(serialized).not.toContain('Zephyrina');
    expect(serialized).not.toContain(SECRET_TEXT);
  });
});

describe('explainRecommendations', () => {
  it('returns null text when no provider is configured (explanation simply omitted)', async () => {
    const out = await explainRecommendations({ summary: 's', titles: [], provider: null });
    expect(out.text).toBeNull();
  });

  it('passes qualified titles through to the provider and returns its text', async () => {
    const out = await explainRecommendations({
      summary: 's',
      titles: [{ title: 'Creed', year: 2015, whyQualified: 'boxing central' }],
      provider: mockProvider(),
    });
    expect(out.text).toBe('because it fits');
  });
});
