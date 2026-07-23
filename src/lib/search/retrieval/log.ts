/**
 * Stage 6 — Search Lab logging. Typed schema for every failed or low-confidence
 * search plus a pluggable sink. The DEFAULT sink is in-memory (no persistence), so
 * this ships with NO database migration — wiring a durable JSONL/Postgres sink is a
 * separate, approval-gated change (per the repo rule: no migration without approval).
 */
import type { RetrievalResult } from './types';

export interface SearchLogEntry {
  /** ISO timestamp, supplied by the caller (pipeline core stays pure/clock-free). */
  at: string;
  originalQuery: string;
  rewrittenQueries: string[];
  candidates: { id: string; title: string; confidence: number; band: string }[];
  topConfidence: number;
  outcome: RetrievalResult['outcome'];
  intentKind: string;
  sourcesQueried: string[];
  sourcesUnavailable: string[];
  /** Filled in by later UI events (optional, append-only). */
  userSelection?: string | null;
  abandoned?: boolean;
  finalResult?: string | null;
}

export interface SearchLogSink {
  record(entry: SearchLogEntry): void | Promise<void>;
}

/** Only failed / low-confidence searches are interesting for the Search Lab. */
export function shouldLog(result: RetrievalResult): boolean {
  return result.outcome !== 'confident' || result.telemetry.topConfidence < 0.85;
}

export function toLogEntry(result: RetrievalResult, at: string): SearchLogEntry {
  return {
    at,
    originalQuery: result.telemetry.originalQuery,
    rewrittenQueries: result.telemetry.rewrittenQueries,
    candidates: result.results.map((c) => ({ id: c.id, title: c.title, confidence: c.confidence, band: c.confidenceBand })),
    topConfidence: result.telemetry.topConfidence,
    outcome: result.outcome,
    intentKind: result.telemetry.intentKind,
    sourcesQueried: result.telemetry.sourcesQueried,
    sourcesUnavailable: result.telemetry.sourcesUnavailable,
    userSelection: null,
    abandoned: false,
    finalResult: null,
  };
}

/** Default sink: bounded in-memory ring buffer (for dev/inspection + tests). */
export class InMemorySearchLog implements SearchLogSink {
  private buf: SearchLogEntry[] = [];
  constructor(private cap = 500) {}
  record(entry: SearchLogEntry): void {
    this.buf.push(entry);
    if (this.buf.length > this.cap) this.buf.shift();
  }
  entries(): readonly SearchLogEntry[] { return this.buf; }
  clear(): void { this.buf = []; }
}
