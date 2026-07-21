/**
 * The VERD1CT score badge — the app's pink logo tile with your number in the
 * middle. A faint "V" reads through it (so, stripped of the number, it's the
 * mark), and a small blue TV sits top-left to signal the score comes from
 * WatchVerdict (the Watch vertical). Pure presentational; `px` scales it from
 * the title-page badge down to a grid-card corner chip.
 */
export function Verd1ctBadge({
  score,
  rating,
  px = 44,
  tv = true,
  className = '',
  title,
}: {
  score: number;
  /** Optional 0–100 objective rating — fills the ring around the number (the "world's take"). */
  rating?: number | null;
  px?: number;
  tv?: boolean;
  className?: string;
  title?: string;
}) {
  const tvSize = Math.round(px * 0.36);
  const showRing = typeof rating === 'number' && Number.isFinite(rating);
  const inset = px * 0.085;
  const rectSize = px - inset * 2;
  const rr = Math.round(px * 0.19);
  const sw = Math.max(2, Math.round(px * 0.07));
  const fill = Math.max(0, Math.min(100, rating ?? 0));
  return (
    <span
      className={className}
      title={title ?? `Your VERD1CT: ${score} — from WatchVerdict`}
      style={{
        position: 'relative',
        display: 'inline-grid',
        placeItems: 'center',
        flex: 'none',
        width: px,
        height: px,
        borderRadius: '24%',
        overflow: 'hidden',
        background: 'linear-gradient(150deg,#a855f7,#ff1493 74%)',
        boxShadow: '0 6px 16px -8px rgba(255,20,147,.7)',
      }}
    >
      {/* V watermark — the mark showing through behind the number */}
      <span
        aria-hidden
        style={{
          position: 'absolute',
          inset: 0,
          display: 'grid',
          placeItems: 'center',
          color: '#fff',
          opacity: 0.15,
          fontWeight: 900,
          fontSize: px * 1.05,
          lineHeight: 1,
        }}
      >
        V
      </span>

      {/* Ring around the number = the objective rating (the world's take). */}
      {showRing && (
        <svg
          aria-hidden
          width={px}
          height={px}
          viewBox={`0 0 ${px} ${px}`}
          fill="none"
          style={{ position: 'absolute', inset: 0 }}
        >
          <rect x={inset} y={inset} width={rectSize} height={rectSize} rx={rr} pathLength={100} stroke="rgba(255,255,255,0.24)" strokeWidth={sw} />
          <rect
            x={inset}
            y={inset}
            width={rectSize}
            height={rectSize}
            rx={rr}
            pathLength={100}
            stroke="#ffffff"
            strokeWidth={sw}
            strokeLinecap="round"
            strokeDasharray={`${fill} 100`}
          />
        </svg>
      )}

      {/* Small blue TV top-left — "this V score comes from WatchVerdict" */}
      {tv && (
        <svg
          aria-hidden
          width={tvSize}
          height={tvSize}
          viewBox="0 0 24 24"
          fill="none"
          style={{ position: 'absolute', top: Math.round(px * 0.06), left: Math.round(px * 0.08) }}
        >
          <path d="M12 9 L8.5 5.2 M12 9 L15.5 5.2" stroke="#ffffff" strokeWidth="1.6" strokeLinecap="round" opacity="0.95" />
          <rect x="3.4" y="9" width="17.2" height="11.6" rx="3" fill="#38bdf8" stroke="#ffffff" strokeWidth="1.4" />
          <circle cx="16.6" cy="14.8" r="1.3" fill="#ffffff" />
        </svg>
      )}

      <span
        style={{
          position: 'relative',
          color: '#fff',
          fontWeight: 800,
          fontSize: Math.round(px * 0.4),
          lineHeight: 1,
          fontVariantNumeric: 'tabular-nums',
          textShadow: '0 1px 2px rgba(70,0,40,.4)',
        }}
      >
        {score}
      </span>
    </span>
  );
}
