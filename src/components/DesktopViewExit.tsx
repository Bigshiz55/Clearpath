'use client';

import { useEffect, useState } from 'react';

const MOBILE = 'width=device-width, initial-scale=1, viewport-fit=cover';

/**
 * A floating "Phone view" button, shown ONLY when Desktop view is active. In
 * desktop mode the top nav (with the toggle) slides under the phone's status bar
 * and can't be tapped, so this always-reachable pill at the bottom lets you get
 * back to the phone layout.
 */
export function DesktopViewExit() {
  const [desktop, setDesktop] = useState(false);

  useEffect(() => {
    try {
      setDesktop(localStorage.getItem('wv_view') === 'desktop');
    } catch {
      /* ignore */
    }
  }, []);

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
      type="button"
      onClick={backToPhone}
      className="fixed bottom-5 left-1/2 z-[300] flex -translate-x-1/2 items-center gap-2 rounded-full border-2 border-white/25 bg-brand-500 px-6 py-3.5 text-lg font-bold text-white shadow-[0_10px_30px_-6px_rgba(0,0,0,0.7)] transition hover:bg-brand-400"
      style={{ bottom: 'calc(1.25rem + env(safe-area-inset-bottom))' }}
      title="Switch back to the phone-friendly layout"
    >
      <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.9" aria-hidden>
        <rect x="7" y="3" width="10" height="18" rx="2.5" />
        <line x1="11" y1="18" x2="13" y2="18" />
      </svg>
      Back to phone view
    </button>
  );
}
