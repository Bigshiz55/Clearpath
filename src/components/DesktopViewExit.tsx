'use client';

import { useEffect, useRef, useState } from 'react';
import { useT } from '@/i18n/I18nProvider';

const MOBILE = 'width=device-width, initial-scale=1, viewport-fit=cover';

/**
 * A floating "Phone view" button, shown ONLY when Desktop view is active — the
 * top nav slides under the phone status bar in desktop mode, so this is the
 * reliable way back.
 *
 * In a forced-width (desktop) viewport, `position: fixed` anchors to the huge
 * 1200px layout viewport, so a plain fixed button lands off-screen. We pin it to
 * the actual visible window using the visualViewport API instead, and reposition
 * on scroll/zoom so it's always reachable.
 */
export function DesktopViewExit() {
  const t = useT();
  const [desktop, setDesktop] = useState(false);
  const ref = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    try {
      setDesktop(localStorage.getItem('wv_view') === 'desktop');
    } catch {
      /* ignore */
    }
  }, []);

  useEffect(() => {
    if (!desktop) return;
    const vv = window.visualViewport;
    const place = () => {
      const el = ref.current;
      if (!el) return;
      if (vv) {
        // Bottom-centre of the *visible* area, in layout-viewport coordinates.
        el.style.left = `${vv.offsetLeft + vv.width / 2}px`;
        el.style.top = `${vv.offsetTop + vv.height - 16}px`;
        el.style.transform = 'translate(-50%, -100%)';
        // Counter-scale so the button stays a readable, tappable size no matter
        // how far the desktop page is zoomed out.
        const s = vv.scale ? 1 / vv.scale : 1;
        el.style.transform = `translate(-50%, -100%) scale(${s})`;
        el.style.transformOrigin = 'bottom center';
      }
    };
    place();
    vv?.addEventListener('resize', place);
    vv?.addEventListener('scroll', place);
    window.addEventListener('scroll', place, true);
    const id = window.setInterval(place, 500); // catch momentum-scroll drift on iOS
    return () => {
      vv?.removeEventListener('resize', place);
      vv?.removeEventListener('scroll', place);
      window.removeEventListener('scroll', place, true);
      window.clearInterval(id);
    };
  }, [desktop]);

  if (!desktop) return null;

  function backToPhone() {
    try {
      localStorage.setItem('wv_view', 'mobile');
    } catch {
      /* ignore */
    }
    const m = document.querySelector('meta[name="viewport"]');
    if (m) m.setAttribute('content', MOBILE);
    setDesktop(false);
  }

  return (
    <button
      ref={ref}
      type="button"
      onClick={backToPhone}
      className="fixed left-1/2 top-0 z-[300] flex items-center gap-2 whitespace-nowrap rounded-full border-2 border-white/30 bg-brand-500 px-6 py-3.5 text-lg font-bold text-white shadow-[0_10px_30px_-6px_rgba(0,0,0,0.8)]"
      title={t('misc.desktopExit.title')}
    >
      <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.9" aria-hidden>
        <rect x="7" y="3" width="10" height="18" rx="2.5" />
        <line x1="11" y1="18" x2="13" y2="18" />
      </svg>
      {t('misc.desktopExit.label')}
    </button>
  );
}
