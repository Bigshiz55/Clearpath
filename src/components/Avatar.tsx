/**
 * Account avatar — an initial or emoji in a gradient disc. It wears the user's
 * status: a gold ring when they're Pro, and a small pink ribbon when they've
 * given (via the membership pledge). Pure presentational.
 */
export function Avatar({
  label,
  px = 34,
  pro = false,
  donor = false,
  title,
}: {
  label: string;
  px?: number;
  pro?: boolean;
  donor?: boolean;
  title?: string;
}) {
  const ringPad = Math.max(2, Math.round(px * 0.08));
  const inner = pro ? px - ringPad * 2 : px;
  const ribbon = Math.round(px * 0.42);

  const disc = (
    <span
      style={{
        width: inner,
        height: inner,
        borderRadius: 999,
        display: 'grid',
        placeItems: 'center',
        background: 'linear-gradient(150deg,#ff9ec6,#a855f7 60%,#3b82f6)',
        color: '#fff',
        fontWeight: 800,
        fontSize: Math.round(inner * 0.42),
        lineHeight: 1,
        border: pro ? '2px solid #0b1020' : undefined,
        overflow: 'hidden',
      }}
    >
      {label}
    </span>
  );

  return (
    <span style={{ position: 'relative', display: 'inline-flex', width: px, height: px }} title={title}>
      {pro ? (
        <span
          style={{
            padding: ringPad,
            borderRadius: 999,
            display: 'inline-flex',
            background: 'conic-gradient(from 140deg,#fbbf24,#f59e0b,#ff1493,#fbbf24)',
          }}
        >
          {disc}
        </span>
      ) : (
        disc
      )}
      {donor && (
        <span
          aria-hidden
          style={{
            position: 'absolute',
            bottom: -2,
            right: -2,
            width: ribbon,
            height: ribbon,
            borderRadius: 999,
            background: '#ff1493',
            border: '2px solid #0b1020',
            display: 'grid',
            placeItems: 'center',
            boxShadow: '0 2px 6px -1px rgba(255,20,147,.6)',
          }}
        >
          <svg viewBox="0 0 24 24" fill="none" style={{ width: ribbon * 0.62, height: ribbon * 0.62, color: '#fff' }}>
            <path d="M14 3.5C18.5 7.5 16.5 12.5 11 21" stroke="currentColor" strokeWidth={3.2} strokeLinecap="round" />
            <path d="M10 3.5C5.5 7.5 7.5 12.5 13 21" stroke="currentColor" strokeWidth={3.2} strokeLinecap="round" />
          </svg>
        </span>
      )}
    </span>
  );
}
