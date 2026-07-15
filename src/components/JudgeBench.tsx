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
      className="flex h-full flex-col overflow-hidden rounded-2xl border"
      style={{ borderColor: `${accent}44`, background: 'radial-gradient(120% 120% at 50% -20%, #16203a 0%, #0f1320 65%)' }}
    >
      <div className={big ? 'flex flex-col items-center gap-2 px-5 pt-5 text-center' : 'flex items-center gap-4 px-4 pt-4 sm:px-5'}>
        <RobedPortrait src={showVendor ? undefined : dog.src} emoji={showVendor ? judge!.emoji ?? '⚖️' : undefined} size={size} accent={accent} />
        <div className={big ? 'min-w-0' : 'min-w-0 flex-1'}>
          <div className="text-[10px] font-bold uppercase tracking-[0.18em]" style={{ color: accent, fontFamily: 'Georgia, serif' }}>
            ⚖️ Now presiding{showVendor ? ' · Sponsored' : ''}
          </div>
          <div className={`${big ? 'text-lg' : 'truncate text-base'} font-bold text-white`}>{name}</div>
          <div className={`text-xs text-slate-400 ${big ? '' : 'truncate'}`}>{tagline}</div>
        </div>
      </div>

      {/* Judge picker */}
      <div className="flex flex-wrap justify-center gap-1.5 px-4 pt-3 sm:px-5">
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

      {/* the bench bar */}
      <div className="mt-3 h-2.5" style={{ background: 'linear-gradient(180deg,#2a2016,#171009)', borderTop: `2px solid ${accent}55` }} />

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
