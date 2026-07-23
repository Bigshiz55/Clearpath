'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useT } from '@/i18n/I18nProvider';

export function FindPeople() {
  const [q, setQ] = useState('');
  const router = useRouter();
  const t = useT();

  function go(e: React.FormEvent) {
    e.preventDefault();
    const uname = q.trim().replace(/^@/, '').toLowerCase();
    if (uname) router.push(`/app/u/${encodeURIComponent(uname)}`);
  }

  return (
    <form onSubmit={go} className="flex gap-2">
      <div className="flex flex-1 items-center gap-2 rounded-xl border border-white/10 bg-ink-900/80 px-3">
        <span className="text-slate-500">@</span>
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder={t('account.social.findPlaceholder')}
          className="flex-1 bg-transparent py-3 text-sm text-slate-100 outline-none placeholder:text-slate-500"
          autoCapitalize="none"
          autoCorrect="off"
        />
      </div>
      <button type="submit" className="btn-primary">
        {t('account.social.view')}
      </button>
    </form>
  );
}
