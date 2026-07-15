'use client';

import { useState } from 'react';
import { claimSettlement } from '@/lib/actions/sponsors';
import type { Judge } from '@/lib/sponsors';

function safeAccent(hex: string | null): string {
  return hex && /^#[0-9a-fA-F]{6}$/.test(hex) ? hex : '#7aa8ff';
}

export function SponsoredJudge({ initialJudge }: { initialJudge: Judge | null }) {
  const [judge, setJudge] = useState<Judge | null>(initialJudge);
  const [locating, setLocating] = useState(false);
  const [claim, setClaim] = useState<{ code?: string; url?: string } | null>(null);
  const [claiming, setClaiming] = useState(false);

  if (!judge) return null;
  const accent = safeAccent(judge.accent);

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
      className="card overflow-hidden p-5"
      style={{ borderColor: `${accent}66`, background: `linear-gradient(180deg, ${accent}14, transparent)` }}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          <span
            className="grid h-11 w-11 flex-none place-items-center rounded-xl text-2xl"
            style={{ background: `${accent}22` }}
            aria-hidden
          >
            {judge.emoji ?? '⚖️'}
          </span>
          <div>
            <div className="flex items-center gap-2">
              <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Presiding judge · Sponsored</span>
            </div>
            <div className="text-base font-bold text-white">{judge.judgeName}</div>
            {judge.tagline && <div className="text-xs text-slate-300">{judge.tagline}</div>}
          </div>
        </div>
        <button onClick={findLocal} disabled={locating} className="btn-ghost flex-none text-xs">
          {locating ? 'Locating…' : '📍 Local judge'}
        </button>
      </div>

      {judge.discountLabel && (
        <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-white/10 bg-black/20 p-3">
          <div className="text-sm">
            <span className="font-semibold text-white">⚖️ Settlement:</span>{' '}
            <span className="text-slate-200">{judge.discountLabel}</span>
          </div>
          {claim ? (
            <div className="flex items-center gap-2">
              {claim.code && (
                <span className="rounded-lg border border-white/15 bg-white/10 px-3 py-1 font-mono text-sm font-bold text-white">
                  {claim.code}
                </span>
              )}
              {claim.url && (
                <a href={claim.url} target="_blank" rel="noopener noreferrer" className="text-sm font-semibold" style={{ color: accent }}>
                  {judge.ctaLabel ?? 'Redeem'} →
                </a>
              )}
            </div>
          ) : (
            <button
              onClick={doClaim}
              disabled={claiming}
              className="rounded-lg px-3 py-1.5 text-sm font-semibold text-white transition"
              style={{ background: accent }}
            >
              {claiming ? '…' : 'Claim settlement'}
            </button>
          )}
        </div>
      )}

      <p className="mt-2 text-[11px] text-slate-500">
        Sponsored placement. The judge is presence and an offer only — it never changes your verdict or scores.
      </p>
    </section>
  );
}
