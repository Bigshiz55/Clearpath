import Link from 'next/link';
import type { Metadata } from 'next';
import { createClient } from '@/lib/supabase/server';
import { Logo } from '@/components/Logo';
import { JoinForm } from '@/components/JoinForm';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Join a crew · WatchVrdIQt' };

export default async function JoinPage({ params }: { params: { code: string } }) {
  let crewName: string | null = null;
  try {
    const supabase = createClient();
    const { data } = await supabase.rpc('get_crew_public', { p_code: params.code });
    const row = Array.isArray(data) ? data[0] : data;
    crewName = (row?.name as string) ?? null;
  } catch {
    crewName = null;
  }

  return (
    <div className="min-h-dvh">
      <header className="container-page flex h-16 items-center">
        <Logo />
      </header>
      <main className="container-page mx-auto max-w-md py-8">
        {crewName ? (
          <>
            <h1 className="text-2xl font-bold text-white">
              Join <span className="text-brand-300">{crewName}</span>
            </h1>
            <p className="mt-2 text-sm text-slate-400">
              A 30-second taste calibration so movie-night picks work for you too. Tap what you love and
              any hard no’s.
            </p>
            <div className="mt-5">
              <JoinForm code={params.code} crewName={crewName} />
            </div>
          </>
        ) : (
          <div className="card p-8 text-center">
            <div className="text-3xl">🔗</div>
            <h1 className="mt-3 text-lg font-semibold text-white">This invite link isn’t valid</h1>
            <p className="mt-2 text-sm text-slate-400">Ask for a fresh link, or explore WatchVrdIQt yourself.</p>
            <Link href="/app" className="btn-secondary mt-5 inline-flex">Open WatchVrdIQt →</Link>
          </div>
        )}
      </main>
    </div>
  );
}
