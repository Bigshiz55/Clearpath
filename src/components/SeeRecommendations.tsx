import Link from 'next/link';

/**
 * THE PAYOFF BUTTON.
 *
 * You answer a quiz, or grind through Rapid Fire, and the screen tells you what
 * it learned — and then offers you "Keep going". Rapid Fire and the title grid
 * had no way out to the thing you did it FOR. The two screens that did have one
 * called it different names ("See my recommendations", "Find something to
 * watch"), so the reward for finishing depended on which route you took.
 *
 * One button, one wording, on every completion screen, and it is the PRIMARY
 * action — "keep going" is the alternative, not the default. Somebody who has
 * just taught the recommender something wants to see what changed.
 *
 * `/app/watch` is the destination because that is where "Recommended for you"
 * lives, and it is `force-dynamic` with no cached recommendations — so the
 * picks are rebuilt from the DNA you just moved, not served from before it.
 */
export const RECOMMENDATIONS_HREF = '/app/watch';

export function SeeRecommendations({
  /** How many opinions this run recorded, when the screen knows. */
  taught = null,
  className = '',
}: {
  taught?: number | null;
  className?: string;
}) {
  return (
    <Link
      href={RECOMMENDATIONS_HREF}
      data-testid="see-recommendations"
      className={`btn-primary inline-flex min-h-[48px] items-center px-6 text-base ${className}`}
    >
      {/* The count, only when there is a real one to state. "See my
          recommendations · 0 new" would be a worse sentence than the plain one,
          and claiming a number the run did not produce is worse still. */}
      {taught && taught > 0 ? `See my recommendations · ${taught} new →` : 'See my recommendations →'}
    </Link>
  );
}
