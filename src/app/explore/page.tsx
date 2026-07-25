import type { Metadata } from 'next';
import Link from 'next/link';
import { PublicHeader, PublicFooter, Breadcrumbs } from '@/components/discovery/DiscoveryLayout';
import { publishedEntries, countsByKind } from '@/lib/discovery/registry';
import { titlePages } from '@/lib/discovery/titlePages';
import { siteJsonLd, JsonLd } from '@/lib/discovery/structuredData';
import { publicEnv } from '@/lib/env';
import type { PageKind } from '@/lib/discovery/types';

export const revalidate = 3600;

export const metadata: Metadata = {
  title: 'Explore WatchVerd1ct: Guides, Comparisons & Collections',
  description:
    'Browse every WatchVerd1ct guide, honest competitor comparison and curated collection. Find what to watch tonight, for couples, families or on your own.',
  alternates: { canonical: `${publicEnv.siteUrl()}/explore` },
};

const SECTIONS: { kind: PageKind; label: string; blurb: string }[] = [
  { kind: 'guide', label: 'Guides', blurb: 'How personalised recommendation actually works, explained plainly.' },
  { kind: 'compare', label: 'Comparisons', blurb: 'Honest comparisons with IMDb, Letterboxd, Criticker and Rotten Tomatoes.' },
  { kind: 'for', label: 'Use cases', blurb: 'Couples, families, date night — the situations people actually face.' },
  { kind: 'discover', label: 'Collections', blurb: 'Curated ways into the catalogue, built around real requests.' },
  { kind: 'movie', label: 'Movies', blurb: 'Individual film pages with evidence and a WatchVerd1ct take.' },
  { kind: 'show', label: 'Shows', blurb: 'Series pages with season detail and Viewer DNA fit.' },
];

export default function ExplorePage() {
  const entries = publishedEntries(new Date(), titlePages());
  const counts = countsByKind(entries);
  return (
    <div className="min-h-dvh">
      <JsonLd data={siteJsonLd(publicEnv.siteUrl())} />
      <PublicHeader />
      <main className="container-page py-8" data-testid="explore">
        <Breadcrumbs trail={[{ href: '/', label: 'Home' }, { href: '/explore', label: 'Explore' }]} />
        <h1 className="mt-4 text-3xl font-black text-white sm:text-4xl">Explore WatchVerd1ct</h1>
        <p className="mt-3 max-w-2xl text-lg text-slate-300">
          Thousands of titles. One Verd1ct. Everything below is public — no account needed to read it.
        </p>

        <div className="mt-10 space-y-10">
          {SECTIONS.map((section) => {
            const pages = entries.filter((e) => e.page.kind === section.kind);
            if (pages.length === 0) return null;
            return (
              <section key={section.kind} data-testid={`explore-${section.kind}`}>
                <h2 className="text-xl font-bold text-white sm:text-2xl">
                  {section.label}{' '}
                  <span className="text-sm font-semibold text-slate-500">{counts[section.kind].published}</span>
                </h2>
                <p className="mt-1 text-sm text-slate-400">{section.blurb}</p>
                <ul className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                  {pages.map((e) => (
                    <li key={e.path}>
                      <Link
                        href={e.path}
                        className="flex h-full flex-col rounded-2xl border border-white/10 bg-white/[0.03] p-4 transition hover:border-white/20 hover:bg-white/[0.06]"
                      >
                        <span className="font-semibold text-white">{e.page.heading}</span>
                        <span className="mt-1.5 line-clamp-3 text-sm text-slate-400">{e.page.standfirst}</span>
                      </Link>
                    </li>
                  ))}
                </ul>
              </section>
            );
          })}
        </div>
      </main>
      <PublicFooter />
    </div>
  );
}
