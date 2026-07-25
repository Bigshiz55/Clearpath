import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { PublicHeader, PublicFooter, DiscoveryArticle } from '@/components/discovery/DiscoveryLayout';
import { TitleHero } from '@/components/discovery/TitleHero';
import { titlePages } from '@/lib/discovery/titlePages';
import { findPage, isIndexable, publishedEntries } from '@/lib/discovery/registry';
import { articleJsonLd, faqJsonLd, breadcrumbJsonLd, titleJsonLd, JsonLd } from '@/lib/discovery/structuredData';
import { publicEnv } from '@/lib/env';

const KIND = 'show' as const;
const BASE_PATH = '/show';
const SECTION_LABEL = 'Shows';

/** Facts come from the build-time cache — never a live API call per request. */
function extra() {
  return titlePages();
}

export function generateStaticParams() {
  return publishedEntries(new Date(), extra())
    .filter((e) => e.page.kind === KIND)
    .map((e) => ({ slug: e.page.slug }));
}

export const revalidate = 86400;

export async function generateMetadata({ params }: { params: { slug: string } }): Promise<Metadata> {
  const page = findPage(KIND, params.slug, extra());
  if (!page) return {};
  const base = publicEnv.siteUrl();
  const url = `${base}${BASE_PATH}/${page.slug}`;
  const indexable = isIndexable(page, new Date(), extra());
  const image = page.title_data?.posterUrl ?? undefined;
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
      images: image ? [image] : undefined,
    },
    twitter: { card: 'summary_large_image', title: page.title, description: page.description, images: image ? [image] : undefined },
  };
}

export default function Page({ params }: { params: { slug: string } }) {
  const pages = extra();
  const page = findPage(KIND, params.slug, pages);
  if (!page || page.status === 'retired') notFound();
  const base = publicEnv.siteUrl();
  const trail = [
    { href: '/', label: 'Home' },
    { href: '/explore', label: SECTION_LABEL },
    { href: `${BASE_PATH}/${page.slug}`, label: page.heading },
  ];
  return (
    <div className="min-h-dvh">
      <JsonLd data={[titleJsonLd(page, 'TVSeries', base), articleJsonLd(page, base), faqJsonLd(page), breadcrumbJsonLd(trail, base)]} />
      <PublicHeader />
      <main>
        {page.title_data && <TitleHero page={page} />}
        <DiscoveryArticle page={page} trail={trail} />
      </main>
      <PublicFooter />
    </div>
  );
}
