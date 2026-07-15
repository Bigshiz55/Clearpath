/** A judge portrait wearing a black robe with a white collar — the face (a dog
 *  photo or a sponsor emoji) sits in a ring above the robe. */
export function RobedPortrait({
  src,
  emoji,
  size,
  accent = '#f5c65a',
}: {
  src?: string;
  emoji?: string | null;
  size: number;
  accent?: string;
}) {
  const robeW = Math.round(size * 1.75);
  return (
    <div className="relative flex-none" style={{ width: size, height: Math.round(size * 1.4) }}>
      {/* Robe (behind the face) */}
      <svg
        viewBox="0 0 100 64"
        aria-hidden
        style={{ position: 'absolute', left: '50%', bottom: 0, width: robeW, transform: 'translateX(-50%)', zIndex: 0 }}
      >
        <path d="M1,64 C6,30 30,23 50,23 C70,23 94,30 99,64 Z" fill="#0a0a0d" />
        <path d="M50,23 L39,52 L50,47 L61,52 Z" fill="#181820" />
        <rect x="46" y="27" width="3.1" height="22" rx="1.5" fill="#eef0f3" />
        <rect x="50.9" y="27" width="3.1" height="22" rx="1.5" fill="#eef0f3" />
      </svg>
      {/* Face */}
      <div
        className="absolute left-1/2 top-0 -translate-x-1/2 overflow-hidden rounded-full shadow-lg"
        style={{
          width: size,
          height: size,
          zIndex: 1,
          border: `2px solid ${accent}88`,
          background: emoji ? `radial-gradient(circle at 50% 35%, ${accent}44, ${accent}18)` : '#0b0e17',
        }}
      >
        {emoji ? (
          <div className="grid h-full w-full place-items-center" style={{ fontSize: Math.round(size * 0.5) }} aria-hidden>
            {emoji}
          </div>
        ) : src ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={src} alt="The presiding judge" className="h-full w-full object-cover" />
        ) : null}
      </div>
    </div>
  );
}
