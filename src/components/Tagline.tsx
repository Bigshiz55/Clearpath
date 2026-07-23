/**
 * Brand tagline with the VERD1CT glyph baked in — "verdict" is pink (the
 * wordmark colour) with the signature *spinning* 1 (the same I→1 split-flap
 * flip as the logo), while "thousands of choices" is muted so the thousands→one
 * contrast lands. Decorative styling is aria-hidden; the whole thing reads as
 * plain "Thousands of choices, one verdict" for assistive tech and search.
 * Alignment/size come from `className` (logo lockup on the left, or a centered
 * eyebrow).
 */
import { getServerI18n } from '@/i18n/server';

export function Tagline({ className = '' }: { className?: string }) {
  const { t } = getServerI18n();
  return (
    <p className={`font-bold tracking-tight ${className}`} aria-label={t('misc.tagline.aria')}>
      <span aria-hidden>
        <span className="text-slate-400">{t('misc.tagline.prefix')}</span>
        <span className="whitespace-nowrap text-white">{t('misc.tagline.one')}</span>
        <span className="inline-block whitespace-nowrap font-black text-[#ff1493]">
          VERD
          <span className="wv-iflip">
            <span className="wv-iflip-inner">
              <span className="wv-iflip-face">I</span>
              <span className="wv-iflip-face wv-iflip-back">1</span>
            </span>
          </span>
          CT
        </span>
      </span>
    </p>
  );
}
