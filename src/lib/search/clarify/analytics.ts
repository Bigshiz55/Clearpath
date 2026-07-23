/**
 * Clarification analytics — CANONICAL identifiers only, never translated labels,
 * so Spanish/French/Chinese/Arabic/English experiences are directly comparable.
 * PURE builder; the sink (in-memory here) is pluggable and needs no DB migration.
 */
import type { CanonicalIntent, MeaningKey } from './canonical';
import type { ConfidenceBand, PolicyAction } from './policy';

export interface ClarificationEvent {
  at: string;                       // caller-supplied ISO timestamp (pure core stays clock-free)
  originalQuery: string;
  normalizedQuery: string;
  detectedQueryLanguage: string;
  activeResponseLocale: string;
  localeSource: 'app' | 'query' | 'conversation' | 'default';
  canonicalIntent: CanonicalIntent | null;
  interpretationKeys: { intent: CanonicalIntent; meaningKey: MeaningKey; confidence: number }[];
  resolvedIds: string[];
  topConfidence: number;
  policyAction: PolicyAction;
  confidenceBand: ConfidenceBand;
  clarificationShown: boolean;
  // filled by later UI events (append-only, optional)
  selectedOptionKey?: MeaningKey | null;   // canonical, NOT a translated label
  finalResultIds?: string[];
  userRetyped?: boolean;
  userAbandoned?: boolean;
  responseLatencyMs?: number | null;
  localizationFallbackUsed?: boolean;
  pipelineVersion: string;
}

export interface ClarificationSink { record(e: ClarificationEvent): void | Promise<void> }

export class InMemoryClarificationSink implements ClarificationSink {
  private buf: ClarificationEvent[] = [];
  constructor(private cap = 1000) {}
  record(e: ClarificationEvent): void { this.buf.push(e); if (this.buf.length > this.cap) this.buf.shift(); }
  events(): readonly ClarificationEvent[] { return this.buf; }
  clear(): void { this.buf = []; }
}
