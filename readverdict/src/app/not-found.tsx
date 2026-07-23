import Link from 'next/link';

export default function NotFound() {
  return (
    <div className="mx-auto max-w-lg py-16 text-center">
      <p className="text-xs font-semibold uppercase tracking-[0.2em] text-brass-400">404</p>
      <h1 className="mt-2 font-display text-3xl font-bold text-ivory-50">Page not found</h1>
      <p className="mt-3 text-ivory-300">
        That page doesn’t exist yet. Head back and ask ReadVerdict instead.
      </p>
      <div className="mt-8 flex justify-center gap-3">
        <Link href="/" className="btn-ghost">
          Home
        </Link>
        <Link href="/ask" className="btn-brass">
          Ask ReadVerdict
        </Link>
      </div>
    </div>
  );
}
