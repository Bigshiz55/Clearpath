import type { DiscoveryPage } from '../types';

/**
 * DISCOVERY PAGES (/discover/[slug]) — curated collections built around a real
 * user purpose. Deliberately NOT every keyword permutation: each page here
 * answers a question people actually ask, and anything that cannot carry
 * original analysis stays a draft.
 */

const CTA = { label: 'Get your personal Verd1ct', href: '/start' };

export const DISCOVER_PAGES: DiscoveryPage[] = [
  {
    kind: 'discover',
    slug: 'movies-under-90-minutes',
    title: 'Great Movies Under 90 Minutes',
    description:
      'Short films that respect your evening. Why runtime is a hard constraint worth honouring, and how to find genuinely good ones rather than merely brief ones.',
    heading: 'Movies under 90 minutes',
    standfirst: 'Sometimes the constraint that matters most is the clock.',
    status: 'published',
    updated: '2026-07-25',
    sections: [
      {
        heading: 'Why people like short films',
        body: [
          'Runtime is the most commonly ignored constraint in recommendation systems and one of the most frequently decisive in real life. A weeknight with an hour and a half before bed is not a smaller version of a free Saturday — it is a different problem, and a three-hour epic is simply the wrong answer regardless of how good it is.',
          'Films under ninety minutes also tend to be structurally tighter. There is no room for a sagging second act, so the discipline usually shows on screen.',
        ],
        bullets: [
          'Fits a weeknight without eating into sleep',
          'Tighter structure — less room for a slow middle',
          'Lower commitment when nobody is sure what they want',
        ],
      },
      {
        heading: 'How WatchVerd1ct handles runtime',
        body: [
          'Runtime is treated as a rule, not a hint. If you ask for under ninety minutes, nothing longer appears — not as a near miss, not as a highly-rated exception. The candidate is removed before ranking rather than demoted within it.',
          'For series, the same request is interpreted as per-episode length, because "I have ninety minutes" means something different when the thing you are choosing is a season.',
        ],
      },
      {
        heading: 'Who should skip this collection',
        body: [
          'If you have a full evening and want something immersive, an artificial runtime cap works against you — some of the best films earn their length.',
          'Short does not mean light, either. Plenty of films under ninety minutes are extremely intense, so if the goal is something undemanding, filter by tone rather than by clock.',
        ],
      },
      {
        heading: 'Getting a personal answer',
        body: [
          'A collection page can tell you what is short. It cannot tell you which of these you specifically will enjoy tonight, on the services you actually have, with the person sitting next to you.',
          'That is what WatchVerd1ct does with your own request: it applies the runtime rule, then ranks what survives against your Viewer DNA and explains its reasoning.',
        ],
      },
    ],
    faq: [
      {
        question: 'Does the runtime include credits?',
        answer:
          'We use the runtime published by our metadata source, which conventionally includes end credits. Treat it as accurate to within a few minutes.',
      },
      {
        question: 'Can I set a different limit?',
        answer:
          'Yes. Ask for any limit in plain English — under two hours, under seventy-five minutes — or drag the runtime slider. The limit you set is enforced exactly.',
      },
      {
        question: 'How does this work for TV?',
        answer:
          'For series the limit applies to episode length rather than total series length, since that is the unit you actually commit to in one sitting.',
      },
    ],
    related: [
      { href: '/for/movie-night', label: 'What should I watch tonight?' },
      { href: '/discover/fast-thrillers', label: 'Fast thrillers' },
      { href: '/for/couples', label: 'Movie picker for couples' },
      { href: '/guides/how-watchverd1ct-works', label: 'How WatchVerd1ct works' },
    ],
    cta: CTA,
  },
  {
    kind: 'discover',
    slug: 'fast-thrillers',
    title: 'Fast Thrillers That Never Sag',
    description:
      'Thrillers that move. What pace actually means as a measurable trait, why it predicts enjoyment so well, and how to find the ones matched to your taste.',
    heading: 'Fast thrillers',
    standfirst: 'Pace is one of the strongest predictors of whether you will finish something.',
    status: 'published',
    updated: '2026-07-25',
    sections: [
      {
        heading: 'Why people like fast pacing',
        body: [
          'Pace is one of the most reliable predictors of whether someone abandons a film halfway through — more reliable, in our data, than genre. Someone who consistently drops slow-burn films will drop them regardless of how acclaimed they are.',
          'It is also one of the clearest signals a viewer can give. "Too slow" is specific and actionable in a way that a bare thumbs-down never is, which is why WatchVerd1ct offers it as a reason chip rather than making you explain in prose.',
        ],
        bullets: [
          'Strong predictor of completion, not just enjoyment',
          'Specific enough to learn from immediately',
          'Independent of genre — fast dramas and slow thrillers both exist',
        ],
      },
      {
        heading: 'What makes a thriller feel fast',
        body: [
          'Not action volume. A film can be almost entirely conversation and still feel relentless if information keeps arriving — a new revelation every few minutes, stakes that escalate, a clock that visibly runs down.',
          'Equally, a film with constant action can feel slow when nothing changes between set pieces. Pace is about the rate at which the situation changes, which is why it has to be measured as its own trait rather than inferred from genre.',
        ],
      },
      {
        heading: 'Who should skip fast pacing',
        body: [
          'If you value atmosphere, dread and slow accumulation, filtering for pace will exclude much of the best work in the genre. Some of the finest thrillers ever made are deliberately patient.',
          'And late at night, relentless pacing can be the wrong choice entirely — it is harder to stop watching, which is not always what you want at midnight.',
        ],
      },
      {
        heading: 'How your profile learns pace',
        body: [
          'Every reaction adjusts your pace preference, and marking something as too slow or too frantic is weighted more heavily than a general dislike because it names the specific dimension.',
          'You can inspect and correct that dimension directly in your DNA view if it drifts away from what you actually like.',
        ],
      },
    ],
    faq: [
      {
        question: 'How is pace measured?',
        answer:
          'It is one of eighteen interpretable content dimensions classified per title and cached, then compared against the pace preference in your Viewer DNA.',
      },
      {
        question: 'Can I ask for slow films instead?',
        answer:
          'Yes. Ask for a slow burn in plain English and the same dimension is used in the opposite direction.',
      },
      {
        question: 'Does this include TV thrillers?',
        answer:
          'Yes. Ask for shows rather than movies and the same pace matching applies to series.',
      },
    ],
    related: [
      { href: '/discover/movies-under-90-minutes', label: 'Movies under 90 minutes' },
      { href: '/for/date-night', label: 'Date night picks' },
      { href: '/guides/how-viewer-dna-works', label: 'How Viewer DNA works' },
      { href: '/for/movie-night', label: 'What should I watch tonight?' },
    ],
    cta: CTA,
  },
  {
    kind: 'discover',
    slug: 'non-supernatural-thrillers',
    title: 'Thrillers With No Supernatural Element',
    description:
      'Grounded thrillers for viewers who want tension without ghosts or the paranormal. Why this exclusion is so common, and how it is enforced as a hard rule.',
    heading: 'Thrillers without the supernatural',
    standfirst: 'One of the most requested exclusions there is — and one most systems ignore.',
    status: 'published',
    updated: '2026-07-25',
    sections: [
      {
        heading: 'Why people like this exclusion',
        body: [
          '"Something like that, but without the ghosts" is among the most common refinements people make, and it is almost never honoured properly. Genre tags are too coarse: a grounded procedural and a haunted-house story frequently share the same thriller label.',
          'The request is also usually firm rather than casual. Someone who does not enjoy supernatural content does not want a highly-rated exception — they want it gone.',
        ],
      },
      {
        heading: 'Why generic filters fail here',
        body: [
          'Genre taxonomies were designed for shelving, not for prediction. Supernatural content cuts across horror, thriller, drama and mystery, so no genre filter cleanly isolates it.',
          'WatchVerd1ct classifies supernatural content as its own interpretable dimension, which is why the exclusion can be applied as an actual rule rather than an approximation.',
        ],
        bullets: [
          'Supernatural content treated as its own dimension, not a genre',
          'Excluded before ranking, so no score can override it',
          'Applies identically to films and series',
        ],
      },
      {
        heading: 'Who should skip this collection',
        body: [
          'If you enjoy ambiguity about whether something uncanny is happening, this exclusion removes a whole rich tradition of films that live in exactly that uncertainty.',
          'Some ambiguous titles are genuinely hard to classify, and where our confidence is low we would rather say so than assert a clean answer.',
        ],
      },
      {
        heading: 'Getting it exactly right for you',
        body: [
          'State the exclusion in plain English — "a clever mystery with no supernatural content" — and it becomes a hard constraint in the query plan, visible in the read-back so you can confirm it was understood.',
          'Every result is then validated against it before rendering, and if only two titles qualify you are shown two rather than three padded with something that breaks the rule.',
        ],
      },
    ],
    faq: [
      {
        question: 'What counts as supernatural?',
        answer:
          'Ghosts, demons, possession, magic and the paranormal. Science fiction is treated separately, since many people who avoid the supernatural are perfectly happy with science fiction.',
      },
      {
        question: 'Can I exclude other things too?',
        answer:
          'Yes — extreme violence, sad endings, subtitles, horror and more can each be excluded, and combined exclusions are all enforced together.',
      },
      {
        question: 'Is the exclusion permanent?',
        answer:
          'Only if you save it as a preference. Stated for one request, it applies to that request alone and never alters your saved profile.',
      },
    ],
    related: [
      { href: '/discover/fast-thrillers', label: 'Fast thrillers' },
      { href: '/for/couples', label: 'Movie picker for couples' },
      { href: '/guides/how-watchverd1ct-works', label: 'How WatchVerd1ct works' },
      { href: '/guides/how-viewer-dna-works', label: 'How Viewer DNA works' },
    ],
    cta: CTA,
  },
  {
    kind: 'discover',
    slug: 'movies-for-couples',
    title: 'Movies Both of You Will Actually Enjoy',
    description:
      'Films that work for two people with different taste. How joint scoring avoids the lukewarm compromise that averaging two profiles always produces.',
    heading: 'Movies for two people',
    standfirst: 'The hardest recommendation problem is not one person. It is two.',
    status: 'published',
    updated: '2026-07-25',
    sections: [
      {
        heading: 'Why people like joint scoring',
        body: [
          'A film that suits two different people is not the average of their tastes — it is a film that clears both of their bars. Those are genuinely different targets, and optimising for the first reliably produces something neither person chose.',
          'WatchVerd1ct scores each person separately and ranks by a joint score weighted toward whoever is served least, so a lopsided pick can never masquerade as a great shared one.',
        ],
        bullets: [
          'Both individual scores always shown',
          'Ranking leans on the least-served person',
          'A genuine mismatch is labelled, not hidden',
        ],
      },
      {
        heading: 'What tends to work for two',
        body: [
          'Films with more than one point of entry — a thriller with real characters, a comedy with actual stakes — tend to satisfy divergent taste better than something excellent at exactly one thing.',
          'Moderate runtime helps too. A three-hour commitment demands both people be fully enthusiastic, which raises the bar considerably.',
        ],
      },
      {
        heading: 'Who should skip this approach',
        body: [
          'If your taste is nearly identical, joint scoring is unnecessary machinery and a single profile will serve you both.',
          'If one of you genuinely does not mind what you watch, optimising for the person who does care is simpler and faster.',
        ],
      },
      {
        heading: 'When there is no good shared pick',
        body: [
          'Sometimes the honest answer is that no title serves both people well tonight. WatchVerd1ct says so rather than promoting the least-bad compromise, and suggests that this is an evening for two different screens.',
          'That answer is more useful than a false one, even though it is less satisfying.',
        ],
      },
    ],
    faq: [
      {
        question: 'Do we both need profiles?',
        answer:
          'It works better with two, but a second person can join with just a display name and a short tonight-preferences step.',
      },
      {
        question: 'What if one of us has seen it?',
        answer:
          'Mark it as watched and it is excluded for the group. Already-watched conflicts are treated as a real constraint.',
      },
      {
        question: 'Can we do this on separate phones?',
        answer:
          'Yes. Open a Court room, share the link, and each person reacts on their own device before the group Verd1ct is revealed.',
      },
    ],
    related: [
      { href: '/for/couples', label: 'Movie picker for couples' },
      { href: '/for/date-night', label: 'Date night picks' },
      { href: '/guides/how-court-works', label: 'How group decisions work' },
      { href: '/discover/fast-thrillers', label: 'Fast thrillers' },
    ],
    cta: CTA,
  },
];
