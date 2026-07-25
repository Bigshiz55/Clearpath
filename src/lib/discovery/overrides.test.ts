import { describe, it, expect } from 'vitest';
import { applyOverride, applyOverrides, type OverrideRow } from './overrides';
import { EDITORIAL_PAGES } from './registry';
import { buildCorpus, isPublishable } from './qualityGate';
import type { DiscoveryPage } from './types';

const NOW = new Date('2026-07-25T12:00:00Z');
const source = () => EDITORIAL_PAGES.find((p) => p.slug === 'couples')! as DiscoveryPage;

const row = (over: Partial<OverrideRow> = {}): OverrideRow => ({
  page_kind: 'for',
  slug: 'couples',
  seo_title: null,
  description: null,
  heading: null,
  standfirst: null,
  status: null,
  publish_at: null,
  sections: null,
  faq: null,
  related: null,
  ...over,
});

describe('CMS overrides change the live page', () => {
  it('an edited title and description replace the source values', () => {
    const edited = applyOverride(source(), row({
      seo_title: 'An Editor Rewrote This Title For Search',
      description: 'An editor rewrote this description to target a different query without touching any source code at all.',
    }));
    expect(edited.title).toBe('An Editor Rewrote This Title For Search');
    expect(edited.description).toContain('without touching any source code');
    // Untouched fields keep their source values.
    expect(edited.heading).toBe(source().heading);
    expect(edited.sections).toEqual(source().sections);
  });

  it('unpublishing through the CMS removes index eligibility immediately', () => {
    const page = source();
    expect(isPublishable(page, buildCorpus([page]), NOW)).toBe(true);
    const unpublished = applyOverride(page, row({ status: 'draft' }));
    expect(isPublishable(unpublished, buildCorpus([unpublished]), NOW)).toBe(false);
  });

  it('setting noindex through the CMS also removes it from the sitemap', () => {
    const hidden = applyOverride(source(), row({ status: 'noindex' }));
    expect(isPublishable(hidden, buildCorpus([hidden]), NOW)).toBe(false);
  });

  it('scheduled publication set in the CMS holds the page until its date', () => {
    const scheduled = applyOverride(source(), row({ status: 'published', publish_at: '2027-01-01T00:00:00Z' }));
    expect(isPublishable(scheduled, buildCorpus([scheduled]), NOW)).toBe(false);
    const due = applyOverride(source(), row({ status: 'published', publish_at: '2026-01-01T00:00:00Z' }));
    expect(isPublishable(due, buildCorpus([due]), NOW)).toBe(true);
  });

  it('an edit that breaks quality is caught by the gate, not silently published', () => {
    const broken = applyOverride(source(), row({ description: 'Too short.' }));
    expect(isPublishable(broken, buildCorpus([broken]), NOW)).toBe(false);
  });

  it('no overrides means pages are returned untouched', () => {
    const pages = EDITORIAL_PAGES.slice(0, 3);
    expect(applyOverrides(pages, new Map())).toEqual(pages);
  });

  it('an override for a different page never leaks onto this one', () => {
    const map = new Map([['for/families', row({ page_kind: 'for', slug: 'families', heading: 'Wrong page' })]]);
    const [applied] = applyOverrides([source()], map);
    expect(applied!.heading).toBe(source().heading);
  });
});
