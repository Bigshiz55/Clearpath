'use client';

export default function Error({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <div className="mx-auto max-w-lg py-16 text-center" role="alert">
      <h1 className="font-display text-2xl font-bold text-ivory-50">Something went wrong</h1>
      <p className="mt-3 text-ivory-300">
        An unexpected error interrupted this page. You can try again.
      </p>
      <button type="button" onClick={reset} className="btn-brass mt-6">
        Try again
      </button>
    </div>
  );
}
