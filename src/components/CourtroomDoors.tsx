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
      {/* Make the purpose unmistakable: this is where indecision goes. */}
      <div className="mb-3 text-center">
        <div className="text-xl font-black leading-tight text-white sm:text-2xl">Can’t decide? Take it to court. ⚖️</div>
        <div className="mt-1 text-sm text-slate-300">You — or the whole group — can’t pick. Tap the doors and let the judge settle it.</div>
      </div>
      <div
        className="group relative h-96 cursor-pointer overflow-hidden rounded-3xl border shadow-card"
        style={{ borderColor: `${accent}55`, perspective: '1400px' }}
        onClick={() => setOpen((v) => !v)}
      >
        {/* ================= THE LIT CHAMBER (revealed behind the doors) ========= */}
        <div
          className="absolute inset-0"
          style={{ background: 'radial-gradient(120% 90% at 50% 6%, #2a1f10 0%, #1a1206 42%, #0a0703 100%)' }}
        >
          {/* Spotlight beam from above the bench */}
          <div
            className="pointer-events-none absolute inset-x-0 top-0 h-full animate-spot-breathe"
            style={{
              background:
                `radial-gradient(58% 74% at 50% -6%, ${accent}3d 0%, ${accent}12 34%, transparent 66%)`,
            }}
          />
          {/* Great seal on the back wall */}
          <div
            className="pointer-events-none absolute left-1/2 top-[16%] -translate-x-1/2 text-[130px] leading-none"
            style={{ color: accent, opacity: 0.09 }}
            aria-hidden
          >
            ⚖️
          </div>
          {/* Fluted columns for depth */}
          <div className="pointer-events-none absolute inset-y-6 left-3 w-5 rounded" style={{ background: 'linear-gradient(90deg,#2c2114,#100b05)' }} />
          <div className="pointer-events-none absolute inset-y-6 right-3 w-5 rounded" style={{ background: 'linear-gradient(270deg,#2c2114,#100b05)' }} />

          {/* IN SESSION plaque */}
          <div className="absolute inset-x-0 top-4 flex justify-center">
            <div
              className="rounded-full border px-3 py-1 text-[10px] font-black uppercase tracking-[0.2em] whitespace-nowrap"
              style={{ borderColor: `${accent}77`, color: accent, background: 'rgba(0,0,0,.45)', boxShadow: `0 0 22px ${accent}33`, fontFamily: 'Georgia, serif' }}
            >
              ⚖️ In session
            </div>
          </div>

          {/* The judge, spotlit, rising behind the bench */}
          <div
            key={`${pick}-${open}`}
            className={`absolute left-1/2 top-[26%] -translate-x-1/2 ${open ? 'animate-reveal-in' : ''}`}
            style={{ filter: `drop-shadow(0 10px 26px ${accent}44)` }}
          >
            <RobedPortrait src={showVendor ? undefined : dog.src} emoji={showVendor ? judge!.emoji ?? '⚖️' : undefined} size={140} accent={accent} />
          </div>

          {/* The bench — a wide desk the judge presides behind: nameplate on top,
              the call-to-action (or the sponsor's settlement) beneath it. */}
          <div className="absolute inset-x-0 bottom-0">
            <div
              className="flex h-28 w-full flex-col items-center justify-center gap-1.5 px-4"
              style={{
                background: 'linear-gradient(180deg,#3a2a17 0%,#241914 40%,#140d07 100%)',
                borderTop: `2px solid ${accent}66`,
                boxShadow: `0 -12px 34px rgba(0,0,0,.55), inset 0 2px 0 ${accent}22`,
              }}
            >
              <div className="text-center leading-tight">
                <div className="text-[9px] uppercase tracking-[0.18em] text-slate-400">{showVendor ? 'Presiding · Sponsored' : 'Now presiding'}</div>
                <div className="text-sm font-bold text-white" style={{ fontFamily: 'Georgia, serif' }}>{name}</div>
              </div>
              {showVendor && judge!.discountLabel ? (
                <div className="flex items-center gap-2 text-[11px]">
                  {claim ? (
                    <>
                      {claim.code && <span className="rounded border border-white/15 bg-white/10 px-2 py-0.5 font-mono font-bold text-white">{claim.code}</span>}
                      {claim.url && <a href={claim.url} onClick={(e) => e.stopPropagation()} target="_blank" rel="noopener noreferrer" style={{ color: accent }} className="font-semibold">{judge!.ctaLabel ?? 'Redeem'} →</a>}
                    </>
                  ) : (
                    <>
                      <span style={{ color: accent }}>⚖️ {judge!.discountLabel}</span>
                      <button onClick={(e) => { e.stopPropagation(); doClaim(); }} disabled={claiming} className="rounded px-2 py-0.5 font-semibold text-white" style={{ background: accent }}>
                        {claiming ? '…' : 'Claim'}
                      </button>
                    </>
                  )}
                </div>
              ) : (
                <Link
                  href="/app/ask"
                  onClick={(e) => e.stopPropagation()}
                  className={`btn-primary px-4 py-1.5 text-sm shadow-lg transition-opacity duration-500 ${open ? 'opacity-100 delay-300' : 'opacity-0'}`}
                >
                  Present your case →
                </Link>
              )}
            </div>
          </div>
        </div>

        {/* Warm light flooding out when the doors part */}
        <div
          className={`pointer-events-none absolute inset-0 transition-opacity duration-700 ${open ? 'opacity-100' : 'opacity-0'}`}
          style={{ background: `radial-gradient(60% 55% at 50% 40%, ${accent}22, transparent 70%)` }}
        />

        {/* ================= THE DOORS ========= */}
        {(['left', 'right'] as const).map((side) => (
          <div
            key={side}
            className="absolute top-0 h-full w-1/2 transition-transform duration-[900ms] ease-in-out"
            style={{
              [side]: 0,
              transformOrigin: side,
              transform: open ? `rotateY(${side === 'left' ? '-' : ''}115deg)` : undefined,
              background:
                'repeating-linear-gradient(90deg,#4a3720 0px,#3d2d19 7px,#432f1c 14px), linear-gradient(180deg,#4a3720,#241a10)',
              backgroundBlendMode: 'overlay',
              boxShadow: 'inset 0 0 60px rgba(0,0,0,.55)',
              backfaceVisibility: 'hidden',
            } as React.CSSProperties}
          >
            {/* arched top */}
            <div className="absolute inset-x-2 top-2 h-10 rounded-t-[40px] border border-black/40" style={{ boxShadow: 'inset 0 0 18px rgba(0,0,0,.5)' }} />
            {/* recessed panels */}
            <div className="absolute inset-x-3 top-14 bottom-16 rounded-md border border-black/50" style={{ boxShadow: 'inset 0 0 26px rgba(0,0,0,.55)' }} />
            <div className="absolute inset-x-6 top-20 bottom-24 rounded border border-black/30" />
            {/* carved scales emblem */}
            <div className="absolute left-1/2 top-[38%] -translate-x-1/2 text-4xl opacity-30" aria-hidden style={{ color: '#000' }}>⚖️</div>
            {/* brass handle near the seam */}
            <div
              className="absolute top-1/2 h-10 w-2.5 -translate-y-1/2 rounded-full"
              style={{
                [side === 'left' ? 'right' : 'left']: 8,
                background: `linear-gradient(180deg,#fbe6a8,${accent},#7a5a1a)`,
                boxShadow: `0 0 12px ${accent}66`,
              } as React.CSSProperties}
            />
          </div>
        ))}

        {/* Glowing light seam leaking between the closed doors — the tease */}
        <div
          className={`pointer-events-none absolute inset-y-6 left-1/2 w-[6px] -translate-x-1/2 rounded-full transition-opacity duration-500 ${open ? 'opacity-0' : 'animate-seam-glow opacity-100'}`}
          style={{ background: `linear-gradient(180deg, transparent, ${accent}, #fff8e6, ${accent}, transparent)`, boxShadow: `0 0 24px ${accent}, 0 0 60px ${accent}88` }}
        />

        {/* Closed-door invitation — a mounted medallion of who's presiding today */}
        <div className={`pointer-events-none absolute inset-0 flex flex-col items-center justify-center gap-3 transition-opacity duration-300 ${open ? 'opacity-0' : 'opacity-100'}`}>
          <div className="rounded-full border px-3 py-1 text-[10px] font-black uppercase tracking-[0.2em] whitespace-nowrap" style={{ borderColor: `${accent}77`, color: accent, background: 'rgba(0,0,0,.5)', boxShadow: `0 0 22px ${accent}44`, fontFamily: 'Georgia, serif' }}>
            ⚖️ In session
          </div>
          <div
            className="grid h-24 w-24 place-items-center overflow-hidden rounded-full border-2"
            style={{ borderColor: accent, boxShadow: `0 0 28px ${accent}77, inset 0 0 0 4px rgba(0,0,0,.4)`, background: showVendor ? `radial-gradient(circle at 50% 35%, ${accent}44, ${accent}18)` : '#0b0e17' }}
          >
            {showVendor ? (
              <span className="text-4xl" aria-hidden>{judge!.emoji ?? '⚖️'}</span>
            ) : (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={dog.src} alt={`${name}, presiding`} className="h-full w-full object-cover" />
            )}
          </div>
          <div className="flex flex-col items-center gap-1">
            <span className="rounded-full bg-black/55 px-3 py-1 text-xs font-bold text-white backdrop-blur" style={{ fontFamily: 'Georgia, serif' }}>{name} will settle it for you</span>
            <span className="rounded-full bg-black/45 px-3 py-0.5 text-[11px] font-semibold text-amber-100 backdrop-blur">Still deliberating? Tap to enter ⚖️</span>
          </div>
        </div>
      </div>

      {/* Judge picker */}
      <div className="mt-3 flex flex-wrap justify-center gap-1.5">
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

      <div className="mt-2 flex items-center justify-center px-1">
        <button onClick={() => setOpen((v) => !v)} className="text-sm font-semibold text-white">
          {open ? '‹ Close the doors' : 'Can’t decide? Enter the court ›'}
        </button>
      </div>
      {showVendor && <p className="mt-1 text-center text-[10px] text-slate-500">Sponsored — presence and an offer only; never changes your verdict.</p>}
    </div>
  );
}
