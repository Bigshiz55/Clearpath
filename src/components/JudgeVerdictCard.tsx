import Link from 'next/link';
import { RatingsStrip } from '@/components/RatingsStrip';
import { SaveButton } from '@/components/SaveButton';
import { verdictVisualForCall } from '@/lib/verdictVisual';
import { EMPTY_TILE_RATINGS } from '@/lib/ratings';
import type { TitleVerdict } from '@/lib/askTypes';

const ENGLISH: Record<TitleVerdict['english'], { icon: string; text: string; warn: boolean }> = {
  native: { icon: '🔊', text: 'English (original language)', warn: false },
  available: { icon: '🔊', text: 'English audio available', warn: false },
  subtitles: { icon: '💬', text: 'Subtitles only — no English audio', warn: true },
  unknown: { icon: '❔', text: 'Language availability unknown', warn: false },
};

/** A named title "on trial" — the full ruling with every parameter that fired. */
export function JudgeVerdictCard({ v }: { v: TitleVerdict }) {
  const vis = verdictVisualForCall(v.primaryCall);
  const eng = ENGLISH[v.english];

  return (
    <div className={`rounded-2xl border bg-black/20 p-3 ${vis.border}`}>
      <div className="flex gap-3">
        <Link href={`/app/title/${v.mediaType}/${v.id}`} className="h-32 w-[86px] flex-none overflow-hidden rounded-lg border border-white/10">
          {v.posterUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={v.posterUrl} alt="" className="h-full w-full object-cover" />
          ) : (
            <div className="grid h-full w-full place-items-center bg-white/5 p-1 text-center text-[10px] text-slate-400">{v.title}</div>
          )}
        </Link>
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-2">
            <Link href={`/app/title/${v.mediaType}/${v.id}`} className="font-bold text-white hover:underline">
              {v.title} {v.year ? <span className="font-normal text-slate-400">({v.year})</span> : null}
            </Link>
            <SaveButton tmdbId={v.id} mediaType={v.mediaType} title={v.title} year={v.year} posterPath={v.posterPath} variant="inline" />
          </div>
          <div className="mt-1.5 flex flex-wrap items-center gap-2">
            <span className={`rounded-md border px-2 py-0.5 text-xs font-black ${vis.badge}`}>{v.primaryCall}</span>
            <span className="text-lg font-black tabular-nums text-gold-400">{v.matchScore}</span>
            <span className="text-[11px] text-slate-500">{v.scoredFor.split(' ')[0]} match · {v.generalScore} Standard</span>
          </div>
          <p className="mt-1.5 text-sm text-slate-200">{v.oneLiner}</p>
          <div className={`mt-1.5 inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-[11px] ${eng.warn ? 'bg-red-500/15 text-red-200' : 'bg-white/5 text-slate-300'}`}>
            {eng.icon} {eng.text}
          </div>
        </div>
      </div>

      {/* Why — every parameter that moved your score */}
      {v.keyFactors.length > 0 && (
        <div className="mt-3">
          <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-400">Why, for you</div>
          <div className="mt-1.5 space-y-1">
            {v.keyFactors.map((f, i) => (
              <div key={i} className="flex items-start gap-2 text-xs">
                <span className={`w-9 flex-none text-right font-bold tabular-nums ${f.points > 0 ? 'text-emerald-300' : 'text-red-300'}`}>
                  {f.points > 0 ? '+' : ''}{f.points}
                </span>
                <span className="text-slate-300">
                  <span className="font-semibold text-white">{f.label}</span>
                  {f.defining ? <span className="ml-1 rounded bg-red-500/15 px-1 text-[10px] text-red-200">hard rule</span> : null}
                  {f.reason ? ` — ${f.reason}` : ''}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {(v.reasonsFor.length > 0 || v.reasonsAgainst.length > 0) && (
        <div className="mt-3 grid gap-2 sm:grid-cols-2">
          {v.reasonsFor.length > 0 && (
            <div>
              <div className="text-[11px] font-semibold text-emerald-300">In its favor</div>
              <ul className="mt-1 space-y-0.5 text-xs text-slate-300">
                {v.reasonsFor.slice(0, 4).map((r, i) => <li key={i}>✓ {r}</li>)}
              </ul>
            </div>
          )}
          {v.reasonsAgainst.length > 0 && (
            <div>
              <div className="text-[11px] font-semibold text-red-300">Against it</div>
              <ul className="mt-1 space-y-0.5 text-xs text-slate-300">
                {v.reasonsAgainst.slice(0, 4).map((r, i) => <li key={i}>✕ {r}</li>)}
              </ul>
            </div>
          )}
        </div>
      )}

      <div className="mt-3">
        <RatingsStrip ratings={v.ratings ?? EMPTY_TILE_RATINGS} title={v.title} year={v.year} decider={false} />
        <div className="mt-1.5 flex flex-wrap gap-1">
          {v.where && <span className="rounded-md border border-white/10 bg-white/5 px-2 py-0.5 text-[10px] text-slate-300">📺 {v.where}</span>}
          <a href={v.deciderUrl} target="_blank" rel="noopener noreferrer" className="rounded-md border border-white/10 bg-white/5 px-2 py-0.5 text-[10px] text-brand-300 hover:bg-white/10">
            Decider ↗
          </a>
        </div>
      </div>
    </div>
  );
}
