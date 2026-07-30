/**
 * PUBLIC DISCOVERY PLATFORM — content model.
 *
 * This is a PUBLISHING SYSTEM, not a pile of pages: every public URL is a
 * `DiscoveryPage` produced by a template, screened by the quality gate
 * (`qualityGate.ts`), and only reaches the sitemap once its status is
 * `published`. The logged-in app is untouched — this layer only reads.
 */

export type PageStatus = 'draft' | 'needs_review' | 'published' | 'noindex' | 'retired';

export type PageKind = 'movie' | 'show' | 'compare' | 'for' | 'discover' | 'guide';

/** A link to another page on the site — internal linking is a quality signal. */
export interface InternalLink {
  href: string;
  label: string;
}

export interface FaqEntry {
  question: string;
  answer: string;
}

/** A prose section with a heading — the body of every page. */
export interface Section {
  heading: string;
  /** Paragraphs. Rendered as <p>; never raw HTML. */
  body: string[];
  /** Optional bullets under the paragraphs. */
  bullets?: string[];
}

export interface DiscoveryPage {
  kind: PageKind;
  slug: string;
  /** <title> — must be unique across the whole site. */
  title: string;
  /** <meta name="description"> — must be unique across the whole site. */
  description: string;
  /** The H1, which may differ from the <title>. */
  heading: string;
  /** One-sentence promise under the H1. */
  standfirst: string;
  status: PageStatus;
  /** ISO date — drives sitemap lastModified and scheduled publication. */
  updated: string;
  /** Optional future publish date; before this the page is not published. */
  publishAt?: string;
  sections: Section[];
  faq: FaqEntry[];
  related: InternalLink[];
  /** Where the WatchVerd1ct CTA points. */
  cta: { label: string; href: string };
  /** Extra data used by the movie/show templates. */
  title_data?: TitleFacts;
}

/** Facts a movie/show page needs. Missing facts fail the quality gate, which is
 *  how thin auto-generated pages are prevented from publishing. */
export interface TitleFacts {
  tmdbId: number;
  mediaType: 'movie' | 'tv';
  year: number | null;
  runtimeMinutes: number | null;
  genres: string[];
  posterUrl: string | null;
  /** Streaming availability, empty when nothing is verified. */
  providers: string[];
  /** Independent rating evidence actually present. */
  ratings: { source: string; value: string }[];
  /** Series-only. */
  seasons?: number | null;
  episodes?: number | null;
  seriesStatus?: string | null;
}

export const PAGE_KIND_BASE: Record<PageKind, string> = {
  movie: '/movie',
  show: '/show',
  compare: '/compare',
  for: '/for',
  discover: '/discover',
  guide: '/guides',
};

/** The canonical path for a page. */
export function pathFor(page: Pick<DiscoveryPage, 'kind' | 'slug'>): string {
  return `${PAGE_KIND_BASE[page.kind]}/${page.slug}`;
}
