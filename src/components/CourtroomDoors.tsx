'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { claimSettlement } from '@/lib/actions/sponsors';
import { RobedPortrait } from '@/components/RobedPortrait';
import { HOUSE_JUDGES, HOUSE_KEY, houseByKey, readHousePick, type HousePick } from '@/lib/houseJudges';
import type { Judge } from '@/lib/sponsors';

function safeAccent(hex: string | null | undefined): string {
  return hex && /^#[0-9a-fA-F]{6}$/.test(hex) ? hex : '#f5c65a';
}

export function CourtroomDoors({ initialJudge }: { initialJudge: Judge | null }) {
  const [open, setOpen] = useState(false);
  const [judge, setJudge] = useState<Judge | null>(initialJudge);
  const [pick, setPick] = useState<HousePick>('annie');
  const [claim, setClaim] = useState<{ code?: string; url?: string } | null>(null);
  const [claiming, setClaiming] = useState(false);
  const [locating, setLocating] = useState(false);

  useEffect(() => setPick(readHousePick()), []);

  const showVendor = pick === 'vendor' && !!judge;
  const accent = showVendor ? safeAccent(judge!.accent) : '#f5c65a';
  const dog = houseByKey(pick === 'vendor' ? 'annie' : pick);
  const name = showVendor ? judge!.judgeName : dog.name;

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
    <div className="select-none">
      <div
        className="relative h-80 overflow-hidden rounded-3xl border"
        style={{ borderColor: `${accent}44`, perspective: '1100px', background: 'radial-gradient(120% 90% at 50% 0%, #16203a 0%, #0b0e17 70%)' }}
      >
        {/* ---------- Interior: the bench + the judge ---------- */}
        <div className="absolute inset-0 flex flex-col items-center justify-center px-4 text-center">
          {/* The presiding judge — a robed portrait of your dog (or the sponsor). */}
          <RobedPortrait src={showVendor ? undefined : dog.src} emoji={showVendor ? judge!.emoji ?? '⚖️' : undefined} size={104} accent={accent} />

          {/* The judge's table / bench */}
          <div
            className="relative -mt-1 w-56 rounded-t-lg pb-2.5 pt-2"
            style={{ background: 'linear-gradient(180deg,#2a2016,#171009)', borderTop: `2px solid ${accent}55`, boxShadow: '0 -4px 18px rgba(0,0,0,.4)' }}
          >
            <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
              {showVendor ? 'Presiding · Sponsored' : 'Now presiding'}
            </div>
            <div className="truncate px-2 text-sm font-bold text-white">{name}</div>
          </div>

          {showVendor && judge!.discountLabel && (
            <div className="mt-2 flex items-center gap-2 text-xs">
              {claim ? (
                <>
                  {claim.code && <span className="rounded-md border border-white/15 bg-white/10 px-2 py-0.5 font-mono font-bold text-white">{claim.code}</span>}
                  {claim.url && <a href={claim.url} target="_blank" rel="noopener noreferrer" style={{ color: accent }} className="font-semibold">{judge!.ctaLabel ?? 'Redeem'} →</a>}
                </>
              ) : (
                <>
                  <span style={{ color: accent }}>⚖️ {judge!.discountLabel}</span>
                  <button onClick={doClaim} disabled={claiming} className="rounded-md px-2 py-0.5 font-semibold text-white" style={{ background: accent }}>
                    {claiming ? '…' : 'Claim'}
                  </button>
                </>
              )}
            </div>
          )}

          <Link href="/app/finder" className="btn-primary mt-3 px-4 py-2 text-sm">Present your case →</Link>
        </div>

        {/* ---------- The two doors ---------- */}
        {(['left', 'right'] as const).map((side) => (
          <div
            key={side}
            onClick={() => setOpen((v) => !v)}
            className="absolute top-0 h-full w-1/2 cursor-pointer transition-transform duration-700 ease-in-out"
            style={{
              [side]: 0,
              transformOrigin: side,
              transform: open ? `rotateY(${side === 'left' ? '' : '-'}108deg)` : 'rotateY(0deg)',
              background: 'linear-gradient(180deg,#3a2c1c,#241a10)',
              borderRight: side === 'left' ? '1px solid rgba(0,0,0,.5)' : undefined,
              borderLeft: side === 'right' ? '1px solid rgba(0,0,0,.5)' : undefined,
              boxShadow: 'inset 0 0 40px rgba(0,0,0,.45)',
            } as React.CSSProperties}
          >
            {/* panelling */}
            <div className="absolute inset-3 rounded-md border border-black/40" style={{ boxShadow: 'inset 0 0 20px rgba(0,0,0,.5)' }} />
            {/* brass handle */}
            <div
              className="absolute top-1/2 h-6 w-2 -translate-y-1/2 rounded-full"
              style={{ [side === 'left' ? 'right' : 'left']: 10, background: accent } as React.CSSProperties}
            />
            {/* scales emblem on the seam side */}
            {side === 'left' && (
              <div className="absolute bottom-6 left-1/2 -translate-x-1/2 text-2xl opacity-70" aria-hidden>⚖️</div>
            )}
          </div>
        ))}

        {/* IN SESSION sign over the doors (fades when open) */}
        <div
          className="pointer-events-none absolute inset-x-0 top-4 flex flex-col items-center transition-opacity duration-300"
          style={{ opacity: open ? 0 : 1 }}
        >
          <div className="rounded-full border px-3 py-1 text-[10px] font-bold uppercase tracking-[0.2em]" style={{ borderColor: `${accent}66`, color: accent, background: 'rgba(0,0,0,.4)', fontFamily: 'Georgia, serif' }}>
            ⚖️ In session
          </div>
        </div>
      </div>

      {/* Judge picker */}
      <div className="mt-2 flex flex-wrap justify-center gap-1.5">
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

      {/* Caption / actions under the box */}
      <div className="mt-2 flex items-center justify-between px-1">
        <button onClick={() => setOpen((v) => !v)} className="text-sm font-semibold text-white">
          {open ? '‹ Close the doors' : 'Try your case — enter the court ›'}
        </button>
      </div>
      {showVendor && <p className="mt-1 px-1 text-[10px] text-slate-500">Sponsored — presence and an offer only; never changes your verdict.</p>}
    </div>
  );
}
