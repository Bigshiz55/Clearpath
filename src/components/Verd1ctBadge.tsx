/**
 * The VERD1CT score badge — a little pink retro TV set: rounded screen with two
 * antennas poking out the top, a big number in the middle, and a bold "V"
 * showing through behind it (so, stripped of the number, it reads as the mark).
 * The whole shape says "WatchVerd1ct". Pure presentational; `px` is the TV
 * screen size and scales it from the title-page badge to a grid chip.
 */
/**
 * The badge's REAL rendered height for a given screen size — antennas and feet
 * included. `px` is the screen, not the box, so a placeholder sized to `px`
 * is 17px short at 38 and the card grows the moment a score arrives.
 */
export function verd1ctBadgeHeight(px: number, tv = true): number {
  return (tv ? Math.round(px * 0.32) : 0) + px + (tv ? Math.round(px * 0.14) : 0);
}

/**
 * THE CANONICAL MISSING-SCORE STATE — one owner, every surface. This lived as
 * inline markup in AlgorithmScore; the moment a second surface (the Live TV
 * guide) needed the same "no score yet" rendering, copying that markup would
 * have forked the meaning. Sized to the badge's REAL height so a layout never
 * shifts when a score lands.
 */
export function Verd1ctBadgePlaceholder({
  px = 44,
  tv = true,
  className = '',
}: {
  px?: number;
  tv?: boolean;
  className?: string;
}) {
  return (
    <span
      className={`grid flex-none place-items-center rounded-[24%] bg-white/10 font-black text-slate-400 ${className}`}
      style={{ width: px, height: verd1ctBadgeHeight(px, tv), fontSize: Math.round(px * 0.5) }}
      title="No Watch Verd1ct score yet"
      aria-label="Watch Verd1ct score not available yet"
    >
      —
    </span>
  );
}

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

  // An outline drawn with layered shadows — renders identically on every browser
  // (incl. iOS Safari), unlike -webkit-text-stroke + paint-order.
  const o = Math.max(1, px * 0.045);
  const ring = (col: string) =>
    [
      `${o}px 0 0 ${col}`,
      `-${o}px 0 0 ${col}`,
      `0 ${o}px 0 ${col}`,
      `0 -${o}px 0 ${col}`,
      `${o}px ${o}px 0 ${col}`,
      `-${o}px ${o}px 0 ${col}`,
      `${o}px -${o}px 0 ${col}`,
      `-${o}px -${o}px 0 ${col}`,
    ].join(', ');
  const numberOutline = ring('#ffffff'); // white outline around the black number

  // Antennas + feet: a lighter blue with a white line around them.
  const antBlue = '#4f86ff';
  const antEdge = Math.max(1, px * 0.024);

  return (
    <span
      className={className}
      title={title ?? `Your VERD1CT: ${score} — from WatchVerd1ct`}
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
          {/* white outline behind */}
          <path d={`M${px / 2} ${antH} L${px * 0.26} ${tipY}`} stroke="#fff" strokeWidth={stroke + antEdge * 2} strokeLinecap="round" />
          <path d={`M${px / 2} ${antH} L${px * 0.74} ${tipY}`} stroke="#fff" strokeWidth={stroke + antEdge * 2} strokeLinecap="round" />
          <circle cx={px * 0.26} cy={tipY} r={tipR + antEdge} fill="#fff" />
          <circle cx={px * 0.74} cy={tipY} r={tipR + antEdge} fill="#fff" />
          {/* lighter blue on top */}
          <path d={`M${px / 2} ${antH} L${px * 0.26} ${tipY}`} stroke={antBlue} strokeWidth={stroke} strokeLinecap="round" />
          <path d={`M${px / 2} ${antH} L${px * 0.74} ${tipY}`} stroke={antBlue} strokeWidth={stroke} strokeLinecap="round" />
          <circle cx={px * 0.26} cy={tipY} r={tipR} fill={antBlue} />
          <circle cx={px * 0.74} cy={tipY} r={tipR} fill={antBlue} />
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
          {/* white outline behind */}
          <path d={`M${px * 0.34} 0 L${px * 0.27} ${footH - legStroke / 2}`} stroke="#fff" strokeWidth={legStroke + antEdge * 2} strokeLinecap="round" />
          <path d={`M${px * 0.66} 0 L${px * 0.73} ${footH - legStroke / 2}`} stroke="#fff" strokeWidth={legStroke + antEdge * 2} strokeLinecap="round" />
          {/* lighter blue on top */}
          <path d={`M${px * 0.34} 0 L${px * 0.27} ${footH - legStroke / 2}`} stroke={antBlue} strokeWidth={legStroke} strokeLinecap="round" />
          <path d={`M${px * 0.66} 0 L${px * 0.73} ${footH - legStroke / 2}`} stroke={antBlue} strokeWidth={legStroke} strokeLinecap="round" />
        </svg>
      )}

      {/* The TV screen — all-pink body with the number */}
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
          background: 'linear-gradient(150deg,#ff5ab0,#ff1493 80%)',
          boxShadow: 'inset 0 0 0 2px rgba(255,255,255,0.28), 0 8px 18px -8px rgba(255,20,147,.7)',
        }}
      >
        {/* V watermark — blue, bold, clearly visible behind the number */}
        <span
          aria-hidden
          style={{
            position: 'absolute',
            inset: 0,
            display: 'grid',
            placeItems: 'center',
            color: 'rgba(79,134,255,0.62)',
            WebkitTextStroke: `${Math.max(1, px * 0.02)}px rgba(37,71,161,0.6)`,
            fontWeight: 900,
            fontSize: px * 1.05,
            lineHeight: 1,
          }}
        >
          V
        </span>

        {/* Big black number with a solid white outline around the digits so it
            reads clearly against the pink screen. */}
        <span
          style={{
            position: 'relative',
            color: '#000000',
            fontWeight: 900,
            fontSize: Math.round(px * 0.5),
            lineHeight: 1,
            fontVariantNumeric: 'tabular-nums',
            textShadow: numberOutline,
          }}
        >
          {score}
        </span>
      </span>
    </span>
  );
}
