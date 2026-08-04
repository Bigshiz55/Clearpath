import Link from 'next/link';
import type { Metadata } from 'next';
import { createClient } from '@/lib/supabase/server';
import { listPacks, getPackPreview } from '@/lib/packs/packs';
import type { Pack, PackPreview } from '@/lib/packs/types';
import { PublicHeader, PublicFooter } from '@/components/discovery/DiscoveryLayout';
import { publicEnv } from '@/lib/env';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Packs · WatchVerd1ct',
  description: 'Specialized tracking, schedules, and recommendations for the way real fans watch — Hallmark, Lifetime, and true crime.',
  alternates: { canonical: `${publicEnv.siteUrl()}/packs` },
};

/**
 * The three real Packs. Feature bullets and copy are structural — they
 * describe what the Pack does and don't change with the database — but
 * every "preview" line on the card comes from `getPackPreview`, real data
 * only, never invented to fill space.
 */
interface PackDef {
  slug: string;
  eyebrow: string;
  name: string;
  tagline: string;
  bullets: string[];
  cta: string;
  rgb: string;
  emoji: string;
}

const PACK_DEFS: PackDef[] = [
  {
    slug: 'hallmark-universe',
    eyebrow: 'Hallmark',
    name: 'Hallmark Universe',
    tagline: 'Never lose track of another premiere, franchise, or Christmas movie.',
    bullets: [
      'Upcoming premieres',
      'What is airing tonight',
      'Personal Hallmark checklist',
      'Franchise viewing order',
      'Favorite actors',
      'Hallmark-specific recommendations',
    ],
    cta: 'Open Hallmark Universe',
    rgb: '245,197,90',
    emoji: '🎄',
  },
  {
    slug: 'lifetime-vault',
    eyebrow: 'Lifetime',
    name: 'Lifetime Movie Vault',
    tagline: 'Keep track of every thriller, true-story movie, sequel, and familiar plot before they all start blending together.',
    bullets: [
      'Upcoming Lifetime premieres',
      'Watched and want-to-watch tracking',
      'Plot and theme matching',
      'Sequel and remake connections',
      'Favorite actors',
      'Lifetime-specific recommendations',
    ],
    cta: 'Open Lifetime Movie Vault',
    rgb: '255,46,154',
    emoji: '🎬',
  },
  {
    slug: 'crime-case-files',
    eyebrow: 'True Crime',
    name: 'Crime Case Files',
    tagline: 'Know when you have already seen the case, even when the program and title are completely different.',
    bullets: [
      'Duplicate-case detection',
      'Related episodes and documentaries',
      'Case timelines',
      'Follow new developments',
      'Crime-specific recommendations',
    ],
    cta: 'Open Crime Case Files',
    rgb: '124,140,168',
    emoji: '⚖️',
  },
];

function formatPremiereDate(iso: string): string {
  const d = new Date(`${iso}T00:00:00Z`);
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' });
}

function previewLine(def: PackDef, preview: PackPreview | null): string | null {
  if (!preview) return null;
  if (preview.nextPremiere) return `Next premiere: ${preview.nextPremiere.title} · ${formatPremiereDate(preview.nextPremiere.date)}`;
  if (preview.watchedCount != null && preview.watchedCount > 0) {
    return `You've watched ${preview.watchedCount} ${def.slug === 'lifetime-vault' ? 'Lifetime movie' : 'title'}${preview.watchedCount === 1 ? '' : 's'} here`;
  }
  if (preview.trackedCaseCount != null && preview.trackedCaseCount > 0) {
    return `You're tracking ${preview.trackedCaseCount} case${preview.trackedCaseCount === 1 ? '' : 's'}`;
  }
  return null;
}

export default async function PacksIndexPage() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const dbPacks = await listPacks(supabase).catch(() => [] as Pack[]);
  const bySlug = new Map(dbPacks.map((p) => [p.slug, p]));

  const previews = await Promise.all(
    PACK_DEFS.map(async (def) => {
      const pack = bySlug.get(def.slug);
      if (!pack) return null;
      return getPackPreview(supabase, pack, user?.id ?? null).catch(() => null);
    }),
  );

  return (
    <>
      <PublicHeader />
      <main className="container-page space-y-6 py-8">
        <section>
          <h1 className="text-2xl font-black tracking-tight text-white sm:text-3xl">Go deeper into what you love</h1>
          <p className="mt-1.5 max-w-2xl text-sm text-slate-400">
            Specialized tracking, schedules, and recommendations built for the way real fans watch.
          </p>
        </section>

        <div className="space-y-4">
          {PACK_DEFS.map((def, i) => {
            const pack = bySlug.get(def.slug);
            const line = previewLine(def, previews[i] ?? null);
            return (
              <Link
                key={def.slug}
                href={`/packs/${def.slug}`}
                data-testid={`pack-card-${def.slug}`}
                style={{ '--accent': def.rgb } as React.CSSProperties}
                className="group relative block overflow-hidden rounded-2xl border border-white/10 bg-ink-850 p-5 transition-all duration-300 hover:-translate-y-0.5 hover:border-white/25 active:scale-[0.99] sm:p-6"
              >
                <span
                  aria-hidden
                  className="pointer-events-none absolute -inset-x-10 -top-16 h-40 opacity-25 blur-3xl"
                  style={{ background: 'radial-gradient(circle, rgba(var(--accent),0.9), transparent 70%)' }}
                />

                <div className="relative flex items-start gap-4">
                  <span
                    aria-hidden
                    className="flex h-14 w-14 flex-none items-center justify-center rounded-xl text-2xl"
                    style={{ background: 'rgba(var(--accent),0.16)', border: '1px solid rgba(var(--accent),0.35)' }}
                  >
                    {def.emoji}
                  </span>

                  <div className="min-w-0 flex-1">
                    <span
                      className="inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-[0.14em]"
                      style={{ background: 'rgba(var(--accent),0.16)', color: `rgb(${def.rgb})` }}
                    >
                      {def.eyebrow}
                    </span>
                    <h2 className="mt-1.5 text-xl font-black tracking-tight text-white sm:text-2xl">{def.name}</h2>
                    <p className="mt-1 text-sm text-slate-300">{def.tagline}</p>

                    {line && (
                      <p className="mt-2 inline-flex items-center gap-1.5 text-xs font-semibold text-gold-300">
                        <span aria-hidden>✦</span> {line}
                      </p>
                    )}

                    <ul className="mt-3 grid grid-cols-1 gap-x-4 gap-y-1 sm:grid-cols-2">
                      {def.bullets.map((b) => (
                        <li key={b} className="flex items-start gap-1.5 text-xs text-slate-400">
                          <span aria-hidden className="mt-0.5 flex-none" style={{ color: `rgb(${def.rgb})` }}>›</span>
                          {b}
                        </li>
                      ))}
                    </ul>

                    <span className="mt-4 inline-flex min-h-[44px] w-full items-center justify-center rounded-xl bg-brand-600 px-5 text-sm font-bold text-white transition group-hover:bg-brand-500 sm:w-auto sm:px-6">
                      {def.cta} →
                    </span>

                    {!pack && (
                      <p className="mt-2 text-[11px] text-slate-500">Setting up for the first time — open it to get started.</p>
                    )}
                  </div>
                </div>
              </Link>
            );
          })}
        </div>
      </main>
      <PublicFooter />
    </>
  );
}
