import Link from 'next/link';
import { createClient } from '@/lib/supabase/server';
import { getEntitlement, proMemberCount } from '@/lib/pro';
import { serverEnv } from '@/lib/env';
import { PRO_FEATURES, PRO_PRICE_LABEL, PLEDGE } from '@/lib/proPlan';
import { ProUpgradeButton } from '@/components/ProUpgrade';
import { PinkRibbon } from '@/components/PinkRibbon';
import { ImpactCounter } from '@/components/ImpactCounter';
import { CharityPicker } from '@/components/CharityPicker';
import { getCharity } from '@/lib/profile';
import { charityById } from '@/lib/charities';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'WatchVerdict Pro' };

export default async function ProPage() {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  const ent = user ? await getEntitlement(supabase, user.id) : { pro: false, source: null, currentPeriodEnd: null };
  const isAdmin = !!user?.email && serverEnv.adminEmails().includes(user.email.toLowerCase());
  const members = await proMemberCount();
  const charityId = user ? await getCharity(supabase, user.id) : null;
  const chosen = charityById(charityId);

  return (
    <div className="mx-auto max-w-lg space-y-6">
      <div className="text-center">
        <div className="inline-flex items-center gap-1.5 rounded-full border border-gold-400/40 bg-gold-500/15 px-3 py-1 text-[11px] font-black uppercase tracking-[0.15em] text-gold-200">
          <span aria-hidden>⭐</span> WatchVerdict Pro
        </div>
        <h1 className="mt-3 text-3xl font-extrabold text-white sm:text-4xl">Your taste, turned up.</h1>
        <p className="mt-2 text-sm text-slate-300">
          Everything free stays free. Pro adds the smart, personal touches — {PRO_PRICE_LABEL}, cancel anytime.
        </p>
      </div>

      <ImpactCounter members={members} />

      {ent.pro ? (
        <div className="card border-gold-400/40 bg-gold-500/[0.06] p-6 text-center">
          <div className="text-3xl" aria-hidden>🎉</div>
          <div className="mt-2 text-lg font-bold text-white">You’re on Pro</div>
          <p className="mt-1 text-sm text-slate-300">
            AI-tuned verdicts and household profiles are unlocked. Thanks for supporting WatchVerdict.
          </p>
          {ent.currentPeriodEnd && (
            <p className="mt-2 text-xs text-slate-500">Renews {new Date(ent.currentPeriodEnd).toLocaleDateString()}</p>
          )}
          <div className="mt-4 flex items-center justify-center gap-2 rounded-xl border border-pink-400/30 bg-pink-500/[0.08] px-4 py-2.5 text-sm text-pink-100">
            <PinkRibbon className="h-5 w-5 flex-none text-[#ff6fae]" />
            <span>Your membership gives <span className="font-bold text-white">${PLEDGE.amountUsd}/mo</span> to {chosen ? <span className="font-bold text-white">{chosen.emoji} {chosen.name}</span> : PLEDGE.cause}. 💗</span>
          </div>
          <Link href="/app" className="btn-secondary mt-4 inline-flex">Back to WatchVerdict →</Link>
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

          {/* The pledge — a reason to go Pro beyond features. */}
          <div className="card border-pink-400/40 bg-gradient-to-br from-pink-500/[0.12] to-transparent p-5">
            <div className="flex items-start gap-3">
              <PinkRibbon className="h-9 w-9 flex-none text-[#ff6fae]" />
              <div>
                <div className="font-bold text-white">${PLEDGE.amountUsd} of every membership fights breast cancer.</div>
                <p className="mt-1 text-sm text-slate-300">
                  For as long as you’re a member, <span className="text-white">${PLEDGE.amountUsd} of your {PRO_PRICE_LABEL}</span> goes to {PLEDGE.cause} — every single month. Same price to you; part of it does some good.
                </p>
              </div>
            </div>
          </div>

          <div className="card p-5">
            <div className="flex items-baseline justify-between">
              <span className="text-sm text-slate-300">WatchVerdict Pro</span>
              <span className="text-2xl font-black text-white">{PRO_PRICE_LABEL}</span>
            </div>
            <div className="mt-4"><ProUpgradeButton isAdmin={isAdmin} /></div>
            <p className="mt-2 flex items-center justify-center gap-1.5 text-center text-xs font-semibold text-pink-200">
              <PinkRibbon className="h-4 w-4 flex-none text-[#ff6fae]" /> Includes ${PLEDGE.amountUsd}/mo to {PLEDGE.cause}
            </p>
            <p className="mt-3 text-center text-[11px] text-slate-500">The deterministic engine — ranking, scores, the 7 scenarios — is free forever. Pro only refines what’s on top. The pledge is a WatchVerdict donation funded by memberships, not a separate tax-deductible gift from you.</p>
          </div>
        </>
      )}

      {/* Pick / change the cause the pledge supports — for members and prospects alike. */}
      {user && <CharityPicker current={charityId} isPro={ent.pro} />}
    </div>
  );
}
