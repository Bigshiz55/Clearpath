'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { updateAvatar } from '@/lib/actions/profile';
import { Avatar } from '@/components/Avatar';
import { useT } from '@/i18n/I18nProvider';

const EMOJI = ['🍿', '🎬', '🎭', '🕶️', '👑', '🐉', '🦊', '🧠', '🔥', '🌙', '⚡', '🎯', '🦉', '🌵', '🎸', '👽', '🐺', '🍕', '🧛', '🤠'];

export function AvatarPicker({ current, initial, pro = false }: { current: string | null; initial: string; pro?: boolean }) {
  const router = useRouter();
  const t = useT();
  const [sel, setSel] = useState<string | null>(current);
  const [pending, start] = useTransition();
  const [err, setErr] = useState<string | null>(null);

  function choose(value: string | null) {
    setErr(null);
    setSel(value);
    start(async () => {
      const r = await updateAvatar({ avatar: value });
      if (!r.ok) {
        setErr(r.error ?? t('account.avatar.couldNotSave'));
        setSel(current);
        return;
      }
      router.refresh();
    });
  }

  return (
    <section className="card p-5 sm:p-6">
      <div className="flex items-center gap-4">
        <Avatar label={sel || initial} px={56} pro={pro} />
        <div>
          <h2 className="text-lg font-bold text-white">{t('account.avatar.heading')}</h2>
          <p className="text-sm text-slate-400">{t('account.avatar.pickEmoji', { initial })}</p>
        </div>
      </div>

      <div className="mt-4 flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => choose(null)}
          disabled={pending}
          className={`grid h-10 w-10 place-items-center rounded-full border text-sm font-black transition disabled:opacity-60 ${
            sel === null ? 'border-brand-400 bg-brand-500/20 text-white' : 'border-white/15 bg-white/5 text-slate-200 hover:border-white/30'
          }`}
          title={t('account.avatar.useInitial')}
        >
          {initial}
        </button>
        {EMOJI.map((e) => (
          <button
            key={e}
            type="button"
            onClick={() => choose(e)}
            disabled={pending}
            className={`grid h-10 w-10 place-items-center rounded-full border text-lg transition disabled:opacity-60 ${
              sel === e ? 'border-brand-400 bg-brand-500/20' : 'border-white/15 bg-white/5 hover:border-white/30'
            }`}
          >
            {e}
          </button>
        ))}
      </div>
      {err && <p className="mt-2 text-xs text-rose-300">{err}</p>}
    </section>
  );
}
