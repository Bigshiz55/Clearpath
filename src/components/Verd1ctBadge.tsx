/**
 * The VERD1CT score badge — the app's pink logo tile with your number in the
 * middle. A faint "V" reads through it (so, stripped of the number, it's the
 * mark), and a small blue TV sits top-left to signal the score comes from
 * WatchVerdict (the Watch vertical). Pure presentational; `px` scales it from
 * the title-page badge down to a grid-card corner chip.
 */
export function Verd1ctBadge({
  score,
  px = 44,
  tv = true,
  className = '',
  title,
}: {
  score: number;
  px?: number;
  tv?: boolean;
  className?: string;
  title?: string;
}) {
  const tvSize = Math.round(px * 0.36);
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
