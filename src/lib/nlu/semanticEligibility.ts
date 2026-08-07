/**
 * SEMANTIC ELIGIBILITY — does a candidate GENUINELY satisfy a required subject,
 * or does it merely carry the subject's word somewhere in its metadata?
 *
 * THE PRODUCTION FAILURE THIS EXISTS TO STOP. "Give me three boxing movies"
 * returned Snake Eyes (1998) — a political-assassination conspiracy in which a
 * murder happens *at* a boxing match. Boxing is the setting of one scene, not
 * the subject of the film. The earlier version approved it because it was
 * TMDB-tagged "boxing" and the word appeared in the overview, and it even
 * double-counted "boxing" and "boxing match" as two mentions. Pure keyword/word
 * presence is CANDIDATE RECALL, never proof of centrality.
 *
 * WHAT CENTRALITY REQUIRES. The subject must materially and repeatedly define
 * the work — its primary activity, central conflict, profession, competition,
 * setting-as-focus, investigation or dramatic focus — not appear as one scene,
 * an event backdrop, a character's former job, a metaphor, or a location.
 *
 * HOW IT DECIDES (deterministic-first, multi-signal — no single signal decides):
 *   • title carries the subject,
 *   • a CLUSTER of exact subject keyword tags (≥2) corroborated by the summary,
 *   • the summary is about the subject across ≥2 sentences (deduped, not one
 *     span counted twice), and NOT only as a locative setting,
 *   • an exact tag plus premise focus that is not merely a setting.
 * A lone tag, a single mention, or a setting-only mention ("at a boxing match")
 * is MATERIAL/INCIDENTAL — and for a HARD (central) requirement that FAILS. When
 * the evidence is genuinely ambiguous, the verdict is UNKNOWN and a hard subject
 * REJECTS on uncertainty rather than approve a bad recommendation.
 *
 * Subject-agnostic: driven only by the subject's own lexemes + its own tags. No
 * per-topic table, no per-title logic. Pure, deterministic, unit-tested.
 */

export type SemanticStatus = 'PASS' | 'FAIL' | 'UNKNOWN';

/** How present the requested subject is in a candidate. */
export type SubjectCentrality = 'CENTRAL' | 'MATERIAL' | 'INCIDENTAL' | 'UNSUPPORTED';

export interface SubjectRequirement {
  canonical: string;
  label: string;
  /** The subject's vocabulary — the noun plus bounded on-topic variants. */
  lexemes: string[];
  /** A HARD requirement demands CENTRAL. */
  strict: boolean;
  /**
   * When the user asked for the subject to be merely present ("movies INVOLVING
   * boxing", "featuring…", "with a … in it"), MATERIAL is allowed to pass too.
   * Default false: "a boxing movie" / "about boxing" / "centered on boxing"
   * accept only CENTRAL.
   */
  allowSubstantial?: boolean;
}

export interface CandidateEvidence {
  title: string;
  altTitle?: string | null;
  overview: string;
  genres: string[];
  /** TMDB keyword tag labels (names, not ids). */
  keywords: string[];
}

export interface EligibilityVerdict {
  status: SemanticStatus;
  centrality: SubjectCentrality;
  /** 0..100 — strength of the centrality evidence. */
  confidence: number;
  /** Human summary, from real signals only. */
  evidenceSummary: string;
  /** Non-null exactly when status !== 'PASS'. */
  rejectionReason: string | null;
  /** Evidence FOR the subject being central. */
  supportingEvidence: string[];
  /** Evidence AGAINST (why it might be incidental). */
  contraryEvidence: string[];
  /** True when a bounded semantic classifier could refine this borderline case;
   *  a hard subject rejects an ambiguous candidate when none is available. */
  ambiguous: boolean;
  signals: {
    titleHit: boolean;
    /** Distinct exact subject keyword tags (cluster density). */
    keywordExactCount: number;
    keywordRelated: boolean;
    /** Distinct summary SENTENCES that mention the subject (deduped). */
    mentionSentences: number;
    /** The subject appears in the first sentence, not only as a setting. */
    premiseFocus: boolean;
    /** Every summary mention is inside a locative/temporal setting phrase. */
    settingOnly: boolean;
  };
}

const clean = (s: string) =>
  (s ?? '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').replace(/\s+/g, ' ').trim();

/** Bounded English inflections applied to the FINAL word of a lexeme. */
const SUFFIXES = ['', 's', 'es', 'er', 'ers', 'ing', 'ings', 'ed', 'ist', 'ists'];

function lexemeVariants(lexeme: string): { phrase: string; head: string; variants: string[] } {
  const lex = clean(lexeme);
  const parts = lex.split(' ');
  const last = parts[parts.length - 1] ?? '';
  const head = parts.slice(0, -1).join(' ');
  const variants = last.length >= 4 ? Array.from(new Set(SUFFIXES.map((s) => `${last}${s}`))) : [last];
  return { phrase: lex, head, variants };
}

/** Regex that matches any lexeme (with inflections) as a whole phrase. */
function lexemeRegex(lexemes: string[], flags = 'g'): RegExp {
  const alts = lexemes
    .map(lexemeVariants)
    .flatMap(({ head, variants }) => variants.map((v) => (head ? `${head} ${v}` : v)))
    .filter(Boolean)
    .map((p) => p.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
  return new RegExp(`(?:^| )(?:${alts.join('|')})(?= |$)`, flags);
}

/** Split an overview into sentences, preserving prepositions for setting checks. */
function sentencesOf(overview: string): string[] {
  return (overview ?? '')
    .split(/(?<=[.!?])\s+/)
    .map((s) => ` ${clean(s)} `)
    .filter((s) => s.trim().length > 0);
}

const LOCATIVE = /\b(?:at|during|inside|outside|near|by|in)\s+(?:the\s+|an?\s+)?(?:[a-z']+\s+){0,3}$/;

export function evaluateSubjectCentrality(
  req: SubjectRequirement,
  ev: CandidateEvidence,
): EligibilityVerdict {
  const lexemes = req.lexemes.map((l) => l.trim()).filter(Boolean);
  const lexSet = new Set(lexemes.map(clean));
  const label = req.label || req.canonical;

  const titleNorm = ` ${clean([ev.title, ev.altTitle ?? ''].join(' '))} `;
  const titleHit = lexemeRegex(lexemes).test(titleNorm);

  // Keyword CLUSTER: distinct exact subject tags; related tags separately.
  const keywordsNorm = ev.keywords.map(clean).filter(Boolean);
  const exactTags = new Set(keywordsNorm.filter((k) => lexSet.has(k)));
  const keywordExactCount = exactTags.size;
  const keywordRelated =
    keywordExactCount === 0 && keywordsNorm.some((k) => lexemeRegex(lexemes).test(` ${k} `));

  // Per-SENTENCE mentions (deduped) + setting detection. Counting sentences,
  // not lexeme variants, stops "boxing" + "boxing match" reading as 2 mentions.
  const sentences = sentencesOf(ev.overview);
  let mentionSentences = 0;
  let settingMentions = 0;
  let plainMentions = 0;
  let premiseFocus = false;
  sentences.forEach((sent, idx) => {
    const re = lexemeRegex(lexemes);
    let m: RegExpExecArray | null;
    let hitInSentence = false;
    let nonSettingInSentence = false;
    while ((m = re.exec(sent)) !== null) {
      hitInSentence = true;
      const before = sent.slice(0, m.index + (m[0].startsWith(' ') ? 1 : 0));
      if (LOCATIVE.test(before)) settingMentions++;
      else {
        plainMentions++;
        nonSettingInSentence = true;
      }
    }
    if (hitInSentence) {
      mentionSentences++;
      if (idx === 0 && nonSettingInSentence) premiseFocus = true;
    }
  });
  const hasOverview = sentences.length > 0;
  const settingOnly = mentionSentences >= 1 && plainMentions === 0 && settingMentions > 0;

  // ── CENTRALITY ────────────────────────────────────────────────────────────
  // No single signal decides. CENTRAL needs the subject in the TITLE, a CLUSTER
  // of ≥2 distinct exact subject tags, or the summary describing the subject in
  // ≥2 NON-SETTING places. A lone tag with a single mention (Pulp Fiction's
  // "a boxer" among several characters), or a mention that is only a setting
  // (Snake Eyes' "at a boxing match"), is not central.
  let centrality: SubjectCentrality;
  if (!titleHit && keywordExactCount === 0 && !keywordRelated && mentionSentences === 0) {
    centrality = 'UNSUPPORTED';
  } else if (settingOnly && !titleHit && keywordExactCount < 2) {
    centrality = 'INCIDENTAL';
  } else if (titleHit || keywordExactCount >= 2 || plainMentions >= 2) {
    centrality = 'CENTRAL';
  } else if (keywordExactCount >= 1 || plainMentions >= 1 || mentionSentences >= 1) {
    centrality = 'MATERIAL';
  } else if (keywordRelated) {
    centrality = 'INCIDENTAL';
  } else {
    centrality = 'UNSUPPORTED';
  }

  // A MATERIAL verdict on a hard subject is the ambiguous zone a bounded
  // classifier would arbitrate; with none wired it rejects on uncertainty.
  const ambiguous = centrality === 'MATERIAL';

  // ── STATUS ────────────────────────────────────────────────────────────────
  const unverifiable = !hasOverview && !titleHit && (keywordExactCount >= 1 || keywordRelated);
  // A non-strict requirement ("involving boxing", or an explicitly relaxed
  // request) accepts MATERIAL; a hard/strict subject accepts only CENTRAL.
  const acceptSubstantial = req.allowSubstantial === true || req.strict === false;
  let status: SemanticStatus;
  if (unverifiable) {
    status = 'UNKNOWN';
  } else if (centrality === 'CENTRAL') {
    status = 'PASS';
  } else if (acceptSubstantial && centrality === 'MATERIAL') {
    status = 'PASS';
  } else {
    status = 'FAIL';
  }

  // ── CONFIDENCE ──────────────────────────────────────────────────────────────
  let confidence: number;
  if (titleHit) confidence = 95;
  else if (keywordExactCount >= 2 && mentionSentences >= 2) confidence = 92;
  else if (keywordExactCount >= 2 && mentionSentences >= 1) confidence = 86;
  else if (mentionSentences >= 2 && !settingOnly) confidence = 80;
  else if (centrality === 'MATERIAL') confidence = 50;
  else if (settingOnly) confidence = 88; // high confidence it is INCIDENTAL
  else if (centrality === 'INCIDENTAL') confidence = 70;
  else if (status === 'UNKNOWN') confidence = 40;
  else confidence = 20;

  // ── EVIDENCE ────────────────────────────────────────────────────────────────
  const supportingEvidence: string[] = [];
  const contraryEvidence: string[] = [];
  if (titleHit) supportingEvidence.push(`“${label}” appears in the title.`);
  if (keywordExactCount >= 2) supportingEvidence.push(`tagged with ${keywordExactCount} distinct ${label.toLowerCase()} keywords (a subject cluster).`);
  else if (keywordExactCount === 1) supportingEvidence.push(`tagged ${label.toLowerCase()} (a single subject keyword).`);
  if (mentionSentences >= 2 && !settingOnly) supportingEvidence.push(`the summary is about ${label.toLowerCase()} across ${mentionSentences} sentences.`);
  else if (premiseFocus) supportingEvidence.push(`the premise centers on ${label.toLowerCase()}.`);

  if (settingOnly) contraryEvidence.push(`${label.toLowerCase()} appears only as a setting/event, not as the story.`);
  if (mentionSentences === 1 && !settingOnly) contraryEvidence.push(`${label.toLowerCase()} is mentioned once, not sustained.`);
  if (keywordExactCount <= 1 && mentionSentences === 0 && !titleHit) contraryEvidence.push(`no summary sentence describes ${label.toLowerCase()}.`);
  if (keywordRelated && keywordExactCount === 0) contraryEvidence.push(`matched only a related tag, not ${label.toLowerCase()} itself.`);
  if (status !== 'PASS' && ev.genres.length > 0) contraryEvidence.push(`primary genres are ${ev.genres.slice(0, 3).join(', ')}.`);

  const evidenceSummary =
    supportingEvidence.length > 0 && status === 'PASS'
      ? supportingEvidence.join(' ')
      : contraryEvidence[0] ?? `no evidence connects this title to ${label.toLowerCase()}.`;

  let rejectionReason: string | null = null;
  if (status === 'UNKNOWN') {
    rejectionReason = `requested subject unverifiable — tagged ${label.toLowerCase()} but no descriptive evidence`;
  } else if (status === 'FAIL') {
    rejectionReason =
      centrality === 'MATERIAL'
        ? `requested subject is present but not central to the story`
        : centrality === 'INCIDENTAL'
          ? `requested subject appears only incidentally (a setting or passing mention)`
          : `requested subject is not central to the story`;
  }

  return {
    status,
    centrality,
    confidence,
    evidenceSummary,
    rejectionReason,
    supportingEvidence,
    contraryEvidence,
    ambiguous,
    signals: { titleHit, keywordExactCount, keywordRelated, mentionSentences, premiseFocus, settingOnly },
  };
}
