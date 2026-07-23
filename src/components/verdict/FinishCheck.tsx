import type { RiskAssessment } from '@/lib/finish';
import { getServerI18n } from '@/i18n/server';

const STYLE: Record<Exclude<RiskAssessment['level'], 'unknown'>, { ring: string; text: string; icon: string }> = {
  low: { ring: 'border-emerald-400/40 bg-emerald-500/10', text: 'text-emerald-200', icon: '✅' },
  medium: { ring: 'border-amber-400/30 bg-amber-500/10', text: 'text-amber-200', icon: '⚠️' },
  high: { ring: 'border-red-400/30 bg-red-500/10', text: 'text-red-200', icon: '🚪' },
};

export function FinishCheck({ assessment }: { assessment: RiskAssessment }) {
  const { t } = getServerI18n();
  if (assessment.level === 'unknown') return null;
  const s = STYLE[assessment.level];

  return (
    <section className={`card p-5 ${s.ring}`}>
      <div className="flex items-start gap-3">
        <span className="text-2xl" aria-hidden>{s.icon}</span>
        <div className="min-w-0">
          <h2 className={`text-base font-bold ${s.text}`}>{assessment.headline}</h2>
          <p className="mt-1 text-sm text-slate-200">{assessment.note}</p>
          {assessment.factors.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-1.5">
              {assessment.factors.map((f) => (
                <span key={f} className="rounded-md border border-white/10 bg-white/5 px-2 py-0.5 text-xs text-slate-300">
                  {f}
                </span>
              ))}
            </div>
          )}
          <p className="mt-2 text-[11px] text-slate-500">
            {t('title.extras.finishCheckNote')}
          </p>
        </div>
      </div>
    </section>
  );
}
