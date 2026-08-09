import 'server-only';
import { createAdminClient } from '@/lib/supabase/admin';
import type { MediaType } from '@/lib/types';
import { COMPILER_VERSION, type CompiledSubjectFact, type FactCentrality, type DecidedBy } from './compile';

/**
 * PERSISTENCE for the WatchVerdict Knowledge Layer.
 *
 * Reads/writes the durable `title_subject_facts` (and `title_knowledge`) content
 * caches through the service-role admin client — the same pattern
 * `title_dimensions` uses (world-readable rows, service-role writes).
 *
 * SAFE-ABSENT BY CONSTRUCTION. Every function swallows any error (no env, no
 * service-role key, table not yet migrated, network) and behaves as a miss / a
 * no-op. That is what lets this sit under the live finder without changing a
 * single existing test's behavior: when the store is unreachable the finder
 * simply falls through to the deterministic evaluator + bounded adjudicator
 * exactly as it does today. The Knowledge Layer can only ever ADD reuse; it can
 * never subtract correctness.
 */

export interface StoredSubjectFact {
  tmdbId: number;
  mediaType: MediaType;
  subject: string;
  centrality: FactCentrality;
  confidence: number;
  sourceCount: number;
  disputed: boolean;
  decidedBy: DecidedBy;
  evidence: unknown;
  compilerVersion: string;
  compiledAt: string;
}

const keyOf = (mediaType: MediaType, tmdbId: number) => `${mediaType}-${tmdbId}`;

/**
 * Batched read: all compiled facts for ONE subject across a set of titles, as a
 * Map keyed `"{mediaType}-{tmdbId}"`. One round-trip for the whole ambiguous
 * band. Returns an empty Map on any failure.
 */
export async function readSubjectFacts(
  subject: string,
  titles: Array<{ tmdbId: number; mediaType: MediaType }>,
): Promise<Map<string, StoredSubjectFact>> {
  const out = new Map<string, StoredSubjectFact>();
  if (!subject || titles.length === 0) return out;
  try {
    const admin = createAdminClient();
    const ids = Array.from(new Set(titles.map((t) => t.tmdbId)));
    const { data, error } = await admin
      .from('title_subject_facts')
      .select('tmdb_id, media_type, subject, centrality, confidence, source_count, disputed, decided_by, evidence, compiler_version, compiled_at')
      .eq('subject', subject)
      .in('tmdb_id', ids);
    if (error || !data) return out;
    for (const row of data as Array<Record<string, unknown>>) {
      const mediaType = String(row.media_type) as MediaType;
      const tmdbId = Number(row.tmdb_id);
      out.set(keyOf(mediaType, tmdbId), {
        tmdbId,
        mediaType,
        subject: String(row.subject),
        centrality: String(row.centrality) as FactCentrality,
        confidence: Number(row.confidence),
        sourceCount: Number(row.source_count ?? 0),
        disputed: Boolean(row.disputed),
        decidedBy: String(row.decided_by ?? 'deterministic') as DecidedBy,
        evidence: row.evidence ?? {},
        compilerVersion: String(row.compiler_version ?? ''),
        compiledAt: String(row.compiled_at ?? ''),
      });
    }
  } catch {
    /* safe-absent: treat as no compiled knowledge */
  }
  return out;
}

/**
 * Best-effort upsert of one compiled fact. Fire-and-forget from the request path
 * (bounded to the ambiguous band). Never throws.
 */
export async function writeSubjectFact(
  tmdbId: number,
  mediaType: MediaType,
  fact: CompiledSubjectFact,
): Promise<void> {
  if (!Number.isFinite(tmdbId) || !fact?.subject) return;
  try {
    const admin = createAdminClient();
    await admin.from('title_subject_facts').upsert(
      {
        tmdb_id: tmdbId,
        media_type: mediaType,
        subject: fact.subject,
        centrality: fact.centrality,
        confidence: fact.confidence,
        source_count: fact.sourceCount,
        disputed: fact.disputed,
        decided_by: fact.decidedBy,
        evidence: fact.evidence,
        compiler_version: fact.compilerVersion,
        compiled_at: new Date().toISOString(),
      },
      { onConflict: 'tmdb_id,media_type,subject' },
    );
  } catch {
    /* safe-absent: compilation is an optimization, never required for correctness */
  }
}

/** Header upsert (tone/setting/anti-evidence/provenance) for a compiled title. */
export async function writeTitleKnowledge(
  tmdbId: number,
  mediaType: MediaType,
  header: {
    status?: 'compiled' | 'insufficient' | 'unknown';
    tone?: string[];
    setting?: string[];
    antiEvidence?: Array<{ subject: string; reason: string }>;
    evidenceSources?: string[];
  },
): Promise<void> {
  if (!Number.isFinite(tmdbId)) return;
  try {
    const admin = createAdminClient();
    await admin.from('title_knowledge').upsert(
      {
        tmdb_id: tmdbId,
        media_type: mediaType,
        compiler_version: COMPILER_VERSION,
        status: header.status ?? 'compiled',
        tone: header.tone ?? [],
        setting: header.setting ?? [],
        anti_evidence: header.antiEvidence ?? [],
        evidence_sources: header.evidenceSources ?? [],
        compiled_at: new Date().toISOString(),
      },
      { onConflict: 'tmdb_id,media_type' },
    );
  } catch {
    /* safe-absent */
  }
}
