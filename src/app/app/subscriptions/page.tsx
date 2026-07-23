import Link from 'next/link';
import type { Metadata } from 'next';
import { createClient } from '@/lib/supabase/server';
import { getProfile, regionFor } from '@/lib/profile';
import { getSubscriptionValue, type ServiceValue } from '@/lib/subscriptionValue';
import { isPro } from '@/lib/pro';
import { PRO_PRICE_LABEL } from '@/lib/proPlan';
import { getServerI18n } from '@/i18n/server';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Are your subscriptions worth it?' };

const money = (n: number) => `$${n.toFixed(2)}`;

const BADGE_CLS: Record<ServiceValue['verdict'], string> = {
  cancel: 'border-red-400/40 bg-red-500/15 text-red-200',
  underused: 'border-amber-400/40 bg-amber-500/15 text-amber-200',
  worth: 'border-emerald-400/40 bg-emerald-500/15 text-emerald-200',
  free: 'border-white/15 bg-white/5 text-slate-300',
  unknown: 'border-white/15 bg-white/5 text-slate-400',
};
const BADGE_KEY: Record<ServiceValue['verdict'], string> = {
  cancel: 'account.subs.badgeCancel',
  underused: 'account.subs.badgeUnderused',
  worth: 'account.subs.badgeWorth',
  free: 'account.subs.badgeFree',
  unknown: 'account.subs.badgeUnknown',
};

export default async function SubscriptionsPage() {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  const uid = user?.id ?? '';
  const region = regionFor(uid ? await getProfile(supabase, uid) : null);
  const v = await getSubscriptionValue(supabase, uid, region);
  const pro = uid ? await isPro(supabase, uid) : false;
  const { t } = getServerI18n();

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-white sm:text-3xl">💸 {t('account.subs.heading')}</h1>
        <p className="mt-1 text-sm text-slate-400">{t('account.subs.subtitle')}</p>
      </div>

      {v.needsServices ? (
        <div className="card p-6 text-center">
          <div className="text-3xl">📺</div>
          <p className="mt-2 text-sm text-slate-300">{t('account.subs.needsServices')}</p>
          <Link href="/app/settings" className="btn-primary mt-4 inline-flex">{t('account.subs.pickServices')}</Link>
        </div>
      ) : (
        <>
          {/* Headline number */}
          <div className="card overflow-hidden p-0">
            <div className="bg-gradient-to-br from-red-500/15 via-amber-500/10 to-transparent p-5 sm:p-6">
              <div className="text-xs font-bold uppercase tracking-[0.15em] text-amber-300">{t('account.subs.streamingSpend')}</div>
              <div className="mt-1 text-3xl font-black text-white sm:text-4xl">{money(v.monthlyTotal)}<span className="text-lg font-bold text-slate-400">{t('account.subs.perMoEst')}</span></div>
              {v.cancelCount > 0 ? (
                <p className="mt-1.5 text-sm text-slate-200">
                  <span className="font-bold text-red-200">{t('account.subs.cancelCandidates', { count: v.cancelCount })}</span> {t('account.subs.upTo')}{' '}
                  <span className="font-bold text-emerald-200">{money(v.potentialSavings)}{t('account.subs.perMo')}</span> ({money(v.potentialSavings * 12)}{t('account.subs.perYr')}) {t('account.subs.youCouldSave')}
                </p>
              ) : (
                <p className="mt-1.5 text-sm text-slate-300">{t('account.subs.allUsed')}</p>
              )}
            </div>
          </div>

          {/* Pro conversion — at the AHA moment, framed as ROI. Honest: all real Pro features. */}
          {!pro && (
            <div className="card border-gold-400/40 bg-gradient-to-br from-gold-500/[0.08] to-transparent p-5">
              <div className="flex items-start gap-3">
                <span className="text-2xl" aria-hidden>⭐</span>
                <div className="min-w-0">
                  <div className="font-bold text-white">
                    {v.potentialSavings >= 3.99
                      ? t('account.subs.proFreeHere')
                      : t('account.subs.proGetMore')}
                  </div>
                  <p className="mt-1 text-sm text-slate-300">
                    {t('account.subs.proUnlocksPre', { price: PRO_PRICE_LABEL })} <span className="text-white">{t('account.subs.featAiVerdicts')}</span>, <span className="text-white">{t('account.subs.featHousehold')}</span>, {t('account.subs.proUnlocksMid')} <span className="text-white">{t('account.subs.featAdFree')}</span> {t('account.subs.proUnlocksTail')}
                  </p>
                  <Link href="/app/pro" className="btn-primary mt-3 inline-flex">✨ {t('account.subs.goPro', { price: PRO_PRICE_LABEL })}</Link>
                </div>
              </div>
            </div>
          )}

          {/* Per service */}
          <div className="space-y-2.5">
            {v.services.map((s) => {
              const badgeCls = BADGE_CLS[s.verdict];
              return (
                <div key={s.id} className="card flex items-center gap-3 p-4">
                  <span className="text-2xl" aria-hidden>{s.emoji}</span>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="font-bold text-white">{s.name}</span>
                      <span className={`rounded-full border px-2 py-0.5 text-[10px] font-bold ${badgeCls}`}>{t(BADGE_KEY[s.verdict])}</span>
                    </div>
                    <div className="mt-0.5 text-xs text-slate-400">
                      {s.estPrice != null ? `${money(s.estPrice)}${t('account.subs.perMoEst')} · ` : ''}
                      {t('account.subs.watchedInMo', { count: s.watched, months: Math.round(v.windowDays / 30) })}
                      {s.perWatch != null ? ` · ${t('account.subs.perWatch', { amount: money(s.perWatch) })}` : ''}
                    </div>
                    {s.verdict === 'cancel' && s.estPrice != null && (
                      <div className="mt-1 text-xs text-red-200">{t('account.subs.nothingWatched', { months: Math.round(v.windowDays / 30), amount: money(s.estPrice * (v.windowDays / 30)) })}</div>
                    )}
                  </div>
                  {(s.verdict === 'cancel' || s.verdict === 'underused') && (
                    <Link href="/app/new" className="btn-secondary flex-none text-xs">{t('account.subs.seeWhatsOn')}</Link>
                  )}
                </div>
              );
            })}
          </div>

          <p className="text-[11px] leading-relaxed text-slate-500">
            {t('account.subs.disclaimerPre')} <Link href="/app/settings" className="underline">{t('account.subs.settings')}</Link>{t('account.subs.disclaimerPost')}
          </p>
        </>
      )}
    </div>
  );
}
