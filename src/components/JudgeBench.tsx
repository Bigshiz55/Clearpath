'use client';

import { useState } from 'react';
import { claimSettlement } from '@/lib/actions/sponsors';
import type { Judge } from '@/lib/sponsors';

function safeAccent(hex: string | null | undefined): string {
  return hex && /^#[0-9a-fA-F]{6}$/.test(hex) ? hex : '#f5c65a';
}

/** The presiding judge, always shown while you build your case. Your face by
 *  default; the sponsor's graphic + settlement when one presides. */
export function JudgeBench({ initialJudge }: { initialJudge: Judge | null }) {
  const [judge, setJudge] = useState<Judge | null>(initialJudge);
  const [claim, setClaim] = useState<{ code?: string; url?: string } | null>(null);
  const [claiming, setClaiming] = useState(false);
  const [locating, setLocating] = useState(false);

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
      className="overflow-hidden rounded-2xl border"
      style={{ borderColor: `${accent}44`, background: 'radial-gradient(120% 120% at 50% -30%, #16203a 0%, #0f1320 65%)' }}
    >
      <div className="flex items-center gap-4 px-4 pt-4 sm:px-5">
        <div
          className="h-16 w-16 flex-none overflow-hidden rounded-full shadow-lg"
          style={{ border: `2px solid ${accent}77`, background: judge ? `radial-gradient(circle at 50% 35%, ${accent}44, ${accent}18)` : '#0b0e17' }}
        >
          {judge ? (
            <div className="grid h-full w-full place-items-center text-3xl" aria-hidden>{judge.emoji ?? '⚖️'}</div>
          ) : (
            // eslint-disable-next-line @next/next/no-img-element
            <img src="/judge-face.png" alt="The presiding judge" className="h-full w-full object-cover" />
          )}
        </div>
        <div className="min-w-0 flex-1">
          <div className="text-[10px] font-bold uppercase tracking-[0.18em]" style={{ color: accent, fontFamily: 'Georgia, serif' }}>
            ⚖️ Now presiding{judge ? ' · Sponsored' : ''}
          </div>
          <div className="truncate text-base font-bold text-white">{judge?.judgeName ?? 'The bench is yours'}</div>
          <div className="truncate text-xs text-slate-400">{judge?.tagline ?? 'Present your evidence and the court will rule.'}</div>
        </div>
        {judge && (
          <button onClick={findLocal} disabled={locating} className="flex-none text-xs text-slate-400 hover:text-white">
            {locating ? '…' : '📍 Local'}
          </button>
        )}
      </div>

      {/* the bench bar */}
      <div className="mt-3 h-2.5" style={{ background: 'linear-gradient(180deg,#2a2016,#171009)', borderTop: `2px solid ${accent}55` }} />

      {judge?.discountLabel && (
        <div className="flex flex-wrap items-center justify-between gap-2 px-4 py-2.5 sm:px-5" style={{ background: `${accent}0f` }}>
          <span className="text-sm">
            <span className="font-semibold text-white">⚖️ Settlement:</span> <span className="text-slate-200">{judge.discountLabel}</span>
          </span>
          {claim ? (
            <span className="flex items-center gap-2">
              {claim.code && <span className="rounded-md border border-white/15 bg-white/10 px-2.5 py-1 font-mono text-sm font-bold text-white">{claim.code}</span>}
              {claim.url && <a href={claim.url} target="_blank" rel="noopener noreferrer" className="text-sm font-semibold" style={{ color: accent }}>{judge.ctaLabel ?? 'Redeem'} →</a>}
            </span>
          ) : (
            <button onClick={doClaim} disabled={claiming} className="rounded-lg px-3 py-1.5 text-sm font-semibold text-white" style={{ background: accent }}>
              {claiming ? '…' : 'Claim settlement'}
            </button>
          )}
        </div>
      )}
      {judge && (
        <p className="px-4 pb-2 text-[10px] text-slate-500 sm:px-5">Sponsored — presence and an offer only; never changes your verdict.</p>
      )}
    </section>
  );
}
