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

interface ToastApi {
  show: (message: string, kind?: ToastKind, action?: ToastAction) => void;
}

const ToastContext = createContext<ToastApi | null>(null);

export function useToast(): ToastApi {
  const ctx = useContext(ToastContext);
  if (!ctx) return { show: () => {} };
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

  return (
    <ToastContext.Provider value={{ show }}>
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
