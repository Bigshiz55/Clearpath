import { ImageResponse } from 'next/og';

/**
 * Renders the WatchVerdict "shield check" mark as a PNG at the given size.
 * Uses a drawn SVG checkmark (no text glyphs) so no dynamic font download is
 * ever required at render time.
 */
export function renderIcon(size: number, padding = 0.16) {
  const pad = Math.round(size * padding);
  const inner = size - pad * 2;
  const check = Math.round(inner * 0.62);
  return new ImageResponse(
    (
      <div
        style={{
          width: size,
          height: size,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: '#0b0e17',
        }}
      >
        <div
          style={{
            width: inner,
            height: inner,
            borderRadius: Math.round(inner * 0.24),
            background: 'linear-gradient(135deg,#4f86ff,#1f52e6)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <svg width={check} height={check} viewBox="0 0 24 24" fill="none">
            <path
              d="M4 12.5l5 5L20 6.5"
              stroke="#ffffff"
              strokeWidth={3.2}
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </div>
      </div>
    ),
    { width: size, height: size },
  );
}
