/**
 * THE QUALITY GATE (pure, no I/O).
 *
 * A page is allowed to publish ONLY if it carries real, original value. This is
 * what stops an auto-generated catalogue from becoming thousands of thin pages:
 * the generator can propose anything, but nothing reaches the sitemap without
 * passing here. A failing page is not deleted — it becomes a DRAFT with a list
 * of exactly what is missing, so it can be finished rather than guessed at.
 *
 * Deliberately strict about the things that make a page worth indexing:
 * unique title + description, a WatchVerd1ct explanation, both sides of the
 * recommendation (why people like it AND why people skip it), somewhere to go
 * next (internal links), an FAQ, and a real call to action.
 */

import type { DiscoveryPage, PageStatus } from './types';
import { pathFor } from './types';

/** Every requirement the gate enforces, as a stable machine-readable code. */
export type QualityRule =
  | 'unique_title'
  | 'unique_description'
  | 'title_length'
  | 'description_length'
  | 'watchverdict_explanation'
  | 'why_people_like_it'
  | 'why_people_skip_it'
  | 'substantial_body'
  | 'faq'
  | 'internal_links'
  | 'cta'
  | 'availability_known' // movie/show only
  | 'evidence_present'; // movie/show only

export interface QualityIssue {
  rule: QualityRule;
  detail: string;
}

export interface QualityResult {
  ok: boolean;
  /** The status the page is ALLOWED to have (never better than its own). */
  status: PageStatus;
  issues: QualityIssue[];
  /** 0–100, for the CMS list view. Not used for ranking, only triage. */
  score: number;
}

/** Minimum words of real prose across all sections. */
const MIN_BODY_WORDS = 250;
const MIN_TITLE = 15;
const MAX_TITLE = 65;
const MIN_DESCRIPTION = 70;
const MAX_DESCRIPTION = 165;
const MIN_FAQ = 2;
const MIN_LINKS = 3;

const wordCount = (s: string) => s.trim().split(/\s+/).filter(Boolean).length;

function bodyWords(page: DiscoveryPage): number {
  return page.sections.reduce(
    (n, s) => n + wordCount(s.heading) + s.body.reduce((m, p) => m + wordCount(p), 0) + (s.bullets ?? []).reduce((m, b) => m + wordCount(b), 0),
    0,
  );
}

/** Does any section actually explain the WatchVerd1ct position? */
function hasVerdictExplanation(page: DiscoveryPage): boolean {
  const hay = page.sections.map((s) => `${s.heading} ${s.body.join(' ')}`).join(' ').toLowerCase();
  return /watchverd1ct|verd1ct|your match|viewer dna/.test(hay);
}

function matchesHeading(page: DiscoveryPage, re: RegExp): boolean {
  return page.sections.some((s) => re.test(s.heading.toLowerCase()) && s.body.join(' ').trim().length > 40);
}

/**
 * Screen one page. `allTitles`/`allDescriptions` are the corpus counts used to
 * prove uniqueness — pass the whole site's values so duplicates are caught.
 */
export function screenPage(
  page: DiscoveryPage,
  corpus: { titles: Map<string, number>; descriptions: Map<string, number> } = { titles: new Map(), descriptions: new Map() },
): QualityResult {
  const issues: QualityIssue[] = [];
  const add = (rule: QualityRule, detail: string) => issues.push({ rule, detail });

  const t = page.title.trim();
  const d = page.description.trim();

  if (t.length < MIN_TITLE || t.length > MAX_TITLE) {
    add('title_length', `Title is ${t.length} characters; needs ${MIN_TITLE}–${MAX_TITLE}.`);
  }
  if (d.length < MIN_DESCRIPTION || d.length > MAX_DESCRIPTION) {
    add('description_length', `Description is ${d.length} characters; needs ${MIN_DESCRIPTION}–${MAX_DESCRIPTION}.`);
  }
  if ((corpus.titles.get(t.toLowerCase()) ?? 0) > 1) {
    add('unique_title', 'Another page already uses this exact title.');
  }
  if ((corpus.descriptions.get(d.toLowerCase()) ?? 0) > 1) {
    add('unique_description', 'Another page already uses this exact description.');
  }

  if (!hasVerdictExplanation(page)) {
    add('watchverdict_explanation', 'No section explains the WatchVerd1ct take.');
  }
  if (!matchesHeading(page, /who (this )?is for|why people like|reasons to watch|who will love/)) {
    add('why_people_like_it', 'Missing a substantive "why people like it" section.');
  }
  if (!matchesHeading(page, /who should skip|why people skip|reasons to skip|not for you|where it (falls short|loses)/)) {
    add('why_people_skip_it', 'Missing a substantive "why people skip it" section.');
  }

  const words = bodyWords(page);
  if (words < MIN_BODY_WORDS) {
    add('substantial_body', `Only ${words} words of body copy; needs ${MIN_BODY_WORDS}.`);
  }
  if (page.faq.filter((f) => f.question.trim() && wordCount(f.answer) >= 12).length < MIN_FAQ) {
    add('faq', `Needs at least ${MIN_FAQ} FAQ entries with real answers.`);
  }
  if (page.related.filter((l) => l.href.startsWith('/') && l.label.trim()).length < MIN_LINKS) {
    add('internal_links', `Needs at least ${MIN_LINKS} internal links.`);
  }
  if (!page.cta.label.trim() || !page.cta.href.startsWith('/')) {
    add('cta', 'Missing a call to action into WatchVerd1ct.');
  }

  // Title pages carry extra obligations: a page about a film with no
  // availability and no rating evidence is exactly the thin page we refuse.
  if (page.kind === 'movie' || page.kind === 'show') {
    const f = page.title_data;
    if (!f || f.providers.length === 0) {
      add('availability_known', 'No verified streaming availability for this title.');
    }
    if (!f || f.ratings.length === 0) {
      add('evidence_present', 'No independent rating evidence for this title.');
    }
  }

  const maxIssues = 13;
  const score = Math.max(0, Math.round(100 - (issues.length / maxIssues) * 100));

  // A page can never be promoted by the gate — only held back.
  let status: PageStatus = page.status;
  if (issues.length > 0 && (status === 'published' || status === 'needs_review')) status = 'draft';
  if (page.publishAt && status === 'published') {
    // Scheduled publication: not yet live until its date arrives. The caller
    // passes "now" via isPublishable; here we only keep the declared intent.
    status = 'published';
  }

  return { ok: issues.length === 0, status, issues, score };
}

/** Build the corpus counts used for the uniqueness rules. */
export function buildCorpus(pages: DiscoveryPage[]): { titles: Map<string, number>; descriptions: Map<string, number> } {
  const titles = new Map<string, number>();
  const descriptions = new Map<string, number>();
  for (const p of pages) {
    const t = p.title.trim().toLowerCase();
    const d = p.description.trim().toLowerCase();
    titles.set(t, (titles.get(t) ?? 0) + 1);
    descriptions.set(d, (descriptions.get(d) ?? 0) + 1);
  }
  return { titles, descriptions };
}

/**
 * The single decision the rest of the platform asks: may this page be indexed
 * and appear in the sitemap right now? Requires a clean gate, `published`
 * status, and a publish date that has arrived.
 */
export function isPublishable(page: DiscoveryPage, corpus: ReturnType<typeof buildCorpus>, now: Date): boolean {
  if (page.status !== 'published') return false;
  if (page.publishAt && new Date(page.publishAt).getTime() > now.getTime()) return false;
  return screenPage(page, corpus).ok;
}

/** Screen a whole site at once — used by the CMS and the sitemap. */
export function screenSite(pages: DiscoveryPage[], now: Date) {
  const corpus = buildCorpus(pages);
  return pages.map((page) => {
    const result = screenPage(page, corpus);
    return {
      page,
      path: pathFor(page),
      result,
      publishable: isPublishable(page, corpus, now),
    };
  });
}
