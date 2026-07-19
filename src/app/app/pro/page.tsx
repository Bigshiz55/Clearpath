import Link from 'next/link';
import { createClient } from '@/lib/supabase/server';
import { getEntitlement } from '@/lib/pro';
import { serverEnv } from '@/lib/env';
import { PRO_FEATURES, PRO_PRICE_LABEL } from '@/lib/proPlan';
import { ProUpgradeButton } from '@/components/ProUpgrade';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'WatchVrdIQt Pro' };

export default async function ProPage() {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  const ent = user ? await getEntitlement(supabase, user.id) : { pro: false, source: null, currentPeriodEnd: null };
  const isAdmin = !!user?.email && serverEnv.adminEmails().includes(user.email.toLowerCase());

  return (
    <div className="mx-auto max-w-lg space-y-6">
      <div className="text-center">
        <div className="inline-flex items-center gap-1.5 rounded-full border border-gold-400/40 bg-gold-500/15 px-3 py-1 text-[11px] font-black uppercase tracking-[0.15em] text-gold-200">
          <span aria-hidden>⭐</span> WatchVrdIQt Pro
        </div>
        <h1 className="mt-3 text-3xl font-extrabold text-white sm:text-4xl">Your taste, turned up.</h1>
        <p className="mt-2 text-sm text-slate-300">
          Everything free stays free. Pro adds the smart, personal touches — {PRO_PRICE_LABEL}, cancel anytime.
        </p>
      </div>

      {ent.pro ? (
        <div className="card border-gold-400/40 bg-gold-500/[0.06] p-6 text-center">
          <div className="text-3xl" aria-hidden>🎉</div>
          <div className="mt-2 text-lg font-bold text-white">You’re on Pro</div>
          <p className="mt-1 text-sm text-slate-300">
            AI-tuned verdicts and household profiles are unlocked. Thanks for supporting WatchVrdIQt.
          </p>
          {ent.currentPeriodEnd && (
            <p className="mt-2 text-xs text-slate-500">Renews {new Date(ent.currentPeriodEnd).toLocaleDateString()}</p>
          )}
          <Link href="/app" className="btn-secondary mt-4 inline-flex">Back to WatchVrdIQt →</Link>
        </div>
      ) : (
        <>
          <ul className="space-y-3">
            {PRO_FEATURES.map((f) => (
              <li key={f.title} className="flex gap-3 rounded-2xl border border-white/10 bg-white/[0.04] p-4">
                <span className="text-2xl" aria-hidden>{f.emoji}</span>
                <div>
                  <div className="font-bold text-white">{f.title}</div>
                  <p className="mt-0.5 text-sm text-slate-300">{f.blurb}</p>
                </div>
              </li>
            ))}
          </ul>

          <div className="card p-5">
            <div className="flex items-baseline justify-between">
              <span className="text-sm text-slate-300">WatchVrdIQt Pro</span>
              <span className="text-2xl font-black text-white">{PRO_PRICE_LABEL}</span>
            </div>
            <div className="mt-4"><ProUpgradeButton isAdmin={isAdmin} /></div>
            <p className="mt-3 text-center text-[11px] text-slate-500">The deterministic engine — ranking, scores, the 7 scenarios — is free forever. Pro only refines what’s on top.</p>
          </div>
        </>
      )}
    </div>
  );
}
