import type { Metadata } from 'next';
import { createClient } from '@/lib/supabase/server';
import { getMyServices, getProfile, regionFor } from '@/lib/profile';
import { listCrews } from '@/lib/actions/crews';
import { getActiveJudge, type Judge } from '@/lib/sponsors';
import { FinderUI, type WatcherOption } from '@/components/FinderUI';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Find it · WatchVrdikt' };

export default async function FinderPage() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const services = user ? await getMyServices(supabase, user.id) : [];

  // Presiding judge (region/national default; local resolves client-side via GPS).
  let judge: Judge | null = null;
  if (user) {
    try {
      const profile = await getProfile(supabase, user.id);
      judge = await getActiveJudge(supabase, { region: regionFor(profile), nowMs: Date.now() });
    } catch {
      /* sponsors optional / pre-migration */
    }
  }

  // Offer crew members as "who's watching" — dedup by name, need real taste.
  const watchers: WatcherOption[] = [];
  try {
    const { crews } = await listCrews();
    const seen = new Set<string>();
    for (const c of crews ?? []) {
      for (const p of c.people) {
        const key = p.name.toLowerCase();
        if (seen.has(key)) continue;
        if (p.love.length === 0 && p.avoid.length === 0) continue;
        seen.add(key);
        watchers.push({ name: p.name, love: p.love, avoid: p.avoid });
      }
    }
  } catch {
    /* crews optional */
  }

  return (
    <div className="mx-auto max-w-2xl">
      <h1 className="text-2xl font-bold text-white sm:text-3xl">🔎 Find exactly what to watch</h1>
      <p className="mt-2 text-sm text-slate-400">
        Say what you want in plain English — length, genre, how recent, a minimum match, English audio, on your
        services. You get a <span className="font-semibold text-slate-200">ranked set</span> of real titles, each
        scored for you and showing exactly which of your rules it met. No black box, no “one guess,” no credits.
      </p>
      <div className="mt-6">
        <FinderUI hasServices={services.length > 0} watchers={watchers} initialJudge={judge} />
      </div>
    </div>
  );
}
