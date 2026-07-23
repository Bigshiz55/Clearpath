'use client';

import { useEffect, useState } from 'react';
import { useT } from '@/i18n/I18nProvider';

const KEY = 'wv_view';
const DESKTOP = 'width=1200, viewport-fit=cover';
const MOBILE = 'width=device-width, initial-scale=1, viewport-fit=cover';

function applyViewport(desktop: boolean) {
  const m = document.querySelector('meta[name="viewport"]');
  if (m) m.setAttribute('content', desktop ? DESKTOP : MOBILE);
}

/**
 * A "Desktop view" switch. On a phone the site is responsive (mobile layout);
 * this forces the full desktop layout by setting the viewport to a fixed 1200px
 * width, so the browser renders the PC version scaled to fit (pinch to zoom).
 * The preference persists in localStorage and is applied before paint by a small
 * script in the root layout, so there's no flash on reload.
 */
export function ViewModeToggle({ className = '' }: { className?: string }) {
  const t = useT();
  const [desktop, setDesktop] = useState(false);

  useEffect(() => {
    try {
      setDesktop(localStorage.getItem(KEY) === 'desktop');
    } catch {
      /* ignore */
    }
  }, []);

  function toggle() {
    const next = !desktop;
    setDesktop(next);
    try {
      localStorage.setItem(KEY, next ? 'desktop' : 'mobile');
    } catch {
      /* ignore */
    }
    applyViewport(next);
  }

  return (
    <button
      type="button"
      onClick={toggle}
      title={desktop ? t('misc.viewMode.toPhoneTitle') : t('misc.viewMode.toDesktopTitle')}
      aria-pressed={desktop}
      className={`inline-flex items-center gap-1.5 rounded-lg border border-white/15 bg-white/5 px-2.5 py-1.5 text-sm font-semibold text-slate-200 transition hover:bg-white/10 ${className}`}
    >
      {desktop ? (
        <>
          {/* phone icon */}
          <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden>
            <rect x="7" y="3" width="10" height="18" rx="2.5" />
            <line x1="11" y1="18" x2="13" y2="18" />
          </svg>
          <span className="hidden sm:inline">{t('misc.viewMode.phoneView')}</span>
        </>
      ) : (
        <>
          {/* monitor icon */}
          <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden>
            <rect x="3" y="4" width="18" height="12" rx="2" />
            <line x1="9" y1="20" x2="15" y2="20" />
            <line x1="12" y1="16" x2="12" y2="20" />
          </svg>
          <span className="hidden sm:inline">{t('misc.viewMode.desktopView')}</span>
        </>
      )}
    </button>
  );
}
