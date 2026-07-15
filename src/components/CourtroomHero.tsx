'use client';

import { useState } from 'react';
import Link from 'next/link';
import { claimSettlement } from '@/lib/actions/sponsors';
import type { Judge } from '@/lib/sponsors';

function safeAccent(hex: string | null | undefined): string {
  return hex && /^#[0-9a-fA-F]{6}$/.test(hex) ? hex : '#f5c65a';
}

export function CourtroomHero({ initialJudge }: { initialJudge: Judge | null }) {
  const [judge, setJudge] = useState<Judge | null>(initialJudge);
  const [locating, setLocating] = useState(false);
  const [claim, setClaim] = useState<{ code?: string; url?: string } | null>(null);
  const [claiming, setClaiming] = useState(false);

  const sponsored = !!judge;
  const accent = safeAccent(judge?.accent);

  function findLocal() {
    if (!('geolocation' in navigator)) return;
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        try {
          const res = await fetch('/api/judge', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
          });
          const data = await res.json();
          if (data.judge) {
            setJudge(data.judge as Judge);
            setClaim(null);
          }
        } finally {
          setLocating(false);
        }
      },
      () => setLocating(false),
      { enableHighAccuracy: false, timeout: 8000, maximumAge: 600000 },
    );
  }

  async function doClaim() {
    if (!judge) return;
    setClaiming(true);
    const res = await claimSettlement(judge.id);
    setClaiming(false);
    if (res.ok) {
      setClaim({ code: res.code, url: res.url });
      if (res.url) window.open(res.url, '_blank', 'noopener');
    }
  }

  return (
    <section
      className="relative overflow-hidden rounded-3xl border p-6 sm:p-8"
      style={{
        borderColor: sponsored ? `${accent}55` : 'rgba(245,198,90,0.28)',
        backgroundImage: `radial-gradient(900px 380px at 88% -20%, ${accent}22, transparent), radial-gradient(700px 360px at -8% 120%, rgba(47,107,255,0.16), transparent)`,
        backgroundColor: 'rgba(15,19,32,0.72)',
      }}
    >
      {/* Big decorative gavel/scales */}
      <div aria-hidden className="pointer-events-none absolute -right-6 -top-8 select-none text-[190px] leading-none opacity-[0.08] sm:text-[240px]">
        ⚖️
      </div>

      <div className="relative">
        <div
          className="text-xs font-semibold uppercase tracking-[0.22em]"
          style={{ fontFamily: 'Georgia, serif', color: accent }}
        >
          ⚖️ The court is in session
        </div>

        <h2 className="mt-2 text-4xl font-extrabold leading-[0.95] tracking-tight text-white sm:text-6xl">
          Try your{' '}
          <span className="bg-gradient-to-r from-brand-300 to-gold-400 bg-clip-text text-transparent">case.</span>
        </h2>
        <p className="mt-3 max-w-xl text-sm text-slate-300 sm:text-base">
          Tell the court exactly what you want — length, genre, how recent, who’s watching. Build your case and
          the judge hands down one verdict you can actually act on.
        </p>

        {/* Presiding judge (sponsored) */}
        {sponsored && judge && (
          <div
            className="mt-5 flex flex-wrap items-center gap-3 rounded-2xl border p-3"
            style={{ borderColor: `${accent}44`, background: `${accent}12` }}
          >
            <span className="grid h-12 w-12 flex-none place-items-center rounded-xl text-2xl" style={{ background: `${accent}22` }} aria-hidden>
              {judge.emoji ?? '⚖️'}
            </span>
            <div className="min-w-0 flex-1">
              <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Presiding today · Sponsored</div>
              <div className="truncate text-sm font-bold text-white">{judge.judgeName}</div>
              {judge.discountLabel && (
                <div className="text-xs" style={{ color: accent }}>⚖️ Settlement: {judge.discountLabel}</div>
              )}
            </div>
            {judge.discountLabel &&
              (claim ? (
                <div className="flex items-center gap-2">
                  {claim.code && (
                    <span className="rounded-lg border border-white/15 bg-white/10 px-2.5 py-1 font-mono text-sm font-bold text-white">{claim.code}</span>
                  )}
                  {claim.url && (
                    <a href={claim.url} target="_blank" rel="noopener noreferrer" className="text-sm font-semibold" style={{ color: accent }}>
                      {judge.ctaLabel ?? 'Redeem'} →
                    </a>
                  )}
                </div>
              ) : (
                <button onClick={doClaim} disabled={claiming} className="flex-none rounded-lg px-3 py-1.5 text-sm font-semibold text-white" style={{ background: accent }}>
                  {claiming ? '…' : 'Claim'}
                </button>
              ))}
          </div>
        )}

        <div className="mt-5 flex flex-wrap items-center gap-3">
          <Link href="/app/finder" className="btn-primary px-5 py-3 text-base">
            Step into court →
          </Link>
          <Link href="/app/together" className="btn-secondary">
            👪 Convene the whole room
          </Link>
          {sponsored && (
            <button onClick={findLocal} disabled={locating} className="btn-ghost text-sm">
              {locating ? 'Locating…' : '📍 See your local judge'}
            </button>
          )}
        </div>

        {sponsored && (
          <p className="mt-3 text-[11px] text-slate-500">
            Sponsored placement — presence and an offer only. It never changes your verdict or scores.
          </p>
        )}
      </div>
    </section>
  );
}
