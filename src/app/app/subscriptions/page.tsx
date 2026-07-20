import Link from 'next/link';
import type { Metadata } from 'next';
import { createClient } from '@/lib/supabase/server';
import { getProfile, regionFor } from '@/lib/profile';
import { getSubscriptionValue, type ServiceValue } from '@/lib/subscriptionValue';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Are your subscriptions worth it?' };

const money = (n: number) => `$${n.toFixed(2)}`;

const BADGE: Record<ServiceValue['verdict'], { label: string; cls: string }> = {
  cancel: { label: 'Cancel candidate', cls: 'border-red-400/40 bg-red-500/15 text-red-200' },
  underused: { label: 'Barely used', cls: 'border-amber-400/40 bg-amber-500/15 text-amber-200' },
  worth: { label: 'Worth it', cls: 'border-emerald-400/40 bg-emerald-500/15 text-emerald-200' },
  free: { label: 'Free', cls: 'border-white/15 bg-white/5 text-slate-300' },
  unknown: { label: '—', cls: 'border-white/15 bg-white/5 text-slate-400' },
};

export default async function SubscriptionsPage() {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  const uid = user?.id ?? '';
  const region = regionFor(uid ? await getProfile(supabase, uid) : null);
  const v = await getSubscriptionValue(supabase, uid, region);

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-white sm:text-3xl">💸 Are your subscriptions worth it?</h1>
        <p className="mt-1 text-sm text-slate-400">What you’re paying vs. what you actually watch — from the services you picked and the titles you’ve marked watched.</p>
      </div>

      {v.needsServices ? (
        <div className="card p-6 text-center">
          <div className="text-3xl">📺</div>
          <p className="mt-2 text-sm text-slate-300">Tell us which services you pay for and we’ll show you which are pulling their weight.</p>
          <Link href="/app/settings" className="btn-primary mt-4 inline-flex">Pick my services →</Link>
        </div>
      ) : (
        <>
          {/* Headline number */}
          <div className="card overflow-hidden p-0">
            <div className="bg-gradient-to-br from-red-500/15 via-amber-500/10 to-transparent p-5 sm:p-6">
              <div className="text-xs font-bold uppercase tracking-[0.15em] text-amber-300">Your streaming spend</div>
              <div className="mt-1 text-3xl font-black text-white sm:text-4xl">{money(v.monthlyTotal)}<span className="text-lg font-bold text-slate-400">/mo est.</span></div>
              {v.cancelCount > 0 ? (
                <p className="mt-1.5 text-sm text-slate-200">
                  <span className="font-bold text-red-200">{v.cancelCount} look like cancel candidates</span> — up to{' '}
                  <span className="font-bold text-emerald-200">{money(v.potentialSavings)}/mo</span> ({money(v.potentialSavings * 12)}/yr) you could save.
                </p>
              ) : (
                <p className="mt-1.5 text-sm text-slate-300">Everything you pay for is getting used. Nice.</p>
              )}
            </div>
          </div>

          {/* Per service */}
          <div className="space-y-2.5">
            {v.services.map((s) => {
              const b = BADGE[s.verdict];
              return (
                <div key={s.id} className="card flex items-center gap-3 p-4">
                  <span className="text-2xl" aria-hidden>{s.emoji}</span>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="font-bold text-white">{s.name}</span>
                      <span className={`rounded-full border px-2 py-0.5 text-[10px] font-bold ${b.cls}`}>{b.label}</span>
                    </div>
                    <div className="mt-0.5 text-xs text-slate-400">
                      {s.estPrice != null ? `${money(s.estPrice)}/mo est. · ` : ''}
                      {s.watched} watched in {Math.round(v.windowDays / 30)} mo
                      {s.perWatch != null ? ` · ~${money(s.perWatch)} per watch` : ''}
                    </div>
                    {s.verdict === 'cancel' && s.estPrice != null && (
                      <div className="mt-1 text-xs text-red-200">Nothing watched here in {Math.round(v.windowDays / 30)} months — that’s ~{money(s.estPrice * (v.windowDays / 30))} so far.</div>
                    )}
                  </div>
                  {(s.verdict === 'cancel' || s.verdict === 'underused') && (
                    <Link href="/app/new" className="btn-secondary flex-none text-xs">See what’s on it</Link>
                  )}
                </div>
              );
            })}
          </div>

          <p className="text-[11px] leading-relaxed text-slate-500">
            Prices are rough US estimates and usage is approximate — we count titles you marked watched that are available on each service (a title can be on several). Use it as a gut check, not a bill. Update your services in <Link href="/app/settings" className="underline">Settings</Link>.
          </p>
        </>
      )}
    </div>
  );
}
