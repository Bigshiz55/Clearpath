import 'server-only';
import { unstable_cache } from 'next/cache';
import { createClient } from '@supabase/supabase-js';
import { publicEnv } from '@/lib/env';
import type { DiscoveryPage, PageKind, PageStatus, Section, FaqEntry, InternalLink } from './types';

/**
 * CMS OVERRIDES — editorial edits stored in `discovery_overrides`, applied on
 * top of the typed source content at render time.
 *
 * Fail-open by design: if the table is missing (migration not applied), the
 * connection fails, or public env is absent, pages render from source exactly
 * as before. The public platform never depends on the CMS being present.
 */

export interface OverrideRow {
  page_kind: PageKind;
  slug: string;
  seo_title: string | null;
  description: string | null;
  heading: string | null;
  standfirst: string | null;
  status: PageStatus | null;
  publish_at: string | null;
  sections: Section[] | null;
  faq: FaqEntry[] | null;
  related: InternalLink[] | null;
}

const SELECT = 'page_kind, slug, seo_title, description, heading, standfirst, status, publish_at, sections, faq, related';

/**
 * The query itself is inside the cache boundary, so a public page render does
 * NOT open a database round trip per request — a per-request query is exactly
 * the latency the platform spec forbids. Revalidates every 5 minutes, and
 * `saveDiscoveryOverride` revalidates the affected paths immediately after an
 * edit, so publishing still takes effect promptly.
 *
 * Uses a plain anon client (not the cookie-bound server client) because this
 * data is public by policy and must be cacheable across visitors.
 */
const cachedRows = unstable_cache(
  async (): Promise<OverrideRow[]> => {
    try {
      const supabase = createClient(publicEnv.supabaseUrl(), publicEnv.supabasePublishableKey(), {
        auth: { persistSession: false },
      });
      const { data, error } = await supabase.from('discovery_overrides').select(SELECT);
      if (error || !data) return [];
      return data as OverrideRow[];
    } catch {
      return [];
    }
  },
  ['discovery-overrides-v1'],
  { revalidate: 300, tags: ['discovery-overrides'] },
);

/** Every override, keyed `kind/slug`. Empty map on any failure. */
export async function loadOverrides(): Promise<Map<string, OverrideRow>> {
  try {
    const rows = await cachedRows();
    return new Map(rows.map((r) => [`${r.page_kind}/${r.slug}`, r]));
  } catch {
    return new Map();
  }
}

/** Apply overrides to a page. Null/absent fields keep the source value. */
export function applyOverride(page: DiscoveryPage, row: OverrideRow | undefined): DiscoveryPage {
  if (!row) return page;
  return {
    ...page,
    title: row.seo_title ?? page.title,
    description: row.description ?? page.description,
    heading: row.heading ?? page.heading,
    standfirst: row.standfirst ?? page.standfirst,
    status: row.status ?? page.status,
    publishAt: row.publish_at ?? page.publishAt,
    sections: row.sections && row.sections.length > 0 ? row.sections : page.sections,
    faq: row.faq && row.faq.length > 0 ? row.faq : page.faq,
    related: row.related && row.related.length > 0 ? row.related : page.related,
  };
}

/** Apply the whole override map across a page list. */
export function applyOverrides(pages: DiscoveryPage[], overrides: Map<string, OverrideRow>): DiscoveryPage[] {
  if (overrides.size === 0) return pages;
  return pages.map((p) => applyOverride(p, overrides.get(`${p.kind}/${p.slug}`)));
}
