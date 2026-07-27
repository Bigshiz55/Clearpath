/**
 * RULING A CARD WITHOUT LOSING YOUR PLACE.
 *
 * Tapping FOR or AGAINST used to fade the card out and `display: none` it. That
 * collapsed the hole it left, so every card after it jumped up a slot — the grid
 * reordered itself under your thumb, mid-scan. And because the card was gone,
 * a mis-tap was final: there was nothing left to undo it with.
 *
 * Both problems have the same cause and the same fix. THE CARD STAYS PUT. It
 * takes a visible ruled state in place, the row it occupies does not move, and
 * the ruling can be reversed — or switched — for as long as you are on the page.
 *
 * It still does not come back on the next load: the server already filters
 * titles you have handled out of the picks. That is the right split. Within a
 * session a ruling is a decision you can revisit; between sessions it is
 * something you told the recommender, and the recommender listened.
 *
 * Pure. No I/O, no DOM. The component is a thin shell over this.
 */

export type Ruling = 'for' | 'against';

/** What a ruling means to the feedback pipeline. */
export interface RulingFeedback {
  feedbackType: 'seen' | 'not_for_me';
  /** 1–10, or null when the ruling carries no explicit rating. */
  rating: number | null;
  /** The analytics event name this ruling emits. */
  event: string;
}

/**
 * FOR is a real positive rating (it marks the title watched, so the DNA moves
 * immediately). AGAINST is `not_for_me` — weight 0.8 and PERMANENT — with no
 * reason attached, which `submitPassFeedback` turns into a moderate title-level
 * negative. Neither is `not_now`; that is a different, mood-decaying signal and
 * neither of these buttons means it.
 */
export function rulingFeedback(ruling: Ruling): RulingFeedback {
  return ruling === 'for'
    ? { feedbackType: 'seen', rating: 8, event: 'like_thumb' }
    : { feedbackType: 'not_for_me', rating: null, event: 'dislike_thumb' };
}

/**
 * What tapping `tapped` does, given what the card already says.
 *
 * Tapping the ruling that is already active takes it back — the button you
 * pressed by mistake is the most obvious thing to press again. Tapping the
 * other one switches sides without a detour through neutral.
 */
export function nextRuling(current: Ruling | null, tapped: Ruling): Ruling | null {
  return current === tapped ? null : tapped;
}

/** Did this tap retract a ruling rather than record one? */
export function isUndo(current: Ruling | null, tapped: Ruling): boolean {
  return nextRuling(current, tapped) === null;
}

export const RULING_LABEL: Record<Ruling, string> = { for: 'For', against: 'Against' };

/**
 * The full sentence for assistive tech and the tooltip.
 *
 * The short labels are a verdict PAIR — one word each so they fit side by side
 * at 320px — but "Against" alone does not say that it is permanent or that it
 * teaches anything, so the long form carries both.
 */
export function rulingAria(ruling: Ruling, current: Ruling | null): string {
  if (current === ruling) {
    return ruling === 'for'
      ? 'Ruled for it. Tap again to undo.'
      : 'Ruled against it. Tap again to undo.';
  }
  return ruling === 'for'
    ? 'For it — more like this. Teaches your Viewer DNA.'
    : 'Not for me — teaches your Viewer DNA, it does not just hide the card.';
}

/** The status line shown on a ruled card, beside its Undo control. */
export function ruledMessage(ruling: Ruling | null): string | null {
  if (!ruling) return null;
  return ruling === 'for' ? 'Ruled FOR — taught your DNA' : 'Ruled AGAINST — taught your DNA';
}
