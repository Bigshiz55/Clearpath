import { notFound } from 'next/navigation';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/server';
import { serverEnv } from '@/lib/env';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Growth OS · WatchVerd1ct', robots: { index: false, follow: false } };

const NAV = [
  { href: '/growth-os', label: 'Today' },
  { href: '/growth-os/crm', label: 'Prospects' },
  { href: '/growth-os/outreach', label: 'Outreach' },
  { href: '/growth-os/campaigns', label: 'Campaigns & links' },
  { href: '/growth-os/feedback', label: 'Feedback' },
];

export default async function GrowthOsLayout({ children }: { children: React.ReactNode }) {
  // Owner-only. Non-admins get a 404 (the route's existence is not revealed).
  let email: string | null = null;
  try {
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    email = user?.email?.toLowerCase() ?? null;
  } catch {
    email = null;
  }
  const admins = serverEnv.adminEmails();
  const isAdmin = !!email && admins.length > 0 && admins.includes(email);

  // Preview-only unlock. Vercel sets VERCEL_ENV='preview' on every preview
  // deployment (not production), so this opens the real interface on an
  // unguessable, noindexed preview URL for review — while PRODUCTION stays
  // strictly owner-gated. The banner below makes the bypass obvious.
  const previewUnlock = process.env.VERCEL_ENV === 'preview';
  if (!isAdmin && !previewUnlock) notFound();
  const bypassed = previewUnlock && !isAdmin;

  return (
    <div className="min-h-dvh bg-slate-950 text-slate-100">
      {bypassed && (
        <div className="bg-amber-500 px-4 py-1.5 text-center text-[11px] font-bold text-amber-950">
          PREVIEW BUILD · owner auth bypassed for this deployment only · do not share publicly
        </div>
      )}
      <header className="sticky top-0 z-10 border-b border-white/10 bg-slate-950/90 backdrop-blur">
        <div className="mx-auto flex max-w-3xl items-center gap-3 px-4 py-3">
          <span className="text-sm font-black tracking-tight text-white">◆ Growth OS</span>
          <nav className="flex flex-1 gap-1 overflow-x-auto text-xs">
            {NAV.map((n) => (
              <Link key={n.href} href={n.href} className="whitespace-nowrap rounded-lg px-2.5 py-1.5 font-semibold text-slate-300 hover:bg-white/10 hover:text-white">
                {n.label}
              </Link>
            ))}
          </nav>
        </div>
      </header>
      <main className="mx-auto max-w-3xl px-4 py-5 pb-24">{children}</main>
    </div>
  );
}
