'use client';

import { useRef, useState } from 'react';
import { toPng } from 'html-to-image';

const MARK = (
  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
    <div style={{ width: 22, height: 22, borderRadius: 7, background: 'linear-gradient(135deg,#3b82f6,#7c5cff)' }} />
    <span style={{ fontSize: 15, fontWeight: 800, letterSpacing: 0.3 }}>
      Watch<span style={{ color: '#ff1493' }}>VERD<span style={{ color: '#ffffff' }}>1</span>CT</span>
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
        await navigator.share({ files: [file], title: 'WatchVerdict' });
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
      <div style={{ marginTop: 'auto', paddingTop: 22, fontSize: 12, color: '#5f6b85' }}>My month on WatchVerdict · clearpath-pearl-chi.vercel.app</div>
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
      <div style={{ marginTop: 'auto', paddingTop: 22, fontSize: 12, color: '#5f6b85' }}>Settled by WatchVerdict · clearpath-pearl-chi.vercel.app</div>
    </div>
  );
}

export interface DnaDial { label: string; low: string; high: string; pref: number; lean: string }

export function WatchDnaCardArt({
  title,
  blurb,
  traits,
  dials,
  finishRate,
  rated,
  dnaScore,
}: {
  title: string;
  blurb: string;
  traits: string[];
  dials: DnaDial[];
  finishRate: number | null;
  rated: number;
  dnaScore?: number;
}) {
  const tier =
    dnaScore == null ? '' : dnaScore >= 75 ? 'Elite' : dnaScore >= 50 ? 'Sharp' : dnaScore >= 25 ? 'Forming' : 'New';
  return (
    <div style={{ ...shell, width: 360, minHeight: 520, background: 'radial-gradient(130% 100% at 0% 0%, #2a1747 0%, #10233f 45%, #0b1020 75%)' }}>
      {MARK}
      <div style={{ marginTop: 24, display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 }}>
        <div style={{ minWidth: 0 }}>
          <div style={{ fontSize: 12, letterSpacing: 2, color: '#c4b5fd', textTransform: 'uppercase' }}>My Watch DNA 🧬</div>
          <div style={{ marginTop: 4, fontSize: 32, fontWeight: 900, lineHeight: 1.03 }}>{title}</div>
        </div>
        {dnaScore != null && (
          <div style={{ flex: 'none', textAlign: 'center' }}>
            <div
              style={{
                width: 62,
                height: 62,
                borderRadius: 999,
                background: 'linear-gradient(135deg,#a855f7,#ff1493)',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                boxShadow: '0 0 22px rgba(168,85,247,.45)',
              }}
            >
              <span style={{ fontSize: 24, fontWeight: 900, lineHeight: 1, color: '#fff' }}>{dnaScore}</span>
            </div>
            <div style={{ marginTop: 4, fontSize: 9.5, fontWeight: 800, letterSpacing: 0.6, color: '#c4b5fd', textTransform: 'uppercase' }}>DNA · {tier}</div>
          </div>
        )}
      </div>
      <div style={{ marginTop: 8, fontSize: 14, color: '#c7d0e4', lineHeight: 1.35 }}>{blurb}</div>

      {traits.length > 0 && (
        <div style={{ marginTop: 14, display: 'flex', flexWrap: 'wrap', gap: 6 }}>
          {traits.map((t) => (
            <span key={t} style={{ fontSize: 12, fontWeight: 700, padding: '5px 10px', borderRadius: 999, background: 'rgba(255,255,255,.10)', color: '#e8edf7' }}>{t}</span>
          ))}
        </div>
      )}

      <div style={{ marginTop: 18, display: 'flex', flexDirection: 'column', gap: 11 }}>
        {dials.map((d) => (
          <div key={d.label}>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10.5, color: '#8b95ad', marginBottom: 3 }}>
              <span>{d.low}</span>
              <span style={{ color: '#c4b5fd', fontWeight: 700 }}>{d.lean}</span>
              <span>{d.high}</span>
            </div>
            <div style={{ position: 'relative', height: 6, borderRadius: 999, background: 'rgba(255,255,255,.12)' }}>
              <span style={{ position: 'absolute', left: `${Math.max(3, Math.min(97, d.pref))}%`, top: '50%', width: 12, height: 12, marginLeft: -6, marginTop: -6, borderRadius: 999, background: 'linear-gradient(135deg,#a855f7,#3b82f6)', border: '2px solid #fff' }} />
            </div>
          </div>
        ))}
      </div>

      <div style={{ marginTop: 'auto', paddingTop: 20, display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end' }}>
        <div style={{ fontSize: 12, color: '#5f6b85' }}>
          {rated} rated{finishRate != null ? ` · ${Math.round(finishRate * 100)}% finish rate` : ''}
          <div style={{ marginTop: 2 }}>clearpath-pearl-chi.vercel.app</div>
        </div>
        <div style={{ fontSize: 12, fontWeight: 800, color: '#c4b5fd' }}>What’s yours?</div>
      </div>
    </div>
  );
}
