/**
 * Pure parser + schema validation for the semantic subject adjudicator's
 * output. Separated from the network call so it is unit-testable with no key.
 *
 * The adjudicator's ONLY job is to classify how central a requested concept is
 * to one title, from supplied factual metadata — never to recommend, never to
 * invent plot. It returns one of the centrality classes plus a compact reason.
 */

export type AdjudicatedCentrality = 'CENTRAL' | 'MATERIAL' | 'INCIDENTAL' | 'UNSUPPORTED' | 'UNKNOWN';

export interface AdjudicationResult {
  centrality: AdjudicatedCentrality;
  /** 0..1 — the adjudicator's confidence in the classification. */
  confidence: number;
  /** One short factual sentence citing the supplied evidence. */
  reason: string;
}

const VALID: ReadonlySet<string> = new Set(['CENTRAL', 'MATERIAL', 'INCIDENTAL', 'UNSUPPORTED', 'UNKNOWN']);

/**
 * Validate + normalize a raw model response. Returns null on anything that does
 * not strictly match the schema, so a malformed/hallucinated response degrades
 * to "no verdict" (the caller then rejects on uncertainty for a hard subject).
 */
export function parseAdjudication(raw: string): AdjudicationResult | null {
  if (!raw) return null;
  let obj: unknown;
  try {
    obj = JSON.parse(raw);
  } catch {
    // Tolerate a leading/trailing code fence or prose around the JSON object.
    const m = raw.match(/\{[\s\S]*\}/);
    if (!m) return null;
    try {
      obj = JSON.parse(m[0]);
    } catch {
      return null;
    }
  }
  if (!obj || typeof obj !== 'object') return null;
  const rec = obj as Record<string, unknown>;
  const centralityRaw = typeof rec.centrality === 'string' ? rec.centrality.trim().toUpperCase() : '';
  if (!VALID.has(centralityRaw)) return null;
  const centrality = centralityRaw as AdjudicatedCentrality;

  let confidence = typeof rec.confidence === 'number' ? rec.confidence : Number(rec.confidence);
  if (!Number.isFinite(confidence)) confidence = 0.5;
  confidence = Math.max(0, Math.min(1, confidence));

  const reason = typeof rec.reason === 'string' ? rec.reason.slice(0, 300).trim() : '';

  return { centrality, confidence, reason };
}
