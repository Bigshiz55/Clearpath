import Link from 'next/link';
import { WatchVerdictWordmark } from '@/components/WatchVerdictWordmark';
import type { OsViewer } from '@/lib/os/server';

/**
 * Verd1ct OS shell — visually distinct from both the WatchVerd1ct consumer app
 * and the public Discovery site (this is the company's internal surface), while
 * still using the shared design system. Navigation is deliberately short.
 */

const NAV = [
  { href: '/os', label: 'Command Center' },
  { href: '/os/missions', label: 'Missions' },
  { href: '/os/approvals', label: 'Approvals' },
  { href: '/os/activity', label: 'Activity' },
];

export function OsShell({ viewer, children }: { viewer: OsViewer; children: React.ReactNode }) {
  return (
    <div className="min-h-dvh bg-ink-950">
      <header className="border-b border-white/10 bg-ink-900/60">
        <div className="container-page flex min-h-14 flex-wrap items-center gap-x-6 gap-y-2 pt-[calc(env(safe-area-inset-top)+1.25rem)]">
          <Link href="/os" className="flex items-center gap-2 text-base font-bold">
            <WatchVerdictWordmark />
            <span className="rounded-md border border-brand-400/40 bg-brand-500/15 px-1.5 py-0.5 text-[10px] font-black uppercase tracking-wider text-brand-100">
              OS
            </span>
          </Link>
          <nav aria-label="Verd1ct OS" className="flex min-w-0 flex-wrap items-center gap-x-5 gap-y-1 text-sm">
            {NAV.map((n) => (
              <Link key={n.href} href={n.href} className="whitespace-nowrap text-slate-300 transition hover:text-white">
                {n.label}
              </Link>
            ))}
          </nav>
          <div className="ml-auto flex items-center gap-2 text-xs">
            <span className="text-slate-400">{viewer.displayName ?? viewer.email}</span>
            <span
              data-testid="os-role"
              className="rounded-md border border-white/15 bg-white/5 px-2 py-0.5 font-bold uppercase tracking-wide text-slate-200"
            >
              {viewer.role ?? 'no role'}
            </span>
          </div>
        </div>
      </header>
      <main className="container-page py-8">{children}</main>
    </div>
  );
}

/** Shown when the OS schema has not been applied yet — honest, not a crash. */
export function OsSetupNotice() {
  return (
    <div data-testid="os-setup-notice" className="rounded-2xl border border-amber-400/40 bg-amber-500/10 p-5">
      <h2 className="font-bold text-amber-100">Verd1ct OS database is not set up yet</h2>
      <p className="mt-2 text-sm text-amber-100/90">
        The interface is live, but its tables do not exist in this environment. Apply migration{' '}
        <code className="rounded bg-black/30 px-1">0028_verdict_os</code> — through the Supabase SQL editor or the
        admin migration runner — and this page will populate with real data.
      </p>
      <p className="mt-2 text-xs text-amber-200/80">
        Nothing here is simulated: until the migration runs, every list below is genuinely empty.
      </p>
    </div>
  );
}

export function EmptyState({ title, detail }: { title: string; detail: string }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-white/[0.02] p-6 text-center">
      <p className="font-semibold text-white">{title}</p>
      <p className="mx-auto mt-1 max-w-md text-sm text-slate-400">{detail}</p>
    </div>
  );
}

const STATUS_TONE: Record<string, string> = {
  active: 'border-emerald-400/40 bg-emerald-500/15 text-emerald-100',
  complete: 'border-emerald-400/40 bg-emerald-500/15 text-emerald-100',
  approved: 'border-emerald-400/40 bg-emerald-500/15 text-emerald-100',
  blocked: 'border-red-400/40 bg-red-500/15 text-red-100',
  rejected: 'border-red-400/40 bg-red-500/15 text-red-100',
  pending: 'border-gold-400/40 bg-gold-500/15 text-gold-200',
  in_review: 'border-gold-400/40 bg-gold-500/15 text-gold-200',
  changes_requested: 'border-gold-400/40 bg-gold-500/15 text-gold-200',
  draft: 'border-white/15 bg-white/5 text-slate-300',
  todo: 'border-white/15 bg-white/5 text-slate-300',
  in_progress: 'border-brand-400/40 bg-brand-500/15 text-brand-100',
  done: 'border-emerald-400/40 bg-emerald-500/15 text-emerald-100',
  cancelled: 'border-white/10 bg-white/5 text-slate-500',
  withdrawn: 'border-white/10 bg-white/5 text-slate-500',
};

export function StatusChip({ status }: { status: string }) {
  return (
    <span className={`inline-block rounded-md border px-2 py-0.5 text-[11px] font-bold uppercase tracking-wide ${STATUS_TONE[status] ?? STATUS_TONE.draft}`}>
      {status.replace(/_/g, ' ')}
    </span>
  );
}
