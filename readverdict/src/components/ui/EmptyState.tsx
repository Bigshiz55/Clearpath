import { cn } from '@/lib/utils/cn';

/**
 * Honest placeholder for surfaces whose features arrive in a later phase.
 * It states what is coming rather than showing fabricated content.
 */
export function EmptyState({
  title,
  body,
  phase,
  className,
  children,
}: {
  title: string;
  body: string;
  phase?: string;
  className?: string;
  children?: React.ReactNode;
}) {
  return (
    <div
      className={cn(
        'rounded-2xl border border-dashed border-obsidian-600 bg-obsidian-900/60 p-8 text-center shadow-ring',
        className,
      )}
    >
      {phase && (
        <span className="pill mb-4 inline-flex">{phase}</span>
      )}
      <h2 className="font-display text-xl font-semibold text-ivory-100">{title}</h2>
      <p className="mx-auto mt-2 max-w-md text-ivory-300">{body}</p>
      {children && <div className="mt-6">{children}</div>}
    </div>
  );
}
