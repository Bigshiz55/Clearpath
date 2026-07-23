'use client';

import { useEffect, useState } from 'react';
import type { MediaType } from '@/lib/types';
import { loadDna, isPersonalized, type DnaClientResult } from '@/lib/dnaClient';
import { scoreVerdict } from '@/lib/verdictVisual';
import { Verd1ctBadge } from './Verd1ctBadge';
import { CardRatings } from './CardRatings';
import { useT } from '@/i18n/I18nProvider';

/**
 * The one pink "verdict" box on every card. It folds the user's DNA together
 * with every rating (RT, audience, IMDb) into a single 0–100 score and a plain
 * "will you like it?" call, followed by one short, honest reason and the source
 * ratings beneath. Kept deliberately calm: pink is the only brand colour here,
 * the call carries the one semantic accent, everything else is muted.
 */
export function AlgorithmScore({
  mediaType,
  tmdbId,
  title,
  year,
  objectiveScore = null,
  className = '',
}: {
  mediaType: MediaType;
  tmdbId: number;
  title: string;
  year?: number | null;
  objectiveScore?: number | null;
  className?: string;
}) {
  const t = useT();
  const [dna, setDna] = useState<DnaClientResult | null>(null);

  useEffect(() => {
    let active = true;
    loadDna(mediaType, tmdbId).then((d) => active && setDna(d));
    return () => {
      active = false;
    };
  }, [mediaType, tmdbId]);

  const personal = isPersonalized(dna);
  const score = personal ? dna!.score : dna?.score ?? objectiveScore;
  const v = score != null ? scoreVerdict(score) : null;

  // One short, honest "why" — derived only from signals we actually have, never
  // invented. Personalized cards say so (and how settled the read is); guests /
  // unrated titles get the honest objective descriptor. No per-title claim is
  // made that the grid payload can't back up.
  const whyKey =
    score == null
      ? null
      : personal
        ? dna!.confidence >= 0.6
          ? 'strongTaste'
          : dna!.confidence < 0.35
            ? 'learning'
            : 'yourTaste'
        : 'blend';

  return (
    <div
      className={`rounded-xl border border-pink-400/40 bg-gradient-to-br from-pink-500/20 to-rose-500/10 px-2.5 py-2.5 shadow-[0_4px_16px_-8px_rgba(244,63,94,0.55)] ${className}`}
      title={t('title.algoTip')}
    >
      {/* Row 1 — the score badge beside the one call (Stream It / Maybe / …).
          The call may wrap to a second line on the narrowest cards rather than
          clip, so a long localized label ("STREAM IT" / "SÁLTALA") stays whole. */}
      <div className="flex items-center gap-2.5">
        {score != null ? (
          <Verd1ctBadge score={score} px={44} />
        ) : (
          <span aria-hidden className="grid h-11 w-11 flex-none place-items-center rounded-[24%] bg-white/10 text-xl font-black text-slate-400">—</span>
        )}
        <div className="min-w-0 flex-1">
          {v && (
            <span className={`inline-flex items-center rounded-md px-2 py-0.5 text-xs font-black uppercase leading-tight tracking-tight ${v.visual.badge}`}>
              {t(`verdict.call.${v.visual.key}`)}
            </span>
          )}
        </div>
      </div>

      {/* Row 2 — one short reason on its own full-width line, replacing the old
          "YOUR VERD1CT" label. 🧬 (not colour) flags a personalized read for a11y. */}
      {whyKey && (
        <div className="mt-1.5 line-clamp-1 text-[11px] font-semibold leading-snug text-pink-50/85">
          {whyKey !== 'blend' && <span aria-hidden className="mr-0.5">🧬</span>}
          {t(`card.why.${whyKey}`)}
        </div>
      )}

      {/* Row 3 — the source ratings that feed the score. */}
      <CardRatings mediaType={mediaType} tmdbId={tmdbId} title={title} year={year} hideCall className="mt-2" />
    </div>
  );
}
