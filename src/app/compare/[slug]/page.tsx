import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { PublicHeader, PublicFooter, DiscoveryArticle } from '@/components/discovery/DiscoveryLayout';
import { findPage, isIndexable, publishedEntries } from '@/lib/discovery/registry';
import { articleJsonLd, faqJsonLd, breadcrumbJsonLd, JsonLd } from '@/lib/discovery/structuredData';
import { publicEnv } from '@/lib/env';
import { loadOverrides, applyOverride } from '@/lib/discovery/overrides';

/** CMS overrides are applied on top of the source content. Fail-open: if the
 *  table or connection is unavailable the page renders from source. */
async function withOverride(slug: string) {
  const page = findPage(KIND, slug);
  if (!page) return null;
  try {
    const overrides = await loadOverrides();
    return applyOverride(page, overrides.get(`${KIND}/${slug}`));
  } catch {
    return page;
  }
}

const KIND = 'compare' as const;
const BASE_PATH = '/compare';
const SECTION_LABEL = 'Comparisons';

/** Pre-render every published page in this section. */
export function generateStaticParams() {
  return publishedEntries().filter((e) => e.page.kind === KIND).map((e) => ({ slug: e.page.slug }));
}

export const revalidate = 3600;

export async function generateMetadata({ params }: { params: { slug: string } }): Promise<Metadata> {
  const page = await withOverride(params.slug);
  if (!page) return {};
  const base = publicEnv.siteUrl();
  const url = `${base}${BASE_PATH}/${page.slug}`;
  const indexable = isIndexable(page);
  return {
    title: page.title,
    description: page.description,
    alternates: { canonical: url },
    robots: indexable ? undefined : { index: false, follow: false },
    openGraph: {
      type: 'article',
      title: page.title,
      description: page.description,
      url,
      siteName: 'WatchVerd1ct',
    },
    twitter: { card: 'summary_large_image', title: page.title, description: page.description },
  };
}

export default async function Page({ params }: { params: { slug: string } }) {
  const page = await withOverride(params.slug);
  if (!page || page.status === 'retired') notFound();
  const base = publicEnv.siteUrl();
  const trail = [
    { href: '/', label: 'Home' },
    { href: BASE_PATH, label: SECTION_LABEL },
    { href: `${BASE_PATH}/${page.slug}`, label: page.heading },
  ];
  return (
    <div className="min-h-dvh">
      <JsonLd data={[articleJsonLd(page, base), faqJsonLd(page), breadcrumbJsonLd(trail, base)]} />
      <PublicHeader />
      <main>
        <DiscoveryArticle page={page} trail={trail} />
      </main>
      <PublicFooter />
    </div>
  );
}
