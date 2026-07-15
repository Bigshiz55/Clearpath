'use client';

import { useEffect, useRef, useState } from 'react';
import { addToWatchlist } from '@/lib/actions/watchlist';

const LS_SHORTCUT = 'wv_theater_shortcut';
const LS_MSG = 'wv_theater_msg';
const DEFAULT_MSG = "🎬 Theater's closed — we're watching {title} for about {mins} min. Back after!";

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
  const mins = runtimeMinutes && runtimeMinutes > 0 ? runtimeMinutes : 120;
  const [showConfig, setShowConfig] = useState(false);
  const [shortcut, setShortcut] = useState('');
  const [msg, setMsg] = useState(DEFAULT_MSG);
  const [running, setRunning] = useState(false);
  const [remaining, setRemaining] = useState(mins * 60);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    setShortcut(localStorage.getItem(LS_SHORTCUT) ?? '');
    setMsg(localStorage.getItem(LS_MSG) ?? DEFAULT_MSG);
  }, []);

  useEffect(() => {
    return () => {
      if (timer.current) clearInterval(timer.current);
    };
  }, []);

  function saveConfig() {
    localStorage.setItem(LS_SHORTCUT, shortcut.trim());
    localStorage.setItem(LS_MSG, msg.trim() || DEFAULT_MSG);
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
          <div className="text-xs uppercase tracking-wide text-brand-200">🎬 Theater mode · now playing</div>
          <div className="mt-1 text-lg font-bold text-white">{title}</div>
          <div className="text-sm text-slate-300">
            {remaining > 0 ? <>~{fmt(remaining)} left of the runtime</> : 'Runtime’s up — how was it?'}
          </div>
        </div>
        <button onClick={stop} className="btn-secondary">End</button>
      </div>
    );
  }

  return (
    <div className="card p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="text-sm font-semibold text-white">🎬 Theater Mode</div>
          <div className="text-xs text-slate-400">
            Dim the lights, hush notifications, and tell the group — all from one tap.
          </div>
        </div>
        <div className="flex gap-2">
          <button onClick={() => setShowConfig((v) => !v)} className="btn-ghost text-sm" aria-label="Configure theater mode">⚙️</button>
          <button onClick={start} className="btn-primary">Start Theater Mode</button>
        </div>
      </div>

      {showConfig && (
        <div className="mt-4 space-y-3 rounded-xl border border-white/10 bg-ink-900/50 p-4">
          <div>
            <label className="label" htmlFor="tm-sc">Apple Shortcut name</label>
            <input
              id="tm-sc"
              value={shortcut}
              onChange={(e) => setShortcut(e.target.value)}
              placeholder="e.g. Movie Night"
              className="input"
              autoCapitalize="words"
            />
            <p className="mt-1 text-xs text-slate-500">
              Make a Shortcut on your iPhone (Shortcuts app) that dims your Hue lights and turns on Do Not
              Disturb, then put its exact name here. Starting Theater Mode runs it.
            </p>
          </div>
          <div>
            <label className="label" htmlFor="tm-msg">Group message</label>
            <input id="tm-msg" value={msg} onChange={(e) => setMsg(e.target.value)} className="input" />
            <p className="mt-1 text-xs text-slate-500">
              Shared via your phone’s share sheet. <code>{'{title}'}</code> and <code>{'{mins}'}</code> get filled in.
            </p>
          </div>
          <button onClick={saveConfig} className="btn-primary text-sm">Save</button>
        </div>
      )}
    </div>
  );
}
