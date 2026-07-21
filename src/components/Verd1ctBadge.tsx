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
  const footH = tv ? Math.round(px * 0.14) : 0; // little legs below the screen
  const total = antH + px + footH;
  const rad = Math.round(px * 0.22);
  const stroke = Math.max(1.6, px * 0.05);
  const legStroke = Math.max(2, px * 0.07);
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

      {/* Little feet under the screen */}
      {tv && (
        <svg
          aria-hidden
          width={px}
          height={footH}
          viewBox={`0 0 ${px} ${footH}`}
          fill="none"
          style={{ position: 'absolute', bottom: 0, left: 0, pointerEvents: 'none' }}
        >
          <path d={`M${px * 0.34} 0 L${px * 0.27} ${footH - legStroke / 2}`} stroke="#cbd5e1" strokeWidth={legStroke} strokeLinecap="round" />
          <path d={`M${px * 0.66} 0 L${px * 0.73} ${footH - legStroke / 2}`} stroke="#cbd5e1" strokeWidth={legStroke} strokeLinecap="round" />
        </svg>
      )}

      {/* The TV screen — the pink body with the number */}
      <span
        style={{
          position: 'absolute',
          bottom: footH,
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
        {/* V watermark — bold and clearly visible behind the number */}
        <span
          aria-hidden
          style={{
            position: 'absolute',
            inset: 0,
            display: 'grid',
            placeItems: 'center',
            color: 'rgba(255,255,255,0.5)',
            WebkitTextStroke: `${Math.max(1, px * 0.03)}px rgba(255,255,255,0.65)`,
            fontWeight: 900,
            fontSize: px * 1.05,
            lineHeight: 1,
          }}
        >
          V
        </span>

        {/* Big number — electric WatchVerdict blue with a glow + dark outline so it pops on the pink */}
        <span
          style={{
            position: 'relative',
            color: '#38bdf8',
            fontWeight: 900,
            fontSize: Math.round(px * 0.5),
            lineHeight: 1,
            fontVariantNumeric: 'tabular-nums',
            textShadow: `0 0 ${Math.max(4, px * 0.16)}px rgba(56,189,248,.95), 0 0 ${Math.max(2, px * 0.07)}px rgba(56,189,248,.8), 0 1px 2px rgba(4,10,30,.85)`,
          }}
        >
          {score}
        </span>
      </span>
    </span>
  );
}
