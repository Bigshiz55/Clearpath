'use client';

import { useEffect, useState } from 'react';
import { claimSettlement } from '@/lib/actions/sponsors';
import { RobedPortrait } from '@/components/RobedPortrait';
import { HOUSE_JUDGES, HOUSE_KEY, houseByKey, readHousePick, type HousePick } from '@/lib/houseJudges';
import type { Judge } from '@/lib/sponsors';

function safeAccent(hex: string | null | undefined): string {
  return hex && /^#[0-9a-fA-F]{6}$/.test(hex) ? hex : '#f5c65a';
}

/** The presiding judge, always shown while you build your case. Pick a house
 *  judge (Annie / Waffles) or the local vendor (sponsor + coupon). */
export function JudgeBench({ initialJudge, big = false }: { initialJudge: Judge | null; big?: boolean }) {
  const [judge, setJudge] = useState<Judge | null>(initialJudge);
  const [pick, setPick] = useState<HousePick>('annie');
  const [claim, setClaim] = useState<{ code?: string; url?: string } | null>(null);
  const [claiming, setClaiming] = useState(false);
  const [locating, setLocating] = useState(false);

  useEffect(() => setPick(readHousePick()), []);

  function choose(p: HousePick) {
    setPick(p);
    setClaim(null);
    try { localStorage.setItem(HOUSE_KEY, p); } catch { /* ignore */ }
    if (p === 'vendor') findLocal();
  }

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
          if (data.judge) { setJudge(data.judge as Judge); setClaim(null); }
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

  const showVendor = pick === 'vendor' && !!judge;
  const accent = showVendor ? safeAccent(judge!.accent) : '#f5c65a';
  const dog = houseByKey(pick === 'vendor' ? 'annie' : pick);
  const size = big ? 132 : 88;

  const name = showVendor ? judge!.judgeName : dog.name;
  const tagline = showVendor
    ? judge!.tagline ?? 'Sponsored — presence and an offer only.'
    : pick === 'vendor'
      ? 'No local vendor presiding right now — Judge Annie has the bench.'
      : 'Present your evidence and the court will rule.';

  return (
    <section
      className="relative flex h-full flex-col overflow-hidden rounded-2xl border"
      style={{ borderColor: `${accent}55`, background: 'radial-gradient(120% 90% at 50% 4%, #2a1f10 0%, #1a1206 45%, #0a0703 100%)' }}
    >
      {/* Spotlight beam + faint seal — the same lit chamber as the courtroom doors. */}
      <div className="pointer-events-none absolute inset-0 animate-spot-breathe" style={{ background: `radial-gradient(60% 72% at 50% -8%, ${accent}33 0%, ${accent}10 34%, transparent 66%)` }} />
      <div className="pointer-events-none absolute left-1/2 top-1 -translate-x-1/2 leading-none" style={{ color: accent, opacity: 0.07, fontSize: big ? 108 : 76 }} aria-hidden>⚖️</div>

      <div className={`relative ${big ? 'flex flex-col items-center gap-2 px-5 pt-5 text-center' : 'flex items-center gap-4 px-4 pt-4 sm:px-5'}`}>
        <div style={{ filter: `drop-shadow(0 8px 22px ${accent}44)` }}>
          <RobedPortrait src={showVendor ? undefined : dog.src} emoji={showVendor ? judge!.emoji ?? '⚖️' : undefined} size={size} accent={accent} />
        </div>
        <div className={big ? 'min-w-0' : 'min-w-0 flex-1'}>
          <div className="inline-flex items-center gap-1.5 text-xs font-bold uppercase tracking-[0.12em]" style={{ color: accent }}>
            ⚖️ Now presiding{showVendor ? ' · Sponsored' : ''}
          </div>
          <div className={`${big ? 'text-xl' : 'truncate text-lg'} font-bold tracking-tight text-white`}>{name}</div>
          <div className={`text-sm text-slate-300 ${big ? '' : 'truncate'}`}>{tagline}</div>
        </div>
      </div>

      {/* Judge picker */}
      <div className="relative flex flex-wrap justify-center gap-1.5 px-4 pt-3 sm:px-5">
        {HOUSE_JUDGES.map((h) => (
          <button
            key={h.key}
            onClick={() => choose(h.key)}
            className={`rounded-lg border px-2.5 py-1 text-xs font-semibold transition ${pick === h.key ? 'border-gold-400/60 bg-gold-500/15 text-amber-100' : 'border-white/12 bg-white/5 text-slate-300 hover:bg-white/10'}`}
          >
            🐶 {h.name}
          </button>
        ))}
        <button
          onClick={() => choose('vendor')}
          disabled={locating}
          className={`rounded-lg border px-2.5 py-1 text-xs font-semibold transition ${pick === 'vendor' ? 'border-emerald-400/60 bg-emerald-500/15 text-emerald-100' : 'border-white/12 bg-white/5 text-slate-300 hover:bg-white/10'}`}
        >
          {locating ? '…' : '💵 Local vendor'}
        </button>
      </div>

      {/* the bench — a wooden desk edge with a warm gold lip */}
      <div className="relative mt-3 h-7 w-full" style={{ background: 'linear-gradient(180deg,#3a2a17 0%,#241914 45%,#140d07 100%)', borderTop: `2px solid ${accent}66`, boxShadow: `0 -8px 24px rgba(0,0,0,.5), inset 0 2px 0 ${accent}22` }} />

      {showVendor && judge!.discountLabel && (
        <div className="flex flex-wrap items-center justify-between gap-2 px-4 py-2.5 sm:px-5" style={{ background: `${accent}0f` }}>
          <span className="text-sm">
            <span className="font-semibold text-white">⚖️ Settlement:</span> <span className="text-slate-200">{judge!.discountLabel}</span>
          </span>
          {claim ? (
            <span className="flex items-center gap-2">
              {claim.code && <span className="rounded-md border border-white/15 bg-white/10 px-2.5 py-1 font-mono text-sm font-bold text-white">{claim.code}</span>}
              {claim.url && <a href={claim.url} target="_blank" rel="noopener noreferrer" className="text-sm font-semibold" style={{ color: accent }}>{judge!.ctaLabel ?? 'Redeem'} →</a>}
            </span>
          ) : (
            <button onClick={doClaim} disabled={claiming} className="rounded-lg px-3 py-1.5 text-sm font-semibold text-white" style={{ background: accent }}>
              {claiming ? '…' : 'Claim settlement'}
            </button>
          )}
        </div>
      )}
      {showVendor && (
        <p className="px-4 pb-2 pt-1 text-[10px] text-slate-500 sm:px-5">Sponsored — presence and an offer only; never changes your verdict.</p>
      )}
    </section>
  );
}
