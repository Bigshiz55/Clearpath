/**
 * The "algorithm scored this for you" mark — a brain (the algorithm doing the
 * thinking) beside a gavel (the judge). It signals that the personal match
 * number is *calculated for your taste*, not a critic or crowd score. Used
 * anywhere a personal match/score is shown, so the source is always clear.
 */
import { useT } from '@/i18n/I18nProvider';


export const MATCH_TOOLTIP =
  'Your personal match — the algorithm scores this title against your taste, separate from critics and the crowd.';

export function MatchMark({
  className = '',
  title,
  size = 'text-base',
}: {
  className?: string;
  title?: string;
  size?: string;
}) {
  const t = useT();
  return (
    <span
      title={title ?? t('title.matchTooltip')}
      aria-label={t('title.matchAria')}
      className={`inline-flex items-center gap-0.5 leading-none ${size} ${className}`}
    >
      <span aria-hidden>🧠</span>
      <span aria-hidden>⚖️</span>
    </span>
  );
}
