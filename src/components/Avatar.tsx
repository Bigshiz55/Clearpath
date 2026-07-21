/**
 * Account avatar — an initial or emoji in a gradient disc. It wears the user's
 * status: a gold ring when they're Pro. Pure presentational.
 */
export function Avatar({
  label,
  px = 34,
  pro = false,
  title,
}: {
  label: string;
  px?: number;
  pro?: boolean;
  title?: string;
}) {
  const ringPad = Math.max(2, Math.round(px * 0.08));
  const inner = pro ? px - ringPad * 2 : px;

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
    </span>
  );
}
