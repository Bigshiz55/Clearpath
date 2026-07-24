/**
 * LIVE-AUDIT EVIDENCE LABELS (pure). The live audit must never claim a title
 * "satisfies" a constraint unless the SOURCE actually proves it. This module
 * maps the raw metadata a source returned for one (title, constraint) into a
 * strict evidence label:
 *
 *   - 'verified'    — the source gives direct, sufficient evidence.
 *   - 'inferred'    — only indirect evidence (a proxy field); NOT proof.
 *   - 'unavailable' — the source does not expose this kind of evidence at all.
 *   - 'unknown'     — the field exists but is empty/null for this title.
 *
 * The distinctions are deliberate: e.g. TMDB exposes a film's original language
 * and production countries (origin can be verified), but does NOT expose which
 * dub audio TRACKS a given stream carries — so an "English audio" requirement is
 * 'unavailable' from TMDB and must be checked against a real availability
 * source, never fabricated. No I/O; unit-tested.
 */

export type EvidenceLabel = 'verified' | 'inferred' | 'unavailable' | 'unknown';

export interface TitleEvidence {
  originCountries?: string[]; // production_countries iso_3166_1
  originalLanguage?: string | null; // original_language iso_639_1
  runtimeMinutes?: number | null;
  providerIds?: number[]; // watch/providers flatrate ids for the region
  /** TMDB does not carry dub-track audio; only pass this if a REAL audio source did. */
  audioLanguages?: string[] | null;
  /** Whether the field was present in the payload at all (vs the endpoint omitting it). */
  present?: Partial<Record<'originCountries' | 'originalLanguage' | 'runtime' | 'providers' | 'audio', boolean>>;
}

export interface ConstraintCheck {
  kind: 'origin_country' | 'original_language' | 'runtime_max' | 'platform' | 'english_audio';
  target: string | number;
}

export interface LabeledResult {
  kind: ConstraintCheck['kind'];
  target: string | number;
  label: EvidenceLabel;
  detail: string;
}

const present = (e: TitleEvidence, k: keyof NonNullable<TitleEvidence['present']>) =>
  e.present ? e.present[k] !== false : true;

/** Label one constraint against a title's evidence. */
export function labelEvidence(e: TitleEvidence, c: ConstraintCheck): LabeledResult {
  const mk = (label: EvidenceLabel, detail: string): LabeledResult => ({ kind: c.kind, target: c.target, label, detail });

  switch (c.kind) {
    case 'origin_country': {
      if (!present(e, 'originCountries')) return mk('unavailable', 'source did not return production_countries');
      const cc = e.originCountries ?? [];
      if (cc.length === 0) return mk('unknown', 'production_countries empty');
      if (cc.map((x) => x.toUpperCase()).includes(String(c.target).toUpperCase())) return mk('verified', `production_countries includes ${c.target}`);
      // Original language can still point at the same origin — that's a proxy.
      if (e.originalLanguage) return mk('inferred', `country not listed, but original_language=${e.originalLanguage}`);
      return mk('unknown', `production_countries=[${cc.join(',')}] does not include ${c.target}`);
    }
    case 'original_language': {
      if (!present(e, 'originalLanguage')) return mk('unavailable', 'source did not return original_language');
      if (!e.originalLanguage) return mk('unknown', 'original_language empty');
      return e.originalLanguage.toLowerCase() === String(c.target).toLowerCase()
        ? mk('verified', `original_language=${e.originalLanguage}`)
        : mk('unknown', `original_language=${e.originalLanguage} ≠ ${c.target}`);
    }
    case 'runtime_max': {
      if (!present(e, 'runtime')) return mk('unavailable', 'source did not return runtime');
      if (e.runtimeMinutes == null) return mk('unknown', 'runtime null');
      return e.runtimeMinutes <= Number(c.target)
        ? mk('verified', `runtime ${e.runtimeMinutes}m ≤ ${c.target}m`)
        : mk('unknown', `runtime ${e.runtimeMinutes}m > ${c.target}m`);
    }
    case 'platform': {
      if (!present(e, 'providers')) return mk('unavailable', 'source did not return watch/providers');
      const ids = e.providerIds ?? [];
      if (ids.length === 0) return mk('unknown', 'no providers listed for region');
      return ids.includes(Number(c.target))
        ? mk('verified', `watch/providers includes ${c.target} in region`)
        : mk('unknown', `providers=[${ids.join(',')}] does not include ${c.target}`);
    }
    case 'english_audio': {
      // The critical honesty case: unless a REAL audio-track source was supplied,
      // English-dub availability is simply not something TMDB can prove.
      if (!present(e, 'audio') || e.audioLanguages == null) return mk('unavailable', 'no audio-track source provides dub availability (TMDB cannot)');
      if (e.audioLanguages.length === 0) return mk('unknown', 'audio source returned no tracks');
      return e.audioLanguages.map((x) => x.toLowerCase()).includes('en')
        ? mk('verified', 'audio source lists an English track')
        : mk('unknown', `audio tracks=[${e.audioLanguages.join(',')}] has no English`);
    }
  }
}

export interface AuditTally { verified: number; inferred: number; unavailable: number; unknown: number; total: number }

export function tally(results: LabeledResult[]): AuditTally {
  const t: AuditTally = { verified: 0, inferred: 0, unavailable: 0, unknown: 0, total: results.length };
  for (const r of results) t[r.label]++;
  return t;
}
