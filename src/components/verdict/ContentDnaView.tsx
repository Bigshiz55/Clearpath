import type { ContentDna } from '@/lib/contentDna';
import { getServerI18n } from '@/i18n/server';

/** Bar color leans by what the dimension means (higher isn't always "good"). */
function tone(key: string, value: number): string {
  if (key === 'ending' || key === 'another_season') {
    return value >= 66 ? 'from-emerald-500 to-emerald-300' : value >= 40 ? 'from-yellow-500 to-yellow-300' : 'from-red-500 to-red-300';
  }
  // pacing / element: high = more of that trait, tinted brand-neutral
  return 'from-brand-500 to-brand-300';
}

export function ContentDnaView({ dna }: { dna: ContentDna }) {
  const { t, plural } = getServerI18n();
  return (
    <section className="card p-5 sm:p-6">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-lg font-semibold text-white">🧬 {t('title.extras.contentDnaHeading')}</h2>
        <span className="text-xs text-slate-500">{plural('title.extras.contentDnaFrom', dna.responses, {})}</span>
      </div>
      <p className="mt-1 text-xs text-slate-500">
        {t('title.extras.contentDnaNote')}
      </p>

      <div className="mt-4 space-y-3">
        {dna.dimensions.map((d) => (
          <div key={d.key}>
            <div className="mb-1 flex items-center justify-between text-xs">
              <span className="font-medium text-slate-200">{d.label}</span>
              <span className="tabular-nums text-slate-400">{d.value}</span>
            </div>
            <div className="h-2 overflow-hidden rounded-full bg-white/5">
              <div className={`h-full rounded-full bg-gradient-to-r ${tone(d.key, d.value)}`} style={{ width: `${d.value}%` }} />
            </div>
            <div className="mt-0.5 text-[11px] text-slate-500">{d.caption}</div>
          </div>
        ))}
      </div>
    </section>
  );
}
