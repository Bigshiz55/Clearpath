import type { EnglishAudioStatus } from '@/lib/lang/audioAvailability';
import { AUDIO_STATUS_LABEL } from '@/lib/lang/audioAvailability';
import { originLine, isForeignOriginal } from '@/lib/lang/international';

/**
 * Visible English-audio status on a recommendation card (mobile + desktop). One of
 * the five user-facing statuses is always shown, plus the origin line. Status is
 * conveyed by icon + text (never color alone).
 */
const STYLE: Record<EnglishAudioStatus, { icon: string; cls: string }> = {
  VERIFIED_ENGLISH_AUDIO: { icon: '✅', cls: 'border-emerald-400/50 bg-emerald-500/15 text-emerald-100' },
  LIKELY_ENGLISH_AUDIO: { icon: '≈', cls: 'border-amber-400/50 bg-amber-500/15 text-amber-100' },
  ENGLISH_SUBTITLES_ONLY: { icon: '💬', cls: 'border-white/15 bg-white/5 text-slate-200' },
  NO_ENGLISH_AUDIO: { icon: '⛔', cls: 'border-white/15 bg-white/5 text-slate-300' },
  UNKNOWN: { icon: '？', cls: 'border-white/15 bg-white/5 text-slate-300' },
  CONFLICTING_DATA: { icon: '？', cls: 'border-white/15 bg-white/5 text-slate-300' },
};

export function AudioStatusBadge({
  status, originalLanguage, provider, region, verifiedAt, unverified = false,
}: {
  status: EnglishAudioStatus;
  originalLanguage?: string | null;
  provider?: string | null;
  region?: string | null;
  verifiedAt?: string | null;
  /** Rendered inside the "possible matches" section (adds the disclaimer line). */
  unverified?: boolean;
}) {
  const s = STYLE[status];
  const foreign = isForeignOriginal(originalLanguage ?? null);
  return (
    <div className="mt-1 min-w-0">
      {foreign && (
        <p className="text-[11px] font-bold uppercase tracking-wide text-sky-300">Originally in {displayLang(originalLanguage)}</p>
      )}
      <span data-testid="audio-status" data-status={status} className={`mt-0.5 inline-flex max-w-full items-center gap-1 rounded-md border px-1.5 py-0.5 text-[11px] font-bold ${s.cls}`}>
        <span aria-hidden>{s.icon}</span>
        <span className="truncate">{AUDIO_STATUS_LABEL[status]}</span>
      </span>
      {status === 'VERIFIED_ENGLISH_AUDIO' && provider && (
        <p className="mt-0.5 text-[10px] text-slate-400">
          Verified on {provider}{region ? ` · checked for ${regionName(region)}` : ''}{verifiedAt ? ` · ${verifiedAt}` : ''}
        </p>
      )}
      {unverified && provider && (
        <p className="mt-0.5 text-[10px] text-slate-500">English audio not verified for {provider} — shown only as a possible match</p>
      )}
    </div>
  );
}

function displayLang(l: string | null | undefined): string {
  if (!l) return 'another language';
  return l.length <= 3 ? (safe(() => new Intl.DisplayNames(['en'], { type: 'language' }).of(l)) ?? l) : l;
}
function regionName(code: string): string {
  return safe(() => new Intl.DisplayNames(['en'], { type: 'region' }).of(code.toUpperCase())) ?? code;
}
function safe<T>(f: () => T): T | null { try { return f(); } catch { return null; } }

/** Convenience: derive the plain "Originally in X — English audio available" line. */
export function audioOriginLine(originalLanguage: string | null, status: EnglishAudioStatus): string {
  return originLine(originalLanguage, status === 'VERIFIED_ENGLISH_AUDIO' || status === 'LIKELY_ENGLISH_AUDIO');
}
