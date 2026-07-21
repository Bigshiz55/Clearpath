import { PinkRibbon } from '@/components/PinkRibbon';
import { PLEDGE } from '@/lib/proPlan';

/**
 * The public impact counter — honest, computed from real active Pro members.
 * Shows the monthly amount pledged (members × the pledge) to the cause. At zero
 * members it flips to a "be the first" invite instead of exposing an empty stat.
 * Copy is explicit that this is a company-funded pledge, not a member tax gift.
 */
export function ImpactCounter({ members, className = '' }: { members: number; className?: string }) {
  const monthly = members * PLEDGE.amountUsd;
  const annual = monthly * 12;

  return (
    <div className={`card border-pink-400/40 bg-gradient-to-br from-pink-500/[0.12] to-transparent p-5 ${className}`}>
      <div className="flex items-center gap-3">
        <PinkRibbon className="h-9 w-9 flex-none text-[#ff6fae]" />
        <div className="min-w-0">
          <div className="text-[11px] font-black uppercase tracking-[0.14em] text-pink-200">Our impact so far</div>
          {members > 0 ? (
            <div className="mt-0.5 text-3xl font-black tabular-nums text-white">
              ${monthly.toLocaleString('en-US')}
              <span className="text-base font-bold text-pink-200/80">/mo pledged</span>
            </div>
          ) : (
            <div className="mt-0.5 text-2xl font-black text-white">Be the first. 💗</div>
          )}
        </div>
      </div>

      <p className="mt-2 text-sm text-slate-300">
        {members > 0 ? (
          <>
            <span className="font-bold text-white">{members.toLocaleString('en-US')}</span> member{members === 1 ? '' : 's'} giving{' '}
            <span className="text-white">${PLEDGE.amountUsd}/mo</span> each to the causes they choose — about{' '}
            <span className="font-bold text-white">${annual.toLocaleString('en-US')}/yr</span>. Company-funded and disbursed monthly.
          </>
        ) : (
          <>
            Every WatchVerdict Pro membership pledges <span className="text-white">${PLEDGE.amountUsd}/mo</span> to {PLEDGE.cause}. Join and you’re part of the first payout.
          </>
        )}
      </p>

      <p className="mt-2 text-[11px] leading-relaxed text-slate-500">
        A WatchVerdict pledge — we’re the donor of record and we publish what’s given. It isn’t a separate tax-deductible gift from you.
      </p>
    </div>
  );
}
