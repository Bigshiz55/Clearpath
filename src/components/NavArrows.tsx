'use client';

import { useRouter, usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';
import { useT } from '@/i18n/I18nProvider';

/**
 * A single contextual "Back" affordance for /app screens.
 *
 * Previously this rendered Back / Home / Forward on every page, which duplicated
 * the browser controls, the nav-bar logo/Home link, and the mobile Home tab
 * (Home was reachable four ways on a phone). Per the navigation principles we keep
 * only a contextual Back — useful for seniors and big-text mode — and drop the
 * redundant Home button and the unjustified Forward button (no guided workflow
 * needs a forward control). Nothing renders on the home page itself. Back drives
 * real browser history; the button scales up in Simple/Vintage mode via
 * `btn-secondary`.
 */
export function NavArrows() {
  const router = useRouter();
  const pathname = usePathname();
  const t = useT();
  const [canBack, setCanBack] = useState(false);
  const onHome = pathname === '/app';

  useEffect(() => {
    setCanBack(typeof window !== 'undefined' && window.history.length > 1);
  }, [pathname]);

  if (onHome || !canBack) return null;

  return (
    <div className="mb-4">
      <button
        type="button"
        onClick={() => router.back()}
        className="btn-ghost inline-flex items-center gap-1.5 text-slate-300"
        aria-label={t('nav.back')}
      >
        <span aria-hidden className="text-lg leading-none">←</span> {t('nav.back')}
      </button>
    </div>
  );
}
