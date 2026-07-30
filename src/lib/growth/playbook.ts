/**
 * Today's Growth Plan — pure. Turns the current real situation into at most five
 * prioritized, copy-ready actions. Never generic ("post on social"): each action
 * carries the exact task, the actual copy, and a direct link to do it.
 *
 * Actions are a curated founder playbook (not fabricated data). The SELECTION is
 * driven by real signals (user count, prospects, due follow-ups, funnel leak).
 */
import type { GrowthStage } from './core';

export interface PlanAction {
  id: string;
  task: string;
  why: string;
  impact: string;
  minutes: number;
  /** Ready-to-use copy/creative, when the action needs it. */
  copy?: string;
  /** Direct link to perform the action inside Growth OS (or an external target). */
  href: string;
  channel?: string;
  category: 'outreach' | 'crm' | 'product' | 'content' | 'measure' | 'referral' | 'research';
  priority: number;
}

export interface PlanContext {
  users: number;
  stage: GrowthStage;
  prospectsTotal: number;
  prospectsToContact: number;
  followUpsDue: number;
  trackedLinks: number;
  biggestLeak?: { fromLabel: string; toLabel: string; lostPct: number } | null;
}

const FRIENDS_DM =
  "Hey [name] — I built a small app, WatchVerd1ct, that ends the “what should we watch?” argument: it learns your taste and gives ONE clear verdict for tonight's mood. Could you try it for 2 min and tell me what's confusing or missing? Brutally honest feedback is exactly what I need 🙏 [link]";

const COMMUNITY_POST =
  "Title: I got tired of 40-minute “what should we watch” fights, so I built a taste-matcher\n\nBody: It learns why you say no (too slow, too dark, not tonight) and gives one verdict for your mood — and a group verdict when you and a partner/friends can't agree. It's free and early; I'd genuinely love feedback from people who watch a lot. Not trying to spam — happy to answer anything. [link]";

const FOUNDER_STORY =
  "I'm a solo founder. I built WatchVerd1ct because my partner and I wasted more time choosing than watching. It learns your taste across three signals — what pulls you in, what you actually enjoy, and what you're curious about — and gives one honest verdict. Building in public; first 100 users get founding-member status. Try it: [link]";

const GROUP_INVITE =
  "Want to settle movie night for good? I'll add you to a WatchVerd1ct group room — we each build a 60-second taste profile and it finds the pick we'll BOTH be happy with. Takes 2 min: [link]";

/** Build up to five prioritized actions from the real situation. */
export function todaysPlan(ctx: PlanContext): PlanAction[] {
  const out: PlanAction[] = [];

  // 1) Warm leads first — follow-ups that are due.
  if (ctx.followUpsDue > 0) {
    out.push({
      id: 'followups',
      task: `Follow up with ${ctx.followUpsDue} prospect${ctx.followUpsDue > 1 ? 's' : ''} due today`,
      why: 'Warm leads go cold fast. A timely second touch converts far better than a new cold one.',
      impact: `~${Math.max(1, Math.round(ctx.followUpsDue * 0.3))} likely replies`,
      minutes: 10 * ctx.followUpsDue,
      href: '/growth-os/crm?filter=followup',
      category: 'crm',
      priority: 100,
    });
  }

  // 2) Contact prospects already queued.
  if (ctx.prospectsToContact > 0) {
    out.push({
      id: 'contact-queued',
      task: `Reach out to ${Math.min(5, ctx.prospectsToContact)} queued prospect${ctx.prospectsToContact > 1 ? 's' : ''}`,
      why: 'These are people you already identified as relevant. Sending beats collecting.',
      impact: 'Founder-led outreach is the #1 channel from 0→100.',
      minutes: 8 * Math.min(5, ctx.prospectsToContact),
      href: '/growth-os/outreach',
      category: 'outreach',
      priority: 90,
    });
  }

  // 3) Seed the CRM if it's thin.
  if (ctx.prospectsTotal < 10) {
    out.push({
      id: 'seed-crm',
      task: `Add ${10 - ctx.prospectsTotal} prospects to your outreach list`,
      why: 'You can only reach out to people you\'ve written down. A full pipeline is the engine of Stage 1.',
      impact: 'Targets for this week\'s outreach.',
      minutes: 20,
      copy:
        'Good first sources: r/MovieSuggestions, r/televisionsuggestions, r/NetflixBestOf; Facebook groups “Movie Recommendations”, “What to Watch”; Discord film servers; 5 friends who argue about what to watch; 3 movie TikTok/IG creators under 50k followers.',
      href: '/growth-os/crm?new=1',
      category: 'crm',
      priority: 80,
    });
  }

  // 4) Personal network — the highest-converting Stage-1 move.
  out.push({
    id: 'friends-family',
    task: 'DM 5 friends/family for honest first-use feedback',
    why: 'People who know you will actually try it and tell you the truth. The first 20 users almost always come from here.',
    impact: '3–5 activated testers + real feedback',
    minutes: 15,
    copy: FRIENDS_DM,
    href: '/growth-os/outreach?template=friends',
    channel: 'DM / text',
    category: 'outreach',
    priority: 70,
  });

  // 5) Attribution hygiene — make every signup traceable.
  if (ctx.trackedLinks === 0) {
    out.push({
      id: 'first-link',
      task: 'Create your first tracked link',
      why: 'Without it you can\'t tell which post or person brought a user. Track from user #1.',
      impact: 'Every future signup becomes attributable.',
      minutes: 3,
      href: '/growth-os/campaigns?new=link',
      category: 'measure',
      priority: 65,
    });
  }

  // 6) Fill remaining slots with evergreen Stage-1 plays.
  const evergreen: PlanAction[] = [
    {
      id: 'community-post',
      task: 'Post one value-first intro in a movie/TV community',
      why: 'Communities of people who love arguing about what to watch are your exact audience.',
      impact: '10–40 qualified visits if it lands',
      minutes: 15,
      copy: COMMUNITY_POST,
      href: '/growth-os/outreach?template=community',
      channel: 'Reddit / Facebook group',
      category: 'content',
      priority: 55,
    },
    {
      id: 'group-invite',
      task: 'Invite 3 friends to a group verdict room',
      why: 'The collaborative "we can\'t agree" moment is WatchVerd1ct\'s natural viral loop.',
      impact: 'Activates the invite→group-result loop',
      minutes: 10,
      copy: GROUP_INVITE,
      href: '/growth-os/outreach?template=group',
      channel: 'DM',
      category: 'referral',
      priority: 50,
    },
    {
      id: 'founder-story',
      task: 'Share your founder story once',
      why: 'Authentic founder-led posts outperform corporate copy at this stage.',
      impact: 'Trust + a few qualified signups',
      minutes: 15,
      copy: FOUNDER_STORY,
      href: '/growth-os/outreach?template=founder',
      channel: 'X / IG / LinkedIn',
      category: 'content',
      priority: 45,
    },
    {
      id: 'interviews',
      task: 'Run 3 five-minute user interviews',
      why: 'Below 100 users, one honest conversation beats any dashboard.',
      impact: 'Find the #1 confusion + the must-have use case',
      minutes: 30,
      href: '/growth-os/feedback',
      category: 'research',
      priority: 40,
    },
  ];

  // 7) If there's a real, meaningful funnel leak, prioritize fixing it.
  if (ctx.biggestLeak && ctx.biggestLeak.lostPct >= 0.4) {
    out.push({
      id: 'fix-leak',
      task: `Fix the drop-off: ${ctx.biggestLeak.fromLabel} → ${ctx.biggestLeak.toLabel}`,
      why: `You're losing ${Math.round(ctx.biggestLeak.lostPct * 100)}% here — the highest-leverage product fix right now.`,
      impact: 'More of your hard-won traffic reaches activation',
      minutes: 60,
      href: '/growth-os#funnel',
      category: 'product',
      priority: 60,
    });
  }

  for (const a of evergreen) {
    if (out.length >= 8) break;
    out.push(a);
  }

  return out.sort((a, b) => b.priority - a.priority).slice(0, 5);
}
