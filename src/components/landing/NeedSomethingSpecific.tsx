import Link from 'next/link';

const ENTRIES = [
  { href: '/packs', label: 'Hallmark & Lifetime' },
  { href: '/packs/crime-case-files', label: 'True Crime' },
  { href: '/app/tv', label: "What's on tonight" },
  { href: '/app/new', label: 'New this week' },
  { href: '/app/finder', label: 'Forensic Search' },
  { href: '/app/subscriptions', label: 'Subscription Check' },
] as const;

/**
 * The specialized surfaces (Packs, live-TV, new releases, the full filter
 * builder) are real, existing, unchanged features — this just gives them a
 * compact, low-visual-weight home instead of competing with the hero search
 * for primary attention. Every route here already exists; nothing was moved.
 */
export function NeedSomethingSpecific() {
  return (
    <section className="border-t border-white/10" data-testid="need-something-specific">
      <div className="container-page py-6 text-center sm:py-8">
        <h2 className="text-xs font-bold uppercase tracking-[0.14em] text-slate-500">Need something more specific?</h2>
        <div className="mx-auto mt-3 flex max-w-xl flex-wrap items-center justify-center gap-2">
          {ENTRIES.map((e) => (
            <Link
              key={e.href}
              href={e.href}
              className="rounded-full border border-white/12 bg-white/[0.03] px-3.5 py-1.5 text-xs text-slate-300 transition hover:border-white/25 hover:text-white"
            >
              {e.label}
            </Link>
          ))}
        </div>
      </div>
    </section>
  );
}
