/**
 * STRUCTURED DATA. Only schema types the underlying data genuinely supports —
 * no fabricated Review or AggregateRating, ever. Editorial pages emit Article +
 * FAQPage + BreadcrumbList; the site root emits WebSite + Organization.
 */
import type { DiscoveryPage } from './types';
import { pathFor } from './types';

export function articleJsonLd(page: DiscoveryPage, base: string) {
  const url = `${base}${pathFor(page)}`;
  return {
    '@context': 'https://schema.org',
    '@type': 'Article',
    headline: page.heading,
    description: page.description,
    datePublished: page.updated,
    dateModified: page.updated,
    mainEntityOfPage: { '@type': 'WebPage', '@id': url },
    author: { '@type': 'Organization', name: 'WatchVerd1ct', url: base },
    publisher: { '@type': 'Organization', name: 'WatchVerd1ct', url: base },
  };
}

export function faqJsonLd(page: DiscoveryPage) {
  if (page.faq.length === 0) return null;
  return {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: page.faq.map((f) => ({
      '@type': 'Question',
      name: f.question,
      acceptedAnswer: { '@type': 'Answer', text: f.answer },
    })),
  };
}

export function breadcrumbJsonLd(trail: { href: string; label: string }[], base: string) {
  return {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: trail.map((t, i) => ({
      '@type': 'ListItem',
      position: i + 1,
      name: t.label,
      item: `${base}${t.href}`,
    })),
  };
}

export function siteJsonLd(base: string) {
  return [
    {
      '@context': 'https://schema.org',
      '@type': 'WebSite',
      name: 'WatchVerd1ct',
      url: base,
      description: 'Thousands of titles. One Verd1ct.',
    },
    {
      '@context': 'https://schema.org',
      '@type': 'SoftwareApplication',
      name: 'WatchVerd1ct',
      applicationCategory: 'EntertainmentApplication',
      operatingSystem: 'Web',
      url: base,
      description: 'A personalised decision engine for what to watch, including group and household decisions.',
    },
  ];
}

/** Render one or more JSON-LD blocks. */
export function JsonLd({ data }: { data: unknown | unknown[] }) {
  const blocks = Array.isArray(data) ? data : [data];
  return (
    <>
      {blocks.filter(Boolean).map((d, i) => (
        <script
          key={i}
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(d) }}
        />
      ))}
    </>
  );
}
