/**
 * Outreach generator — pure. Produces a personalized, non-spammy draft for a
 * prospect on a given channel. Drafts only: the founder reviews, edits, copies,
 * and sends manually. Nothing here sends anything.
 */

export type OutreachChannel =
  | 'email'
  | 'instagram_dm'
  | 'tiktok_dm'
  | 'reddit'
  | 'facebook_group'
  | 'discord'
  | 'creator_pitch'
  | 'beta_invite'
  | 'follow_up';

export interface OutreachInput {
  name?: string;
  category?: string; // creator | community | newsletter | friend | ...
  platform?: string;
  audience?: string; // e.g. "film TikTok, ~40k"
  link: string; // the tracked link to include
}

export const CHANNEL_LABELS: Record<OutreachChannel, string> = {
  email: 'Email',
  instagram_dm: 'Instagram DM',
  tiktok_dm: 'TikTok DM',
  reddit: 'Reddit post',
  facebook_group: 'Facebook group post',
  discord: 'Discord post',
  creator_pitch: 'Creator collaboration pitch',
  beta_invite: 'Beta invitation',
  follow_up: 'Follow-up',
};

function who(i: OutreachInput): string {
  return i.name?.trim() || 'there';
}
function aud(i: OutreachInput): string {
  return i.audience?.trim() ? ` your audience (${i.audience.trim()})` : ' your audience';
}

/** Generate a channel-appropriate draft. Deterministic; edit freely before sending. */
export function generateOutreach(channel: OutreachChannel, i: OutreachInput): { subject?: string; body: string } {
  const name = who(i);
  const link = i.link;
  switch (channel) {
    case 'email':
      return {
        subject: 'A taste-matcher for what to watch — 2-min look?',
        body:
          `Hi ${name},\n\nI'm a solo founder building WatchVerd1ct — it learns why people say no to a title (too slow, too dark, not tonight) and gives one clear verdict for their mood, plus a group verdict when people can't agree.\n\nGiven${aud(i)}, I thought it might genuinely be useful to share. Would you be open to a quick look? Happy to give your followers founding-member early access.\n\n2-min try: ${link}\n\nThank you,\n[Your name]`,
      };
    case 'instagram_dm':
    case 'tiktok_dm':
      return {
        body:
          `Hey ${name}! Love what you post. I built WatchVerd1ct — it learns your taste and calls one verdict for tonight (and settles group “what do we watch” fights). Thought it might be fun for${aud(i)}. Open to a quick look / collab? Founding-member access for your people: ${link}`,
      };
    case 'reddit':
      return {
        subject: 'I built a taste-matcher that learns WHY you say no to a movie',
        body:
          `Not trying to spam — genuinely want feedback from people who watch a lot. WatchVerd1ct learns why you pass (too slow, too dark, not in the mood) and gives one verdict for your mood, plus a group verdict when you can't agree with someone. It's free and early. What would make it actually useful to you? ${link}`,
      };
    case 'facebook_group':
      return {
        body:
          `Hi all — solo founder here. I made a free app that ends the “what should we watch” argument: it learns your taste and gives one verdict (and a shared one for couples/families). Would love honest feedback from this group specifically: ${link}`,
      };
    case 'discord':
      return {
        body:
          `hey ${name} 👋 built a thing for the eternal “what do we watch” problem — WatchVerd1ct learns your taste and gives one verdict, plus group rooms so a server can pick together. free + early, feedback very welcome: ${link}`,
      };
    case 'creator_pitch':
      return {
        subject: 'Collab idea: “rate my watchlist” with WatchVerd1ct',
        body:
          `Hi ${name},\n\nI'm the founder of WatchVerd1ct (learns taste → one honest verdict; group rooms for “we can't agree”). A simple, high-performing format for${aud(i)}: “I let an app rate my entire watchlist.” It's visual, a little spicy, and easy.\n\nHappy to set up founding-member access + a tracked link so you get credit for signups. Would you be up for a quick chat?\n\n${link}\n\n[Your name]`,
      };
    case 'beta_invite':
      return {
        subject: 'Founding-member early access to WatchVerd1ct',
        body:
          `Hi ${name},\n\nYou're on the short list for founding-member access to WatchVerd1ct. Build your Watch DNA in ~60 seconds and get one honest verdict for tonight — then invite a partner/friend for a group verdict.\n\nStart here: ${link}\n\nI read every piece of feedback personally.\n[Your name]`,
      };
    case 'follow_up':
      return {
        body:
          `Hey ${name} — just floating this back up in case it got buried. No pressure at all; even a one-line “not for me” helps me. Quick look: ${link}`,
      };
    default:
      return { body: `Hi ${name}, thought this might be useful: ${link}` };
  }
}
