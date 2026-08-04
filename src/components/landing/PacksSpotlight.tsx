import Link from 'next/link';

interface Capability {
  key: string;
  emoji: string;
  title: string;
  body: string;
}

const CAPABILITIES: Capability[] = [
  {
    key: 'true-crime',
    emoji: '🔎',
    title: 'One case, every version',
    body:
      "Multiple true-crime shows often cover the same real case under different titles. Crime Case Files spots the overlap, so you don't lose an hour to a rehash of something you already watched.",
  },
  {
    key: 'hallmark-lifetime',
    emoji: '🎀',
    title: 'Never lose the thread',
    body:
      "Hallmark and Lifetime premiere fast and repeat often. Track premieres, franchise order, and what you've already watched, so you always know what's actually new.",
  },
  {
    key: 'live-tv',
    emoji: '📺',
    title: "Live TV, scored like everything else",
    body:
      "What's airing right now gets the same personal match as everything else in WatchVerd1ct — not just a channel and a time.",
  },
];

/**
 * PACKS' NOVEL VALUE, MADE VISIBLE — WITHOUT BECOMING A NICHE HOMEPAGE.
 *
 * Packs are real, shipped features (Hallmark Universe, Lifetime Movie Vault,
 * Crime Case Files) that most visitors never discover because the homepage
 * only ever pointed at them as a small link. This section states, in three
 * short and specific claims, what Packs actually do — not a redesign, not a
 * new front door, just three sentences of honest detail above the existing
 * compact "Need something more specific?" entry points. The broad promise
 * ("Thousands of choices. 1 Verd1ct.") stays the hero; this only explains one
 * corner of it in more depth.
 */
export function PacksSpotlight() {
  return (
    <section className="border-t border-white/10" data-testid="packs-spotlight">
      <div className="container-page py-8 sm:py-10">
        <h2 className="text-center text-sm font-black uppercase tracking-[0.16em] text-slate-500">
          Beyond one Verd1ct
        </h2>
        <p className="mx-auto mt-2 max-w-lg text-center text-sm text-slate-400">
          <span className="font-semibold text-slate-200">Packs</span> are optional, focused add-ons for the
          genres worth tracking closely.
        </p>

        <div className="mx-auto mt-5 grid max-w-3xl gap-3 sm:mt-6 sm:grid-cols-3">
          {CAPABILITIES.map((c) => (
            <div
              key={c.key}
              className="rounded-2xl border border-white/10 bg-white/[0.02] p-4"
              data-testid={`packs-spotlight-${c.key}`}
            >
              <span className="text-2xl" aria-hidden>
                {c.emoji}
              </span>
              <div className="mt-2 text-sm font-bold text-white">{c.title}</div>
              <p className="mt-1 text-xs leading-relaxed text-slate-400">{c.body}</p>
            </div>
          ))}
        </div>

        <div className="mt-5 text-center">
          <Link href="/packs" className="btn-secondary text-sm transition hover:scale-[1.03] hover:border-white/25">
            Explore Packs →
          </Link>
        </div>
      </div>
    </section>
  );
}
