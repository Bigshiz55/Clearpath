import { ImageResponse } from 'next/og';
import { getPublicShare } from '@/lib/share';

export const dynamic = 'force-dynamic';
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';
export const alt = 'WatchVerdict';

export default async function Image({ params }: { params: { token: string } }) {
  const snap = await getPublicShare(params.token);
  const title = snap?.title ?? 'WatchVerdict';
  const year = snap?.year ? ` (${snap.year})` : '';
  const tier = snap?.tier ?? 'Should you watch it?';
  const score = snap?.generalScore ?? null;

  return new ImageResponse(
    (
      <div
        style={{
          height: '100%',
          width: '100%',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'space-between',
          background: 'linear-gradient(135deg, #07090f 0%, #141a2b 60%, #1a41b4 140%)',
          padding: 72,
          color: 'white',
          fontFamily: 'sans-serif',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 18, fontSize: 34, fontWeight: 700 }}>
          <div
            style={{
              width: 52,
              height: 52,
              borderRadius: 14,
              background: 'linear-gradient(135deg,#4f86ff,#1f52e6)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <svg width={32} height={32} viewBox="0 0 24 24" fill="none">
              <path d="M4 12.5l5 5L20 6.5" stroke="#ffffff" strokeWidth={3.2} strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </div>
          <span style={{ display: 'flex' }}>
            <span>Watch</span>
            <span style={{ color: '#ff1493' }}>V</span>
            <span style={{ color: '#ffffff' }}>Y</span>
            <span style={{ color: '#ff1493' }}>rdict</span>
          </span>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div style={{ fontSize: 30, color: '#94a3b8' }}>Verdict</div>
          <div style={{ fontSize: 68, fontWeight: 800, lineHeight: 1.05, maxWidth: 980 }}>
            {title}
            {year}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 24, marginTop: 12 }}>
            <div
              style={{
                fontSize: 34,
                fontWeight: 700,
                padding: '12px 28px',
                borderRadius: 999,
                background: 'rgba(79,134,255,0.2)',
                border: '2px solid rgba(122,168,255,0.5)',
              }}
            >
              {tier}
            </div>
            {score != null && (
              <div style={{ fontSize: 34, color: '#e2e8f0' }}>Score {score}/100</div>
            )}
          </div>
        </div>

        <div style={{ fontSize: 26, color: '#64748b' }}>Personalized movie & TV verdicts</div>
      </div>
    ),
    size,
  );
}
