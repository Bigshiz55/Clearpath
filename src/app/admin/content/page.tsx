import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { isAdminEmail } from '@/lib/admin';
import { buildRegistry, countsByKind, duplicateSlugs } from '@/lib/discovery/registry';
import type { PageKind, PageStatus } from '@/lib/discovery/types';

/**
 * CONTENT CMS — the internal view of the publishing system. Shows every page,
 * its status, its quality score and EXACTLY which quality checks failed, so an
 * editor can see why something is not publishing without reading source.
 *
 * Admin-gated server-side and noindex. Structured so it can later move into
 * Verd1ct OS without touching the public platform.
 */

export const dynamic = 'force-dynamic';
export const metadata: Metadata = {
  title: 'Content · WatchVerd1ct admin',
  robots: { index: false, follow: false },
};

const STATUS_STYLE: Record<PageStatus, string> = {
  published: 'border-emerald-400/40 bg-emerald-500/15 text-emerald-100',
  needs_review: 'border-gold-400/40 bg-gold-500/15 text-gold-200',
  draft: 'border-white/15 bg-white/5 text-slate-300',
  noindex: 'border-amber-400/40 bg-amber-500/10 text-amber-100',
  retired: 'border-red-400/40 bg-red-500/10 text-red-200',
};

const KIND_LABEL: Record<PageKind, string> = {
  movie: 'Movies', show: 'Shows', compare: 'Comparisons',
  for: 'Use cases', discover: 'Collections', guide: 'Guides',
};

export default async function AdminContentPage({
  searchParams,
}: {
  searchParams: { kind?: string; status?: string };
}) {
  // Server-side authorization — never trust the client.
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user?.email || !isAdminEmail(user.email)) notFound();

  const registry = buildRegistry();
  const counts = countsByKind(registry);
  const dupes = duplicateSlugs();

  const filtered = registry.filter((e) => {
    if (searchParams.kind && e.page.kind !== searchParams.kind) return false;
    if (searchParams.status === 'blocked' && e.publishable) return false;
    if (searchParams.status === 'live' && !e.publishable) return false;
    return true;
  });

  const blocked = registry.filter((e) => !e.publishable);

  return (
    <div className="min-h-dvh">
      <main className="container-page py-8">
        <h1 className="text-2xl font-black text-white">Content</h1>
        <p className="mt-1 text-sm text-slate-400">
          {registry.length} pages · {registry.filter((e) => e.publishable).length} live in the sitemap ·{' '}
          {blocked.length} held back by the quality gate
        </p>

        {dupes.length > 0 && (
          <p className="mt-4 rounded-xl border border-red-400/40 bg-red-500/10 p-3 text-sm text-red-100">
            Duplicate slugs detected: {dupes.join(', ')}
          </p>
        )}

        <div className="mt-6 flex flex-wrap gap-2 text-xs">
          <Link href="/admin/content" className="rounded-lg border border-white/15 px-3 py-1.5 text-slate-200 hover:bg-white/10">
            All
          </Link>
          {(Object.keys(KIND_LABEL) as PageKind[]).map((k) => (
            <Link
              key={k}
              href={`/admin/content?kind=${k}`}
              className="rounded-lg border border-white/15 px-3 py-1.5 text-slate-200 hover:bg-white/10"
            >
              {KIND_LABEL[k]} <span className="text-slate-500">{counts[k].published}/{counts[k].total}</span>
            </Link>
          ))}
          <Link href="/admin/content?status=blocked" className="rounded-lg border border-amber-400/40 px-3 py-1.5 text-amber-100 hover:bg-amber-500/10">
            Blocked {blocked.length}
          </Link>
        </div>

        <div className="mt-6 overflow-x-auto">
          <table className="w-full min-w-[720px] text-left text-sm">
            <thead className="text-[11px] uppercase tracking-wide text-slate-400">
              <tr className="border-b border-white/10">
                <th className="py-2 pr-3">Page</th>
                <th className="py-2 pr-3">Type</th>
                <th className="py-2 pr-3">Status</th>
                <th className="py-2 pr-3">Quality</th>
                <th className="py-2">Failed checks</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((e) => (
                <tr key={e.path} className="border-b border-white/5 align-top" data-testid="cms-row">
                  <td className="py-3 pr-3">
                    <Link href={e.path} className="font-semibold text-white hover:text-brand-200">{e.page.heading}</Link>
                    <div className="text-xs text-slate-500">{e.path}</div>
                  </td>
                  <td className="py-3 pr-3 text-slate-400">{KIND_LABEL[e.page.kind]}</td>
                  <td className="py-3 pr-3">
                    <span className={`inline-block rounded-md border px-2 py-0.5 text-[11px] font-bold ${STATUS_STYLE[e.quality.status]}`}>
                      {e.publishable ? 'LIVE' : e.quality.status.replace('_', ' ').toUpperCase()}
                    </span>
                  </td>
                  <td className="py-3 pr-3 tabular-nums text-slate-300">{e.quality.score}</td>
                  <td className="py-3 text-xs">
                    {e.quality.issues.length === 0 ? (
                      <span className="text-emerald-300">All checks pass</span>
                    ) : (
                      <ul className="space-y-0.5">
                        {e.quality.issues.map((i) => (
                          <li key={i.rule} className="text-amber-200">
                            <code className="text-amber-300">{i.rule}</code> — {i.detail}
                          </li>
                        ))}
                      </ul>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </main>
    </div>
  );
}
