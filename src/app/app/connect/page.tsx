import type { Metadata } from 'next';
import { PhotoAdd } from '@/components/PhotoAdd';
import { ConnectPhone } from '@/components/ConnectPhone';
import { getServerI18n } from '@/i18n/server';

export const metadata: Metadata = { title: 'Add from your phone · WatchVerdict' };

export default function ConnectPage() {
  const { t } = getServerI18n();
  return (
    <div className="mx-auto max-w-xl">
      <h1 className="text-2xl font-bold text-white sm:text-3xl">📱 {t('account.connect.heading')}</h1>
      <p className="mt-2 text-sm text-slate-400">
        {t('account.connect.subtitle')}
      </p>

      <div className="mt-5">
        <PhotoAdd />
      </div>

      <div className="mt-6">
        <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400">
          {t('account.connect.handsFree')}
        </div>
        <ConnectPhone />
      </div>
    </div>
  );
}
