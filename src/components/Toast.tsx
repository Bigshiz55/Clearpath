'use client';

import { createContext, useContext, useCallback, useState, useRef } from 'react';

type ToastKind = 'success' | 'error' | 'info';
interface ToastAction {
  label: string;
  onClick: () => void;
}
interface Toast {
  id: number;
  message: string;
  kind: ToastKind;
  action?: ToastAction;
}

/** A transient "decision captured — add context?" bar: optional one-tap chips. */
export interface BarChip {
  label: string;
  onClick: () => void;
  tone?: 'default' | 'undo';
}
export interface BarConfig {
  message: string;
  lead?: string; // the "we're paying attention" line (intelligent sampling)
  chips: BarChip[];
}
interface BarState extends BarConfig {
  id: number;
}

interface ToastApi {
  show: (message: string, kind?: ToastKind, action?: ToastAction) => void;
  /** Show the lightweight, optional-context feedback bar (replaces any open one). */
  bar: (cfg: BarConfig) => void;
}

const ToastContext = createContext<ToastApi | null>(null);

export function useToast(): ToastApi {
  const ctx = useContext(ToastContext);
  if (!ctx) return { show: () => {}, bar: () => {} };
  return ctx;
}

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const counter = useRef(0);

  const show = useCallback((message: string, kind: ToastKind = 'info', action?: ToastAction) => {
    const id = counter.current++;
    setToasts((t) => [...t, { id, message, kind, action }]);
    setTimeout(
      () => {
        setToasts((t) => t.filter((x) => x.id !== id));
      },
      action ? 6000 : 4000, // give actionable toasts (Undo) a longer window
    );
  }, []);

  const dismiss = useCallback((id: number) => setToasts((t) => t.filter((x) => x.id !== id)), []);

  const [feedbackBar, setFeedbackBar] = useState<BarState | null>(null);
  const barTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const bar = useCallback((cfg: BarConfig) => {
    const id = counter.current++;
    if (barTimer.current) clearTimeout(barTimer.current);
    setFeedbackBar({ ...cfg, id });
    barTimer.current = setTimeout(() => setFeedbackBar((b) => (b?.id === id ? null : b)), 7000);
  }, []);
  const clearBar = useCallback(() => setFeedbackBar(null), []);

  return (
    <ToastContext.Provider value={{ show, bar }}>
      {feedbackBar && (
        <div className="pointer-events-none fixed inset-x-0 bottom-4 z-[101] flex justify-center px-4" aria-live="polite">
          <div className="pointer-events-auto w-full max-w-md rounded-2xl border border-white/15 bg-ink-850/95 p-3 shadow-card backdrop-blur">
            {feedbackBar.lead && <div className="mb-1 text-xs font-semibold text-brand-200">{feedbackBar.lead}</div>}
            <div className="text-sm font-semibold text-white">{feedbackBar.message}</div>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {feedbackBar.chips.map((c, i) => (
                <button
                  key={i}
                  type="button"
                  onClick={() => { c.onClick(); clearBar(); }}
                  className={
                    c.tone === 'undo'
                      ? 'rounded-full border border-white/25 px-3 py-1.5 text-xs font-bold text-white transition hover:bg-white/10'
                      : 'rounded-full border border-white/15 bg-white/5 px-3 py-1.5 text-xs font-medium text-slate-200 transition hover:bg-white/10'
                  }
                >
                  {c.label}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}
      {children}
      <div
        className="pointer-events-none fixed inset-x-0 bottom-4 z-[100] flex flex-col items-center gap-2 px-4"
        aria-live="polite"
        role="status"
      >
        {toasts.map((t) => (
          <div
            key={t.id}
            className={[
              'pointer-events-auto w-full max-w-sm animate-fade-up rounded-xl border px-4 py-3 text-sm font-medium shadow-card backdrop-blur',
              t.kind === 'success'
                ? 'border-emerald-400/40 bg-emerald-500/15 text-emerald-100'
                : t.kind === 'error'
                  ? 'border-red-400/40 bg-red-500/15 text-red-100'
                  : 'border-white/15 bg-ink-800/90 text-slate-100',
            ].join(' ')}
          >
            <div className="flex items-center justify-between gap-3">
              <span>{t.message}</span>
              {t.action && (
                <button
                  type="button"
                  onClick={() => {
                    t.action?.onClick();
                    dismiss(t.id);
                  }}
                  className="flex-none rounded-lg border border-white/25 px-2.5 py-1 text-xs font-bold text-white transition hover:bg-white/10"
                >
                  {t.action.label}
                </button>
              )}
            </div>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}
