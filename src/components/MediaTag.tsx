'use client';

import type { MediaType } from '@/lib/types';
import { useT } from '@/i18n/I18nProvider';

/**
 * The small "Movie"/"TV" media-type chip on cards. A client component so it can
 * translate via the i18n context — PosterCard is rendered in both server and
 * client trees, so the label can't come from a server-only helper. `movie`/`tv`
 * remain language-neutral enum values in data; only the display label is localized.
 */
export function MediaTag({ mediaType }: { mediaType: MediaType }) {
  const t = useT();
  return (
    <span className="flex-none rounded bg-white/10 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-slate-300">
      {mediaType === 'movie' ? t('card.movie') : t('card.tv')}
    </span>
  );
}
