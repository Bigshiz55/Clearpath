/**
 * THE PAGE REGISTRY — the single source of truth for every public URL.
 *
 * Routes, the sitemap, the Explore index and the CMS all read from here, so
 * there is exactly one place that decides what exists and what is publishable.
 * Editorial content lives in `content/`; movie and show pages are produced by a
 * generator from canonical title records (see `titlePages.ts`) and are screened
 * by the same quality gate, so an auto-generated thin page can never publish.
 */

import type { DiscoveryPage, PageKind } from './types';
import { pathFor } from './types';
import { buildCorpus, isPublishable, screenPage, type QualityResult } from './qualityGate';
import { COMPARE_PAGES } from './content/compare';
import { USE_CASE_PAGES } from './content/useCases';
import { GUIDE_PAGES } from './content/guides';
import { DISCOVER_PAGES } from './content/discover';

/** Every editorial page. Title pages are appended by the generator at build. */
export const EDITORIAL_PAGES: DiscoveryPage[] = [
  ...COMPARE_PAGES,
  ...USE_CASE_PAGES,
  ...GUIDE_PAGES,
  ...DISCOVER_PAGES,
];

/** All pages known to the platform. */
export function allPages(extra: DiscoveryPage[] = []): DiscoveryPage[] {
  return [...EDITORIAL_PAGES, ...extra];
}

export interface RegistryEntry {
  page: DiscoveryPage;
  path: string;
  quality: QualityResult;
  publishable: boolean;
}

/** Screen the whole site once — the shared computation behind every consumer. */
export function buildRegistry(now: Date = new Date(), extra: DiscoveryPage[] = []): RegistryEntry[] {
  const pages = allPages(extra);
  const corpus = buildCorpus(pages);
  return pages.map((page) => ({
    page,
    path: pathFor(page),
    quality: screenPage(page, corpus),
    publishable: isPublishable(page, corpus, now),
  }));
}

/** Only pages that may be indexed and listed. */
export function publishedEntries(now: Date = new Date(), extra: DiscoveryPage[] = []): RegistryEntry[] {
  return buildRegistry(now, extra).filter((e) => e.publishable);
}

/** Resolve a single page for a route. Returns null when it must 404. */
export function findPage(kind: PageKind, slug: string, extra: DiscoveryPage[] = []): DiscoveryPage | null {
  return allPages(extra).find((p) => p.kind === kind && p.slug === slug) ?? null;
}

/**
 * A page renders publicly when it is publishable. Non-publishable pages still
 * RENDER (so an editor can preview them) but the route marks them `noindex`,
 * which is what keeps drafts out of the index without breaking previews.
 */
export function isIndexable(page: DiscoveryPage, now: Date = new Date(), extra: DiscoveryPage[] = []): boolean {
  const corpus = buildCorpus(allPages(extra));
  return isPublishable(page, corpus, now);
}

/** Duplicate-slug detection — two pages of the same kind may never share a slug. */
export function duplicateSlugs(pages: DiscoveryPage[] = allPages()): string[] {
  const seen = new Set<string>();
  const dupes: string[] = [];
  for (const p of pages) {
    const key = `${p.kind}/${p.slug}`;
    if (seen.has(key)) dupes.push(key);
    seen.add(key);
  }
  return dupes;
}

/** Grouped counts for the CMS dashboard and the Explore index. */
export function countsByKind(entries: RegistryEntry[]): Record<PageKind, { total: number; published: number }> {
  const empty = { total: 0, published: 0 };
  const out: Record<PageKind, { total: number; published: number }> = {
    movie: { ...empty }, show: { ...empty }, compare: { ...empty },
    for: { ...empty }, discover: { ...empty }, guide: { ...empty },
  };
  for (const e of entries) {
    out[e.page.kind].total += 1;
    if (e.publishable) out[e.page.kind].published += 1;
  }
  return out;
}
