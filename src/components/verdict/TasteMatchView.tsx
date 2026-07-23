import { getServerI18n } from '@/i18n/server';

export interface TasteMatch {
  match: number; // 0..100
  samples: number;
  dials: { label: string; lean: string }[];
  agree: { label: string; note: string }[];
  clash: { label: string; note: string }[];
}

function tone(match: number): { text: string; ring: string; bar: string; wordKey: string } {
  if (match >= 75) return { text: 'text-emerald-300', ring: 'ring-emerald-400/40', bar: 'bg-emerald-400', wordKey: 'title.tmStrong' };
  if (match >= 58) return { text: 'text-gold-300', ring: 'ring-gold-400/40', bar: 'bg-gold-400', wordKey: 'title.tmGood' };
  if (match >= 45) return { text: 'text-slate-200', ring: 'ring-white/20', bar: 'bg-slate-300', wordKey: 'title.tmMixed' };
  return { text: 'text-red-300', ring: 'ring-red-400/40', bar: 'bg-red-400', wordKey: 'title.tmAgainst' };
}

/**
 * "Your taste match" — how this title's AI content fingerprint lines up with the
 * dimensions the user consistently likes. Interpretable and honest: it names the
 * axes that agree and clash, and only appears once we have enough rated titles.
 */
export function TasteMatchView({ tm }: { tm: TasteMatch }) {
  const { t } = getServerI18n();
  const c = tone(tm.match);
  return (
    <section className="card p-5 sm:p-6">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h2 className="flex items-center gap-2 text-lg font-bold text-white">
            <span aria-hidden>🧬</span> {t('title.tmHeading')}
          </h2>
          <p className="mt-0.5 text-xs text-slate-400">{t('title.tmSubtitle')}</p>
        </div>
        <div className={`grid h-16 w-16 flex-none place-items-center rounded-full bg-white/5 ring-2 ${c.ring}`}>
          <span className={`text-2xl font-black tabular-nums ${c.text}`}>{tm.match}</span>
        </div>
      </div>

      <div className="mt-3 h-2 w-full overflow-hidden rounded-full bg-white/10">
        <div className={`h-full rounded-full ${c.bar}`} style={{ width: `${tm.match}%` }} />
      </div>
      <div className={`mt-1 text-xs font-semibold ${c.text}`}>{t(c.wordKey)}</div>

      {(tm.agree.length > 0 || tm.clash.length > 0) && (
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          {tm.agree.length > 0 && (
            <div className="rounded-xl border border-emerald-400/25 bg-emerald-500/10 p-3">
              <div className="text-xs font-bold uppercase tracking-wide text-emerald-300">{t('title.tmMatchesYou')}</div>
              <ul className="mt-1.5 space-y-1 text-sm text-slate-200">
                {tm.agree.map((a) => (
                  <li key={a.label} className="flex gap-2"><span className="text-emerald-300">✓</span><span><span className="font-semibold">{a.label}</span> · {a.note}</span></li>
                ))}
              </ul>
            </div>
          )}
          {tm.clash.length > 0 && (
            <div className="rounded-xl border border-red-400/25 bg-red-500/10 p-3">
              <div className="text-xs font-bold uppercase tracking-wide text-red-300">{t('title.tmAgainstLean')}</div>
              <ul className="mt-1.5 space-y-1 text-sm text-slate-200">
                {tm.clash.map((a) => (
                  <li key={a.label} className="flex gap-2"><span className="text-red-300">✕</span><span><span className="font-semibold">{a.label}</span> · {a.note}</span></li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}

      {tm.dials.length > 0 && (
        <div className="mt-4">
          <div className="text-xs font-semibold uppercase tracking-wide text-slate-400">{t('title.tmYourDials')}</div>
          <div className="mt-1.5 flex flex-wrap gap-1.5">
            {tm.dials.map((d) => (
              <span key={d.label} className="rounded-full border border-white/12 bg-white/5 px-2.5 py-1 text-xs text-slate-200">
                <span className="text-slate-400">{d.label}:</span> <span className="font-semibold text-white">{d.lean}</span>
              </span>
            ))}
          </div>
        </div>
      )}

      <p className="mt-3 text-[11px] text-slate-500">{t('title.tmLearnedFrom', { n: tm.samples })}</p>
    </section>
  );
}
