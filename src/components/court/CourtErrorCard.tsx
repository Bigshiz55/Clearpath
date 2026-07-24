import Link from 'next/link';
import type { ClassifiedError } from '@/lib/court/joinState';

/**
 * A precise, recoverable Court error screen — one per classified state. Shared by
 * LiveCourt and the diagnostics/states harness so the exact rendering is testable.
 * Never shows a stack trace or secret; always offers at least one recovery action.
 */
export function CourtErrorCard({ err, onRetry }: { err: ClassifiedError; onRetry?: () => void }) {
  const icon = err.state === 'room-full' ? '🚪'
    : err.state === 'connection-failed' ? '🔌'
    : err.state === 'migration-missing' || err.state === 'config-missing' ? '🛠️'
    : err.transient ? '⏳' : '⚖️';
  const canRetry = onRetry && (err.recovery === 'try-again' || err.recovery === 'reconnect' || err.transient);
  return (
    <div className="card p-6 text-center" data-testid="court-error" data-state={err.state}>
      <div className="text-3xl" aria-hidden>{icon}</div>
      <p className="mt-3 text-sm text-slate-200" data-testid="court-error-message">{err.message}</p>
      <div className="mt-4 flex flex-wrap items-center justify-center gap-2">
        {canRetry && (
          <button type="button" onClick={onRetry} style={{ minHeight: 44 }} className="btn-primary text-sm" data-testid="court-error-retry">
            {err.recovery === 'reconnect' ? 'Reconnect' : 'Try again'}
          </button>
        )}
        {err.recovery === 'open-correct-site' && (
          <p className="text-xs text-slate-500">Open the invite link the host sent — make sure it’s the same site.</p>
        )}
        <Link href="/app" style={{ minHeight: 44 }} className="btn-secondary inline-flex items-center text-sm" data-testid="court-error-home">Return home</Link>
      </div>
      {err.state === 'migration-missing' && (
        <p className="mt-3 text-[11px] text-slate-500">Site owner: apply the Court database update (migrations 0004 + 0014 + 0023).</p>
      )}
    </div>
  );
}
