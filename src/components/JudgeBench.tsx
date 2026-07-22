import { RobedPortrait } from '@/components/RobedPortrait';

/**
 * The presiding judge — one fixed, cool house judge. (The old judge *picker*
 * — Annie / Waffles / local sponsor — was removed; nobody was choosing.) An owl
 * in the robe: the classic symbol of a wise, impartial verdict, on-brand with
 * "we earn your subscription, we don't trick you."
 */
const JUDGE = {
  emoji: '🦉',
  name: 'Judge Verity',
  tagline: 'Presides over every verdict — no bias, no tricks.',
  accent: '#f5c65a',
};

export function JudgeBench({ big = false }: { big?: boolean }) {
  const size = big ? 104 : 70;
  return (
    <section
      className="relative flex items-center gap-4 overflow-hidden rounded-2xl border p-4"
      style={{ borderColor: `${JUDGE.accent}44`, background: 'radial-gradient(120% 90% at 50% 4%, #2a1f10 0%, #1a1206 45%, #0a0703 100%)' }}
    >
      {/* Spotlight beam + faint seal — the lit courtroom feel. */}
      <div className="pointer-events-none absolute inset-0" style={{ background: `radial-gradient(60% 72% at 50% -8%, ${JUDGE.accent}33 0%, ${JUDGE.accent}10 34%, transparent 66%)` }} />
      <div className="pointer-events-none absolute right-3 top-1 leading-none" style={{ color: JUDGE.accent, opacity: 0.08, fontSize: big ? 96 : 68 }} aria-hidden>⚖️</div>

      <div className="relative flex-none" style={{ filter: `drop-shadow(0 8px 22px ${JUDGE.accent}44)` }}>
        <RobedPortrait emoji={JUDGE.emoji} size={size} accent={JUDGE.accent} />
      </div>
      <div className="relative min-w-0">
        <div className="inline-flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-[0.16em]" style={{ color: JUDGE.accent }}>
          ⚖️ Now presiding
        </div>
        <div className={`font-black tracking-tight text-white ${big ? 'text-xl sm:text-2xl' : 'text-lg'}`}>{JUDGE.name}</div>
        <div className={`text-slate-300 ${big ? 'text-sm' : 'text-xs'}`}>{JUDGE.tagline}</div>
      </div>
    </section>
  );
}
