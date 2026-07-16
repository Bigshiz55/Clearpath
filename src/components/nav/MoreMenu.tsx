'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';

export interface NavLink {
  href: string;
  label: string;
}

/** Desktop "More" dropdown for the secondary nav links — keeps the top bar
 *  focused on the primary destinations. */
export function MoreMenu({ links }: { links: NavLink[] }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const pathname = usePathname();

  useEffect(() => setOpen(false), [pathname]);
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [open]);

  const activeInMenu = links.some((l) => pathname === l.href || pathname.startsWith(`${l.href}/`));

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen((v) => !v)}
        className={`btn-ghost px-3 py-2 text-sm ${activeInMenu ? 'text-white' : ''}`}
        aria-haspopup="menu"
        aria-expanded={open}
      >
        More <span className={`ml-0.5 inline-block transition ${open ? 'rotate-180' : ''}`}>▾</span>
      </button>
      {open && (
        <div role="menu" className="absolute right-0 top-full z-50 mt-1 w-44 overflow-hidden rounded-xl border border-white/10 bg-ink-850 p-1 shadow-card">
          {links.map((l) => {
            const active = pathname === l.href || pathname.startsWith(`${l.href}/`);
            return (
              <Link
                key={l.href}
                href={l.href}
                role="menuitem"
                className={`block rounded-lg px-3 py-2 text-sm transition ${active ? 'bg-brand-500/20 text-brand-100' : 'text-slate-200 hover:bg-white/10'}`}
              >
                {l.label}
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
