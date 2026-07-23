'use client';

import { RobedPortrait } from '@/components/RobedPortrait';
import { useT } from '@/i18n/I18nProvider';

/**
 * The presiding judge — one fixed, brand-coloured house judge (the gold sponsor
 * look is gone). An owl in the robe: the classic symbol of a wise, impartial
 * verdict, on-brand with "we don't trick you." Bigger + warmer for the Live
 * Court moment.
 */
const ACCENT = '#ff2e9a'; // brand pink — matches the app theme, no more gold

export function JudgeBench({
  big = false,
  nowPresiding,
  judgeName,
  blurb,
  blurbEm,
}: {
  big?: boolean;
  nowPresiding?: string;
  judgeName?: string;
  blurb?: string;
  blurbEm?: string;
}) {
  // Defaults are i18n-aware so a propless `<JudgeBench big />` (e.g. in FinderUI)
  // still localizes. Callers that pass explicit props (e.g. the Together page)
  // override these. Keys live in the shared `together.bench.*` namespace.
  const t = useT();
  const nowPresidingText = nowPresiding ?? t('together.bench.nowPresiding');
  const judgeNameText = judgeName ?? t('together.bench.judgeName');
  const blurbText = blurb ?? t('together.bench.blurb');
  const blurbEmText = blurbEm ?? t('together.bench.blurbEm');
  const size = big ? 128 : 76;
  return (
    <section
      className={`relative flex items-center gap-4 overflow-hidden rounded-2xl border sm:gap-5 ${big ? 'p-5 sm:p-6' : 'p-4'}`}
      style={{ borderColor: `${ACCENT}55`, background: 'radial-gradient(130% 100% at 50% 0%, rgba(255,46,154,0.22) 0%, rgba(168,85,247,0.14) 42%, rgba(9,11,18,0.65) 100%)' }}
    >
      {/* Spotlight + faint gavel seal. */}
      <div className="pointer-events-none absolute inset-0" style={{ background: `radial-gradient(60% 74% at 30% -10%, ${ACCENT}3a 0%, ${ACCENT}12 36%, transparent 66%)` }} />
      <div className="pointer-events-none absolute right-3 top-1 leading-none" style={{ color: ACCENT, opacity: 0.1, fontSize: big ? 120 : 72 }} aria-hidden>⚖️</div>

      <div className="relative flex-none" style={{ filter: `drop-shadow(0 12px 26px ${ACCENT}55)` }}>
        <RobedPortrait emoji="🦉" size={size} accent={ACCENT} />
      </div>
      <div className="relative min-w-0">
        <div className="inline-flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-[0.18em]" style={{ color: ACCENT }}>
          ⚖️ {nowPresidingText}
        </div>
        <div className={`font-black tracking-tight text-white ${big ? 'text-2xl sm:text-3xl' : 'text-lg'}`}>{judgeNameText}</div>
        <div className={`text-slate-200 ${big ? 'mt-0.5 text-sm sm:text-base' : 'text-xs'}`}>
          {blurbText}<span className="font-semibold text-white">{blurbEmText}</span>
        </div>
      </div>
    </section>
  );
}
