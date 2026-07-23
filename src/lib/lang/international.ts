/**
 * International discovery — CORRECTED language logic. PURE, client-safe.
 *
 * The key distinction the rest of the app must honor:
 *   originalLanguage       = the language the title was ORIGINALLY produced in.
 *   availableAudioLanguages = the audio tracks a provider offers in the region.
 * "English audio" means a VERIFIED English AUDIO TRACK — never "originally English".
 *
 * Rules:
 *   FOREIGN original + English dub            → INCLUDE (eligible).
 *   FOREIGN original + English SUBTITLES only → EXCLUDE when English audio required.
 *   Originally-English title                  → allowed, but must NOT dominate a
 *                                               request that prioritizes foreign content.
 * Foreign original language is NEVER a reason to exclude.
 */

const ENGLISH = new Set(['en', 'eng', 'english']);
const NAME_TO_CODE: Record<string, string> = {
  english: 'en', danish: 'da', swedish: 'sv', norwegian: 'no', finnish: 'fi', icelandic: 'is',
  spanish: 'es', french: 'fr', german: 'de', italian: 'it', korean: 'ko', japanese: 'ja',
  dutch: 'nl', polish: 'pl', portuguese: 'pt', turkish: 'tr', russian: 'ru', mandarin: 'zh', chinese: 'zh',
};
export function langCode(l: string | null | undefined): string {
  if (!l) return '';
  const s = l.trim().toLowerCase();
  return NAME_TO_CODE[s] ?? s.split('-')[0]!;
}
export function isEnglish(l: string | null | undefined): boolean {
  return ENGLISH.has((l ?? '').trim().toLowerCase()) || langCode(l) === 'en';
}

export interface TitleLang {
  title: string;
  countryOfOrigin: string[];          // e.g. ["Denmark"] or ["DK"]
  originalLanguage: string | null;    // "Danish" or "da"
  availableAudioLanguages: string[];  // provider audio tracks, e.g. ["Danish","English"]
  availableSubtitleLanguages?: string[];
}

export function englishDubAvailable(t: Pick<TitleLang, 'availableAudioLanguages' | 'originalLanguage'>): boolean {
  // A dub means English is an audio track AND the title wasn't originally English.
  return t.availableAudioLanguages.some(isEnglish) && !isEnglish(t.originalLanguage);
}
export function hasEnglishAudio(t: Pick<TitleLang, 'availableAudioLanguages'>): boolean {
  return t.availableAudioLanguages.some(isEnglish);
}
export function isForeignOriginal(originalLanguage: string | null): boolean {
  return !!originalLanguage && !isEnglish(originalLanguage);
}

export interface AudioAssessment {
  eligible: boolean;
  englishDubAvailable: boolean;
  foreignOriginal: boolean;
  originalLanguage: string | null;
  countryOfOrigin: string[];
  exclusionReason: string | null;
}

/** Assess a title against an English-audio requirement. Foreign original language
 *  is NEVER an exclusion reason; only "no verified English audio track" is. */
export function assessEnglishAudio(t: TitleLang, opts: { requireEnglishAudio: boolean }): AudioAssessment {
  const foreignOriginal = isForeignOriginal(t.originalLanguage);
  const dub = englishDubAvailable(t);
  const englishAudio = hasEnglishAudio(t);
  let eligible = true;
  let exclusionReason: string | null = null;
  if (opts.requireEnglishAudio && !englishAudio) {
    eligible = false;
    const hasEngSubs = (t.availableSubtitleLanguages ?? []).some(isEnglish);
    exclusionReason = hasEngSubs
      ? 'English subtitles available, but no English audio track verified'
      : 'No English audio track verified';
  }
  return { eligible, englishDubAvailable: dub, foreignOriginal, originalLanguage: t.originalLanguage, countryOfOrigin: t.countryOfOrigin, exclusionReason };
}

/** UI line: "Originally in Spanish — English audio available". */
export function originLine(originalLanguage: string | null, englishDub: boolean): string {
  const name = languageDisplay(originalLanguage);
  if (!name || isEnglish(originalLanguage)) return 'Originally in English';
  return englishDub ? `Originally in ${name} — English audio available` : `Originally in ${name} — subtitles only`;
}

function languageDisplay(l: string | null): string | null {
  if (!l) return null;
  // If already a readable name, keep it; else expand the code.
  if (l.length > 3) return l[0]!.toUpperCase() + l.slice(1);
  try { return new Intl.DisplayNames(['en'], { type: 'language' }).of(langCode(l)) ?? l; } catch { return l; }
}

// ── International discovery ──────────────────────────────────────────────────
export interface DiscoveryCandidate extends TitleLang {
  id: string;
  tasteScore: number; // 0..100 similarity to the user's taste (computed upstream)
}
export interface DiscoveryResult extends DiscoveryCandidate {
  englishDubAvailable: boolean;
  foreignOriginal: boolean;
  originLine: string;
}
export interface DiscoveryOptions {
  requireEnglishAudio: boolean;
  /** The request specifically prioritizes foreign/international content. */
  foreignPrioritized: boolean;
  limit: number;
  /** Diversity only kicks in above this taste score — never force a weak match. */
  minTasteForDiversity?: number;
  /** Max share of results that may be originally-English when foreignPrioritized. */
  maxEnglishOriginalShare?: number;
}

/**
 * Actively seek foreign-original titles with verified English audio, ranked by
 * taste, with geographic diversity as a SOFT re-rank (never forcing a weak match).
 * When the request prioritizes foreign content, originally-English titles are
 * capped so they can't dominate.
 */
export function discoverInternational(candidates: DiscoveryCandidate[], opts: DiscoveryOptions): { results: DiscoveryResult[]; excluded: { id: string; reason: string }[] } {
  const excluded: { id: string; reason: string }[] = [];
  // 1) hard eligibility: verified English audio when required (subtitle-only out).
  const eligible = candidates.filter((c) => {
    const a = assessEnglishAudio(c, { requireEnglishAudio: opts.requireEnglishAudio });
    if (!a.eligible) { excluded.push({ id: c.id, reason: a.exclusionReason ?? 'ineligible' }); return false; }
    return true;
  });

  const decorate = (c: DiscoveryCandidate): DiscoveryResult => {
    const dub = englishDubAvailable(c);
    return { ...c, englishDubAvailable: dub, foreignOriginal: isForeignOriginal(c.originalLanguage), originLine: originLine(c.originalLanguage, dub) };
  };

  const minDiv = opts.minTasteForDiversity ?? 55;

  if (!opts.foreignPrioritized) {
    // No foreign preference → pure taste ranking (foreign titles included, not filtered).
    return { results: eligible.sort((a, b) => b.tasteScore - a.tasteScore).slice(0, opts.limit).map(decorate), excluded };
  }

  // 2) foreign-prioritized: partition, so English-original can't dominate.
  const foreign = eligible.filter((c) => isForeignOriginal(c.originalLanguage)).sort((a, b) => b.tasteScore - a.tasteScore);
  const english = eligible.filter((c) => !isForeignOriginal(c.originalLanguage)).sort((a, b) => b.tasteScore - a.tasteScore);

  // 3) diversity round-robin over foreign titles by original language — but only
  //    among reasonably strong matches; weak matches fall back to pure taste order.
  const strong = foreign.filter((c) => c.tasteScore >= minDiv);
  const weak = foreign.filter((c) => c.tasteScore < minDiv);
  const diversified = roundRobinByLanguage(strong).concat(weak);

  // 4) allow a minority of originally-English titles (never dominating).
  const englishCap = Math.max(0, Math.floor(opts.limit * (opts.maxEnglishOriginalShare ?? 0.25)));
  const out: DiscoveryCandidate[] = [];
  let ei = 0;
  for (const f of diversified) {
    if (out.length >= opts.limit) break;
    out.push(f);
  }
  // Backfill remaining slots with the strongest English-original titles, capped.
  while (out.length < opts.limit && ei < Math.min(english.length, englishCap)) out.push(english[ei++]!);

  return { results: out.slice(0, opts.limit).map(decorate), excluded };
}

/** Interleave by original language so a variety of countries surfaces first,
 *  preserving taste order within each language group. */
function roundRobinByLanguage(items: DiscoveryCandidate[]): DiscoveryCandidate[] {
  const groups = new Map<string, DiscoveryCandidate[]>();
  for (const c of items) { const k = langCode(c.originalLanguage) || 'xx'; (groups.get(k) ?? groups.set(k, []).get(k)!).push(c); }
  // Order groups by their best taste score so the strongest languages lead.
  const ordered = [...groups.values()].sort((a, b) => b[0]!.tasteScore - a[0]!.tasteScore);
  const out: DiscoveryCandidate[] = [];
  let added = true;
  for (let round = 0; added; round++) {
    added = false;
    for (const g of ordered) if (g[round]) { out.push(g[round]!); added = true; }
  }
  return out;
}

/** Bridge from the app's existing 3-state englishAvailability heuristic to the
 *  audio/subtitle contract, for call sites that don't yet have provider tracks. */
export function audioFromEnglishAvailability(englishAvailability: 'native' | 'available' | 'subtitles' | 'unknown', originalLanguage: string | null): Pick<TitleLang, 'availableAudioLanguages' | 'availableSubtitleLanguages'> {
  const orig = originalLanguage ?? 'unknown';
  switch (englishAvailability) {
    case 'native': return { availableAudioLanguages: ['en'], availableSubtitleLanguages: ['en'] };
    case 'available': return { availableAudioLanguages: [orig, 'en'], availableSubtitleLanguages: ['en'] };
    case 'subtitles': return { availableAudioLanguages: [orig], availableSubtitleLanguages: ['en'] };
    default: return { availableAudioLanguages: orig === 'unknown' ? [] : [orig], availableSubtitleLanguages: [] };
  }
}
