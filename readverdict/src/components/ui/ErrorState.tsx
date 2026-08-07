import { Button } from './Button';

/** Inline error surface for a failed section (distinct from the route-level error.tsx). */
export function ErrorState({
  title = 'Something went wrong',
  body = 'This section could not load. Please try again.',
  onRetry,
  retryHref,
}: {
  title?: string;
  body?: string;
  onRetry?: () => void;
  retryHref?: string;
}) {
  return (
    <div
      role="alert"
      className="rounded-2xl border border-verdict-pass/30 bg-verdict-pass/5 p-6 text-center"
    >
      <h2 className="font-display text-lg font-semibold text-ivory-50">{title}</h2>
      <p className="mx-auto mt-2 max-w-md text-ivory-300">{body}</p>
      {retryHref ? (
        <Button href={retryHref} variant="secondary" size="sm" className="mt-4">
          Try again
        </Button>
      ) : onRetry ? (
        <Button onClick={onRetry} variant="secondary" size="sm" className="mt-4">
          Try again
        </Button>
      ) : null}
    </div>
  );
}
