'use client';

import { useRef, useState } from 'react';
import { toPng } from 'html-to-image';

const MARK = (
  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
    <div style={{ width: 22, height: 22, borderRadius: 7, background: 'linear-gradient(135deg,#3b82f6,#7c5cff)' }} />
    <span style={{ fontSize: 15, fontWeight: 800, letterSpacing: 0.3 }}>
      Watch<span style={{ color: '#7dd3fc' }}>VrdIQt</span>
    </span>
  </div>
);

/** Wraps a card node and adds Save / Share (Web Share with the PNG, or download). */
export function ShareCard({ filename, children }: { filename: string; children: React.ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  const [busy, setBusy] = useState(false);

  async function png(): Promise<string | null> {
    if (!ref.current) return null;
    return toPng(ref.current, { pixelRatio: 3, cacheBust: true });
  }
  async function save() {
    setBusy(true);
    try {
      const url = await png();
      if (url) {
        const a = document.createElement('a');
        a.href = url;
        a.download = `${filename}.png`;
        a.click();
      }
    } finally {
      setBusy(false);
    }
  }
  async function share() {
    setBusy(true);
    try {
      const url = await png();
      if (!url) return;
      const blob = await (await fetch(url)).blob();
      const file = new File([blob], `${filename}.png`, { type: 'image/png' });
      if (navigator.share && navigator.canShare?.({ files: [file] })) {
        await navigator.share({ files: [file], title: 'WatchVrdIQt' });
      } else {
        await save();
      }
    } catch {
      /* cancelled */
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <div ref={ref} style={{ display: 'inline-block' }}>{children}</div>
      <div className="mt-3 flex gap-2">
        <button onClick={share} disabled={busy} className="btn-primary">Share</button>
        <button onClick={save} disabled={busy} className="btn-secondary">Save image</button>
      </div>
    </div>
  );
}

const shell: React.CSSProperties = {
  width: 340,
  padding: 26,
  borderRadius: 24,
  color: '#e8edf7',
  fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
  display: 'flex',
  flexDirection: 'column',
  boxSizing: 'border-box',
};

export function TasteCardArt({ label, loves, avoids }: { label: string; loves: string[]; avoids: string[] }) {
  return (
    <div style={{ ...shell, minHeight: 420, background: 'radial-gradient(120% 100% at 0% 0%, #16234a 0%, #0b1020 60%)' }}>
      {MARK}
      <div style={{ marginTop: 26, fontSize: 12, letterSpacing: 2, color: '#8b95ad', textTransform: 'uppercase' }}>My taste</div>
      <div style={{ marginTop: 4, fontSize: 30, fontWeight: 900, lineHeight: 1.05 }}>{label}</div>

      <div style={{ marginTop: 22, fontSize: 12, fontWeight: 700, color: '#6ee7b7', textTransform: 'uppercase', letterSpacing: 1 }}>Loves</div>
      <div style={{ marginTop: 6, display: 'flex', flexWrap: 'wrap', gap: 6 }}>
        {(loves.length ? loves : ['Still figuring it out']).map((t) => (
          <span key={t} style={{ fontSize: 13, padding: '5px 10px', borderRadius: 999, background: 'rgba(16,185,129,.18)', color: '#a7f3d0' }}>{t}</span>
        ))}
      </div>

      {avoids.length > 0 && (
        <>
          <div style={{ marginTop: 18, fontSize: 12, fontWeight: 700, color: '#fca5a5', textTransform: 'uppercase', letterSpacing: 1 }}>Hard no</div>
          <div style={{ marginTop: 6, display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            {avoids.map((t) => (
              <span key={t} style={{ fontSize: 13, padding: '5px 10px', borderRadius: 999, background: 'rgba(239,68,68,.16)', color: '#fecaca' }}>{t}</span>
            ))}
          </div>
        </>
      )}

      <div style={{ marginTop: 'auto', paddingTop: 22, fontSize: 12, color: '#5f6b85' }}>Stop scrolling. Get rolling. · clearpath-pearl-chi.vercel.app</div>
    </div>
  );
}

export function WrappedCardArt({ monthLabel, watched, avgRating, top }: { monthLabel: string; watched: number; avgRating: number | null; top: { title: string; rating: number | null }[] }) {
  return (
    <div style={{ ...shell, minHeight: 460, background: 'radial-gradient(120% 100% at 100% 0%, #2a1747 0%, #0b1020 60%)' }}>
      {MARK}
      <div style={{ marginTop: 24, fontSize: 12, letterSpacing: 2, color: '#8b95ad', textTransform: 'uppercase' }}>{monthLabel} · Wrapped</div>
      <div style={{ marginTop: 10, display: 'flex', alignItems: 'baseline', gap: 10 }}>
        <span style={{ fontSize: 56, fontWeight: 900, lineHeight: 1 }}>{watched}</span>
        <span style={{ fontSize: 16, color: '#c7d0e4' }}>watched</span>
      </div>
      {avgRating != null && (
        <div style={{ marginTop: 4, fontSize: 15, color: '#fcd34d' }}>★ {avgRating.toFixed(1)} avg rating</div>
      )}

      {top.length > 0 && (
        <>
          <div style={{ marginTop: 22, fontSize: 12, fontWeight: 700, color: '#93c5fd', textTransform: 'uppercase', letterSpacing: 1 }}>Your top picks</div>
          <div style={{ marginTop: 8, display: 'flex', flexDirection: 'column', gap: 8 }}>
            {top.map((t, i) => (
              <div key={i} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
                <span style={{ fontSize: 15, fontWeight: 700 }}>{i + 1}. {t.title}</span>
                {t.rating != null && <span style={{ fontSize: 13, color: '#fcd34d' }}>★ {t.rating}</span>}
              </div>
            ))}
          </div>
        </>
      )}
      <div style={{ marginTop: 'auto', paddingTop: 22, fontSize: 12, color: '#5f6b85' }}>My month on WatchVrdIQt · clearpath-pearl-chi.vercel.app</div>
    </div>
  );
}

export function CourtCardArt({ title, oneLiner, members }: { title: string; oneLiner: string; members: { name: string; score: number }[] }) {
  return (
    <div style={{ ...shell, minHeight: 420, background: 'radial-gradient(120% 100% at 50% 0%, #10233f 0%, #0b1020 62%)' }}>
      {MARK}
      <div style={{ marginTop: 24, fontSize: 12, letterSpacing: 3, color: '#7dd3fc', textTransform: 'uppercase' }}>⚖️ The Verdict</div>
      <div style={{ marginTop: 6, fontSize: 30, fontWeight: 900, lineHeight: 1.05 }}>{title}</div>
      <div style={{ marginTop: 12, fontSize: 15, color: '#c7d0e4', lineHeight: 1.35 }}>{oneLiner}</div>

      <div style={{ marginTop: 20, display: 'flex', flexWrap: 'wrap', gap: 6 }}>
        {members.map((m) => (
          <span key={m.name} style={{ fontSize: 13, padding: '5px 10px', borderRadius: 999, background: 'rgba(255,255,255,.08)' }}>{m.name} {m.score}</span>
        ))}
      </div>
      <div style={{ marginTop: 'auto', paddingTop: 22, fontSize: 12, color: '#5f6b85' }}>Settled by WatchVrdIQt · clearpath-pearl-chi.vercel.app</div>
    </div>
  );
}
