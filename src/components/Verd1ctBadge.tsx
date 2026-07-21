/**
 * The VERD1CT score badge — a little pink retro TV set: rounded screen with two
 * antennas poking out the top, a big number in the middle, and a bold "V"
 * showing through behind it (so, stripped of the number, it reads as the mark).
 * The whole shape says "WatchVerdict". Pure presentational; `px` is the TV
 * screen size and scales it from the title-page badge to a grid chip.
 */
export function Verd1ctBadge({
  score,
  px = 44,
  tv = true,
  className = '',
  title,
}: {
  score: number;
  /** Draw the antennas (the "TV" cue). */
  tv?: boolean;
  px?: number;
  className?: string;
  title?: string;
}) {
  const antH = tv ? Math.round(px * 0.32) : 0; // antenna zone above the screen
  const total = px + antH;
  const rad = Math.round(px * 0.22);
  const stroke = Math.max(1.6, px * 0.05);
  const tipR = Math.max(1.8, px * 0.06);
  const tipY = Math.max(antH * 0.16, tipR + 1);

  return (
    <span
      className={className}
      title={title ?? `Your VERD1CT: ${score} — from WatchVerdict`}
      style={{ position: 'relative', display: 'inline-block', width: px, height: total, flex: 'none', verticalAlign: 'middle' }}
    >
      {/* Antennas rising from the top-center of the screen */}
      {tv && (
        <svg
          aria-hidden
          width={px}
          height={antH}
          viewBox={`0 0 ${px} ${antH}`}
          fill="none"
          style={{ position: 'absolute', top: 0, left: 0, pointerEvents: 'none' }}
        >
          <path d={`M${px / 2} ${antH} L${px * 0.26} ${tipY}`} stroke="#cbd5e1" strokeWidth={stroke} strokeLinecap="round" />
          <path d={`M${px / 2} ${antH} L${px * 0.74} ${tipY}`} stroke="#cbd5e1" strokeWidth={stroke} strokeLinecap="round" />
          <circle cx={px * 0.26} cy={tipY} r={tipR} fill="#e2e8f0" />
          <circle cx={px * 0.74} cy={tipY} r={tipR} fill="#e2e8f0" />
        </svg>
      )}

      {/* The TV screen — the pink body with the number */}
      <span
        style={{
          position: 'absolute',
          bottom: 0,
          left: 0,
          width: px,
          height: px,
          borderRadius: rad,
          overflow: 'hidden',
          display: 'grid',
          placeItems: 'center',
          background: 'linear-gradient(150deg,#a855f7,#ff1493 74%)',
          boxShadow: 'inset 0 0 0 2px rgba(255,255,255,0.28), 0 6px 16px -8px rgba(255,20,147,.7)',
        }}
      >
        {/* V watermark — more visible now */}
        <span
          aria-hidden
          style={{
            position: 'absolute',
            inset: 0,
            display: 'grid',
            placeItems: 'center',
            color: '#fff',
            opacity: 0.34,
            fontWeight: 900,
            fontSize: px * 1.02,
            lineHeight: 1,
          }}
        >
          V
        </span>

        {/* Big number */}
        <span
          style={{
            position: 'relative',
            color: '#fff',
            fontWeight: 800,
            fontSize: Math.round(px * 0.5),
            lineHeight: 1,
            fontVariantNumeric: 'tabular-nums',
            textShadow: '0 1px 3px rgba(70,0,40,.5)',
          }}
        >
          {score}
        </span>
      </span>
    </span>
  );
}
