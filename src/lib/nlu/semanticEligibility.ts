/**
 * SEMANTIC ELIGIBILITY — the general capability that separates
 *   "a title that merely carries related metadata"
 * from
 *   "a title that genuinely satisfies the requested subject".
 *
 * THE PROBLEM THIS SOLVES. A TMDB keyword tag is enough to place a title in the
 * CANDIDATE pool (`with_keywords` is an OR over an expanded keyword set). It is
 * NOT, by itself, enough to make the title ELIGIBLE. Before this module, the
 * finder equated "tagged boxing" with "is a boxing movie", so X-Men Origins,
 * Nickel Boys and Brawl in Cell Block 99 — each tagged with a boxing-adjacent
 * keyword for one scene — were returned as boxing movies.
 *
 * WHAT IT DOES. For one candidate and one required subject, it decides whether
 * the subject is CENTRAL to the title (drives the protagonist / central
 * conflict / setting / profession / competition / investigation / main arc),
 * merely MATERIAL, only INCIDENTAL, or UNSUPPORTED — using the evidence the
 * product already has for every candidate (title, overview, genres, keyword
 * tags). It is DETERMINISTIC: no per-request LLM call, no network — so it is
 * safe to run in the request path and gives the same answer every time.
 *
 * WHY IT GENERALIZES. It is subject-AGNOSTIC. It is driven entirely by the
 * subject's own vocabulary (`lexemes`), which the caller supplies. There is no
 * per-topic table and no hard-coded title list here: the identical code decides
 * boxing, courtroom, chess, mountaineering, journalism, heist, serial-killer,
 * medical, Christmas, or any future concept. Adding a new subject adds no code
 * here.
 *
 * Pure. No I/O, no clock, no randomness. Unit-tested with real metadata.
 */

export type SemanticStatus = 'PASS' | 'FAIL' | 'UNKNOWN';

/** How present the requested subject is in a candidate. */
export type SubjectCentrality = 'CENTRAL' | 'MATERIAL' | 'INCIDENTAL' | 'UNSUPPORTED';

export interface SubjectRequirement {
  /** Canonical key, e.g. "boxing". */
  canonical: string;
  /** Human label, e.g. "Boxing". */
  label: string;
  /**
   * The subject's own vocabulary — the noun the user named plus a bounded set
   * of lexical variants (e.g. ["boxing","boxer","prizefighter"], or
   * ["courtroom","trial","court"]). Whole-word / whole-phrase matched,
   * case-insensitive, with bounded morphological tolerance (plural/verb forms).
   * The evaluator NEVER invents vocabulary; it evaluates only what it is given.
   */
  lexemes: string[];
  /**
   * STRICT means the request demands the subject be CENTRAL ("a boxing movie",
   * "a courtroom movie where the trial is central"). A strict request accepts
   * ONLY centrality === CENTRAL. A non-strict (relaxable) request also accepts
   * MATERIAL. UNKNOWN and below are never accepted in strict mode.
   */
  strict: boolean;
}

export interface CandidateEvidence {
  title: string;
  /** Alternate/original title, when known — a title hit there counts too. */
  altTitle?: string | null;
  overview: string;
  genres: string[];
  /** TMDB keyword tag labels for this candidate (names, not ids). */
  keywords: string[];
}

export interface EligibilityVerdict {
  status: SemanticStatus;
  centrality: SubjectCentrality;
  /** 0..100 — strength of the centrality evidence. */
  confidence: number;
  /** A human summary built ONLY from real signals — never fabricated. */
  evidenceSummary: string;
  /** Non-null exactly when status !== 'PASS'. */
  rejectionReason: string | null;
  /** The raw signals the decision was made from — surfaced for the diagnostic. */
  signals: {
    /** A subject lexeme appears in the title (or alternate title). */
    titleHit: boolean;
    /** A keyword tag's label IS a subject lexeme (an exact subject tag). */
    keywordExact: boolean;
    /** A keyword tag's label CONTAINS a subject lexeme but isn't an exact one. */
    keywordRelated: boolean;
    /** How many times a subject lexeme appears in the overview. */
    overviewHits: number;
    /** A subject lexeme appears in the overview's premise (its first sentence). */
    premiseHit: boolean;
  };
}

/** Lowercase; punctuation → spaces; collapse whitespace. */
function normalize(s: string): string {
  return (s ?? '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Bounded English suffixes for morphological tolerance ("climb" → "climbing"). */
const SUFFIXES = ['', 's', 'es', 'er', 'ers', 'ing', 'ings', 'ed', 'ist', 'ists'];

/**
 * Does `lexeme` occur as a whole word/phrase in the already-normalized
 * `haystack` (space-delimited tokens), allowing a small set of inflections on
 * the FINAL word only? Multi-word lexemes ("mixed martial arts") are matched as
 * an exact phrase. Morphology is applied only for lexemes of length >= 4 to
 * avoid short-token false positives.
 */
function phraseHits(haystack: string, lexeme: string): number {
  const lex = normalize(lexeme);
  if (!lex) return 0;
  const parts = lex.split(' ');
  const last = parts[parts.length - 1]!;
  const head = parts.slice(0, -1).join(' ');
  const variants =
    last.length >= 4 ? SUFFIXES.map((suf) => (suf ? `${last}${suf}` : last)) : [last];
  const uniqueVariants = Array.from(new Set(variants));
  let total = 0;
  for (const v of uniqueVariants) {
    const phrase = head ? `${head} ${v}` : v;
    // Whole-word boundaries around the phrase within the padded haystack.
    const re = new RegExp(`(?:^| )${phrase.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?: |$)`, 'g');
    const m = ` ${haystack} `.match(re);
    if (m) total += m.length;
  }
  return total;
}

function anyPhraseHit(haystack: string, lexemes: string[]): boolean {
  return lexemes.some((l) => phraseHits(haystack, l) > 0);
}

function totalPhraseHits(haystack: string, lexemes: string[]): number {
  return lexemes.reduce((sum, l) => sum + phraseHits(haystack, l), 0);
}

/** The premise = the overview's first sentence (or its first ~140 chars). */
function premiseOf(overview: string): string {
  const trimmed = (overview ?? '').trim();
  if (!trimmed) return '';
  const stop = trimmed.search(/[.!?]\s/);
  const firstSentence = stop >= 0 ? trimmed.slice(0, stop + 1) : trimmed;
  return firstSentence.length <= 160 ? firstSentence : trimmed.slice(0, 140);
}

/**
 * Evaluate one candidate against one required subject.
 *
 * Contract:
 *  - PASS  → the subject is genuinely satisfied (CENTRAL; MATERIAL too when the
 *            request is not strict).
 *  - FAIL  → the subject is present only incidentally / not at all.
 *  - UNKNOWN → the evidence is too thin to decide (e.g. a tag but no descriptive
 *            text at all). UNKNOWN is NEVER treated as PASS — a strict request
 *            rejects it; the caller may offer a controlled relaxation.
 */
export function evaluateSubjectCentrality(
  req: SubjectRequirement,
  ev: CandidateEvidence,
): EligibilityVerdict {
  const lexemes = req.lexemes.map((l) => l.trim()).filter(Boolean);
  const titleNorm = normalize([ev.title, ev.altTitle ?? ''].join(' '));
  const overviewNorm = normalize(ev.overview);
  const premiseNorm = normalize(premiseOf(ev.overview));
  const keywordsNorm = ev.keywords.map(normalize).filter(Boolean);

  const titleHit = anyPhraseHit(titleNorm, lexemes);
  const overviewHits = totalPhraseHits(overviewNorm, lexemes);
  const premiseHit = anyPhraseHit(premiseNorm, lexemes);

  // An EXACT subject tag: a keyword label that IS one of the subject lexemes
  // (whole label match). A RELATED tag merely contains a lexeme as a word.
  const lexSet = new Set(lexemes.map(normalize));
  const keywordExact = keywordsNorm.some((k) => lexSet.has(k));
  const keywordRelated = !keywordExact && keywordsNorm.some((k) => anyPhraseHit(k, lexemes));

  const signals = {
    titleHit,
    keywordExact,
    keywordRelated,
    overviewHits,
    premiseHit,
  };

  const hasOverviewText = overviewNorm.length > 0;

  // ── CENTRALITY ──────────────────────────────────────────────────────────
  // Strongest evidence first. The subject is CENTRAL when the title names it,
  // the premise is about it, it is exactly tagged AND the summary describes it,
  // or the summary is repeatedly about it. It is MATERIAL when there is a single
  // real signal (an exact tag, or one summary mention) but not enough to prove
  // it drives the story. It is INCIDENTAL when the only evidence is a related
  // (non-exact) tag with no textual mention — a scene, not the subject.
  // UNSUPPORTED when nothing connects the title to the subject at all.
  //
  // A bare summary mention is deliberately NOT sufficient for CENTRAL on its
  // own: "a former boxer-turned-drug runner lands in prison" mentions boxing in
  // the premise, but the film is about the prison — boxing is backstory. So
  // centrality requires the subject to be NAMED in the title, EXACTLY tagged and
  // corroborated by the summary, or mentioned REPEATEDLY. A single mention, or a
  // tag the summary never echoes, is MATERIAL (present, not proven central).
  let centrality: SubjectCentrality;
  if (!titleHit && !keywordExact && !keywordRelated && overviewHits === 0) {
    centrality = 'UNSUPPORTED';
  } else if (titleHit || (keywordExact && overviewHits >= 1) || overviewHits >= 2) {
    centrality = 'CENTRAL';
  } else if (keywordExact || overviewHits === 1) {
    centrality = 'MATERIAL';
  } else {
    centrality = 'INCIDENTAL';
  }

  // ── STATUS ──────────────────────────────────────────────────────────────
  // A tag with NO descriptive text to corroborate it is UNKNOWN, not PASS: we
  // literally cannot see whether the subject is central. This is the
  // incomplete-evidence case, and strict mode rejects it.
  const unverifiable = !hasOverviewText && !titleHit;
  let status: SemanticStatus;
  if (unverifiable && (keywordExact || keywordRelated)) {
    status = 'UNKNOWN';
  } else if (centrality === 'CENTRAL') {
    status = 'PASS';
  } else if (!req.strict && centrality === 'MATERIAL') {
    status = 'PASS';
  } else {
    status = 'FAIL';
  }

  // ── CONFIDENCE ──────────────────────────────────────────────────────────
  let confidence: number;
  if (titleHit) confidence = 95;
  else if (premiseHit && overviewHits >= 2) confidence = 90;
  else if (premiseHit) confidence = 86;
  else if (keywordExact && overviewHits >= 2) confidence = 88;
  else if (keywordExact && overviewHits === 1) confidence = 80;
  else if (overviewHits >= 2) confidence = 76;
  else if (status === 'UNKNOWN') confidence = 40;
  else if (keywordExact) confidence = 52;
  else if (overviewHits === 1) confidence = 50;
  else if (keywordRelated) confidence = 24;
  else confidence = 8;

  // ── EVIDENCE SUMMARY (from real signals only) ─────────────────────────────
  const label = req.label || req.canonical;
  let evidenceSummary: string;
  if (titleHit) {
    evidenceSummary = `“${label}” appears in the title.`;
  } else if (premiseHit) {
    evidenceSummary = `the premise describes ${label.toLowerCase()} (${overviewHits} mention${overviewHits === 1 ? '' : 's'} in the summary).`;
  } else if (keywordExact && overviewHits >= 1) {
    evidenceSummary = `tagged ${label.toLowerCase()} and the summary describes it (${overviewHits} mention${overviewHits === 1 ? '' : 's'}).`;
  } else if (overviewHits >= 2) {
    evidenceSummary = `the summary is repeatedly about ${label.toLowerCase()} (${overviewHits} mentions).`;
  } else if (status === 'UNKNOWN') {
    evidenceSummary = `tagged ${label.toLowerCase()} but there is no summary text to confirm it is central.`;
  } else if (keywordExact) {
    evidenceSummary = `tagged ${label.toLowerCase()}, but the summary never mentions it.`;
  } else if (overviewHits === 1) {
    evidenceSummary = `${label.toLowerCase()} is mentioned once in the summary, not as the main story.`;
  } else if (keywordRelated) {
    evidenceSummary = `matched only a related tag; ${label.toLowerCase()} appears nowhere in the title or summary.`;
  } else {
    evidenceSummary = `no evidence connects this title to ${label.toLowerCase()}.`;
  }

  // ── REJECTION REASON ──────────────────────────────────────────────────────
  let rejectionReason: string | null = null;
  if (status === 'UNKNOWN') {
    rejectionReason = `requested subject unverifiable — tagged ${label.toLowerCase()} but no descriptive evidence`;
  } else if (status === 'FAIL') {
    if (centrality === 'MATERIAL') {
      rejectionReason = `requested subject is present but not central to the story`;
    } else if (centrality === 'INCIDENTAL') {
      rejectionReason = `requested subject appears only incidentally (a related tag, not the story)`;
    } else {
      rejectionReason = `requested subject not central to the story`;
    }
  }

  return { status, centrality, confidence, evidenceSummary, rejectionReason, signals };
}
