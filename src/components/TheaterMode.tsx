'use client';

import { useEffect, useRef, useState } from 'react';
import { addToWatchlist } from '@/lib/actions/watchlist';
import { useT } from '@/i18n/I18nProvider';

const LS_SHORTCUT = 'wv_theater_shortcut';
const LS_MSG = 'wv_theater_msg';

function fmt(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${m}:${s.toString().padStart(2, '0')}`;
}

export function TheaterMode({
  tmdbId,
  mediaType,
  title,
  year,
  posterPath,
  runtimeMinutes,
}: {
  tmdbId: number;
  mediaType: 'movie' | 'tv';
  title: string;
  year: number | null;
  posterPath: string | null;
  runtimeMinutes: number | null;
}) {
  const t = useT();
  const defaultMsg = t('together.defaultMsg');
  const mins = runtimeMinutes && runtimeMinutes > 0 ? runtimeMinutes : 120;
  const [showConfig, setShowConfig] = useState(false);
  const [shortcut, setShortcut] = useState('');
  const [msg, setMsg] = useState(defaultMsg);
  const [running, setRunning] = useState(false);
  const [remaining, setRemaining] = useState(mins * 60);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    setShortcut(localStorage.getItem(LS_SHORTCUT) ?? '');
    setMsg(localStorage.getItem(LS_MSG) ?? defaultMsg);
    // Mount-only initializer: seed from localStorage once; do not re-run on
    // locale-driven defaultMsg changes (would clobber an in-progress edit).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    return () => {
      if (timer.current) clearInterval(timer.current);
    };
  }, []);

  function saveConfig() {
    localStorage.setItem(LS_SHORTCUT, shortcut.trim());
    localStorage.setItem(LS_MSG, msg.trim() || defaultMsg);
    setShowConfig(false);
  }

  function startCountdown() {
    setRemaining(mins * 60);
    setRunning(true);
    if (timer.current) clearInterval(timer.current);
    timer.current = setInterval(() => {
      setRemaining((r) => {
        if (r <= 1) {
          if (timer.current) clearInterval(timer.current);
          return 0;
        }
        return r - 1;
      });
    }, 1000);
  }

  function stop() {
    if (timer.current) clearInterval(timer.current);
    setRunning(false);
    setRemaining(mins * 60);
  }

  async function start() {
    startCountdown();
    // Best-effort: mark it as what we're watching now.
    addToWatchlist({ tmdbId, mediaType, title, year, posterPath, status: 'watching' }).catch(() => {});

    const text = (localStorage.getItem(LS_MSG) ?? msg)
      .replace('{title}', `${title}${year ? ` (${year})` : ''}`)
      .replace('{mins}', String(mins));

    // 1) Tell the group chat the theater's closed (native share sheet).
    try {
      if (navigator.share) await navigator.share({ text });
    } catch {
      /* cancelled — fine */
    }
    // 2) Fire the user's Apple Shortcut (lights / Do Not Disturb / etc.).
    const name = localStorage.getItem(LS_SHORTCUT) ?? shortcut;
    if (name && name.trim()) {
      window.location.href = `shortcuts://run-shortcut?name=${encodeURIComponent(name.trim())}`;
    }
  }

  if (running) {
    return (
      <div className="card flex items-center justify-between gap-4 border-brand-400/40 bg-brand-500/10 p-4">
        <div>
          <div className="text-xs uppercase tracking-wide text-brand-200">🎬 {t('together.theaterNowPlaying')}</div>
          <div className="mt-1 text-lg font-bold text-white">{title}</div>
          <div className="text-sm text-slate-300">
            {remaining > 0 ? <>{t('together.timeLeft', { time: fmt(remaining) })}</> : t('together.runtimeUp')}
          </div>
        </div>
        <button onClick={stop} className="btn-secondary">{t('together.endBtn')}</button>
      </div>
    );
  }

  return (
    <div className="card p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="text-sm font-semibold text-white">🎬 {t('together.theaterMode')}</div>
          <div className="text-xs text-slate-400">
            {t('together.theaterBlurb')}
          </div>
        </div>
        <div className="flex gap-2">
          <button onClick={() => setShowConfig((v) => !v)} className="btn-ghost text-sm" aria-label={t('together.configureTheater')}>⚙️</button>
          <button onClick={start} className="btn-primary">{t('together.startTheater')}</button>
        </div>
      </div>

      {showConfig && (
        <div className="mt-4 space-y-3 rounded-xl border border-white/10 bg-ink-900/50 p-4">
          <div>
            <label className="label" htmlFor="tm-sc">{t('together.shortcutName')}</label>
            <input
              id="tm-sc"
              value={shortcut}
              onChange={(e) => setShortcut(e.target.value)}
              placeholder={t('together.egMovieNight')}
              className="input"
              autoCapitalize="words"
            />
            <p className="mt-1 text-xs text-slate-500">
              {t('together.shortcutHelp')}
            </p>
          </div>
          <div>
            <label className="label" htmlFor="tm-msg">{t('together.groupMessage')}</label>
            <input id="tm-msg" value={msg} onChange={(e) => setMsg(e.target.value)} className="input" />
            <p className="mt-1 text-xs text-slate-500">
              {t('together.shareSheetA')}<code>{'{title}'}</code>{t('together.shareSheetAnd')}<code>{'{mins}'}</code>{t('together.shareSheetB')}
            </p>
          </div>
          <button onClick={saveConfig} className="btn-primary text-sm">{t('together.save')}</button>
        </div>
      )}
    </div>
  );
}
