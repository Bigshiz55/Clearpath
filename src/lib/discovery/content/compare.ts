import type { DiscoveryPage } from '../types';

/**
 * COMPARISON PAGES. Every claim here must be defensible: each competitor is
 * genuinely excellent at something, and each page says so plainly before
 * explaining where WatchVerd1ct differs. Dishonest comparisons would be both a
 * trust failure and, in search terms, a short-lived one.
 */

const CTA = { label: 'Get your personal Verd1ct', href: '/start' };

export const COMPARE_PAGES: DiscoveryPage[] = [
  {
    kind: 'compare',
    slug: 'imdb',
    title: 'WatchVerd1ct vs IMDb: Which Should You Use?',
    description:
      'IMDb is the definitive film database with the largest rating pool. WatchVerd1ct predicts what you personally will enjoy tonight. An honest comparison of both.',
    heading: 'WatchVerd1ct vs IMDb',
    standfirst: 'One is the reference library of film. The other decides what you watch tonight.',
    status: 'published',
    updated: '2026-07-25',
    sections: [
      {
        heading: 'What IMDb does better',
        body: [
          'IMDb is the most complete film and television database in existence, and nothing here is going to pretend otherwise. Cast and crew credits, release histories, alternate titles, filming locations, trivia, box office — if a fact about a production exists, IMDb almost certainly has it.',
          'Its rating pool is also unmatched in raw size. A major release accumulates hundreds of thousands of votes, which makes the number extremely stable. If you want to know how the general public received a film, IMDb answers that better than anyone.',
        ],
        bullets: [
          'The deepest credits and production metadata anywhere',
          'Enormous, statistically stable rating samples',
          'Decades of coverage including obscure and regional titles',
        ],
      },
      {
        heading: 'Where an average rating falls short',
        body: [
          'A single averaged number answers the question "what did everyone think?" — but that is not the question you actually have. Your question is "will I enjoy this tonight, with the people on my sofa, on a service I already pay for?"',
          'Averages hide disagreement. A film rated 7.1 might be adored by people who love slow character studies and disliked by everyone else, and the average tells you nothing about which group you are in. Two films with identical scores can be completely different bets for you specifically.',
        ],
      },
      {
        heading: 'Why people like WatchVerd1ct',
        body: [
          'WatchVerd1ct starts from your taste rather than the crowd average. As you react to titles, it builds a Viewer DNA profile across interpretable traits — pace, tone, humour, darkness, complexity, ending preference — and predicts a Your Match score for each title.',
          'It also answers the practical parts of the question. It filters to services you actually have, honours hard constraints like runtime and media type, and when several people are watching it scores the title for each person rather than averaging them into a number nobody agrees with.',
        ],
        bullets: [
          'A Your Match score tuned to your history, not the crowd',
          'Every recommendation explains why it rose and what held it back',
          'Group decisions that protect a strong objection instead of averaging it away',
        ],
      },
      {
        heading: 'Who should skip WatchVerd1ct',
        body: [
          'If what you want is a reference work — checking who directed something, when it was released, or which actor you recognise — IMDb is the right tool and WatchVerd1ct is not trying to replace it. We do not attempt to match its catalogue depth or its trivia.',
          'If you enjoy browsing for its own sake, and the act of scrolling through a large library is part of the pleasure, a decision engine that hands you one answer may feel like it is taking away the fun. That is a fair objection.',
        ],
      },
      {
        heading: 'Use both, honestly',
        body: [
          'These products answer different questions and there is no real conflict. Most people we talk to use a database to look things up and want something else entirely when the evening actually starts and nobody can agree.',
          'That gap — thousands of titles, no decision — is the only thing WatchVerd1ct is built to close.',
        ],
      },
    ],
    faq: [
      {
        question: 'Does WatchVerd1ct use IMDb ratings?',
        answer:
          'We show IMDb ratings as one piece of evidence alongside critic and audience scores, clearly labelled by source. They inform the general Watchability score, but they never override your personal Your Match prediction.',
      },
      {
        question: 'Is WatchVerd1ct a replacement for IMDb?',
        answer:
          'No. IMDb is a database and WatchVerd1ct is a decision engine. We do not try to match its credits, trivia or catalogue depth — we answer what to watch tonight, which is a different question.',
      },
      {
        question: 'How many ratings do I need before predictions are useful?',
        answer:
          'You can get a useful answer from your first plain-English request, because the request itself carries constraints. Predictions sharpen as you react to titles, and the interface tells you honestly how confident it is.',
      },
    ],
    related: [
      { href: '/compare/letterboxd', label: 'WatchVerd1ct vs Letterboxd' },
      { href: '/compare/rottentomatoes', label: 'WatchVerd1ct vs Rotten Tomatoes' },
      { href: '/guides/why-average-ratings-fail', label: 'Why average ratings fail' },
      { href: '/for/couples', label: 'Choosing a film as a couple' },
    ],
    cta: CTA,
  },
  {
    kind: 'compare',
    slug: 'letterboxd',
    title: 'WatchVerd1ct vs Letterboxd: An Honest Comparison',
    description:
      'Letterboxd is the best film community and diary on the internet. WatchVerd1ct is a decision engine for tonight. Where each one wins, explained without spin.',
    heading: 'WatchVerd1ct vs Letterboxd',
    standfirst: 'A beloved film diary, and a tool for ending the argument about what to watch.',
    status: 'published',
    updated: '2026-07-25',
    sections: [
      {
        heading: 'What Letterboxd does better',
        body: [
          'Letterboxd built something genuinely rare: a community of people who love film and write about it well. Its reviews have voice and wit, its lists are works of curation in their own right, and its diary makes logging what you watched feel like a pleasure rather than admin.',
          'For cinephiles, following critics and friends whose taste you have come to trust is a better recommendation system than most algorithms — because you know the person behind the opinion.',
        ],
        bullets: [
          'The best film-writing community on the web',
          'Outstanding lists, diary and year-in-review culture',
          'Social discovery through people whose taste you know',
        ],
      },
      {
        heading: 'Why people like WatchVerd1ct instead',
        body: [
          'Letterboxd is optimised for reflection — recording and discussing what you have already seen. WatchVerd1ct is optimised for the ten minutes before you press play, when a decision has to be made and nobody wants to scroll any further.',
          'It predicts a personal match, filters to what you can actually stream, respects hard constraints like "under two hours" or "no supernatural", and produces one recommendation with reasons rather than an endless feed to browse.',
        ],
        bullets: [
          'A decisive answer rather than a feed to browse',
          'Availability on your own services, filtered before ranking',
          'Group mode that works when four people want different things',
        ],
      },
      {
        heading: 'Who should skip WatchVerd1ct',
        body: [
          'If your pleasure comes from writing about films, building lists and being part of a community of critics, Letterboxd is doing something we are not attempting. We have no review culture and we are not building a social network.',
          'If you already have a group of friends whose recommendations you trust completely, a prediction engine adds less for you than it does for someone deciding alone or with a partner who likes different things.',
        ],
      },
      {
        heading: 'What WatchVerd1ct explains that a review cannot',
        body: [
          'A great review tells you what one thoughtful person thought. It cannot tell you whether this particular film clears your partner\'s hard limit on violence, fits the ninety minutes you actually have, and is available on a service you pay for.',
          'That is the specific work WatchVerd1ct does: it takes everything true about the title and everything true about your situation, and produces one answer with its reasoning shown.',
        ],
      },
    ],
    faq: [
      {
        question: 'Can I import my Letterboxd history?',
        answer:
          'Not yet. Import from Letterboxd, IMDb, Trakt and CSV is on the roadmap and it is the largest missing feature compared with established trackers. Today you build your profile by reacting to titles inside the app.',
      },
      {
        question: 'Does WatchVerd1ct have reviews?',
        answer:
          'No, and we are not planning to compete on review culture. We show critic and audience evidence with the source labelled, then explain how it interacts with your own taste profile.',
      },
      {
        question: 'Which should a serious film fan use?',
        answer:
          'Realistically both. Letterboxd for logging and community; WatchVerd1ct for the moment when a group has to agree on something in the next ten minutes.',
      },
    ],
    related: [
      { href: '/compare/imdb', label: 'WatchVerd1ct vs IMDb' },
      { href: '/compare/criticker', label: 'WatchVerd1ct vs Criticker' },
      { href: '/guides/how-viewer-dna-works', label: 'How Viewer DNA works' },
      { href: '/for/movie-night', label: 'Movie night without the argument' },
    ],
    cta: CTA,
  },
  {
    kind: 'compare',
    slug: 'criticker',
    title: 'WatchVerd1ct vs Criticker: Personalised Ratings',
    description:
      'Criticker pioneered taste-similarity scoring with its Probable Rating. WatchVerd1ct adds situation, availability and group decisions. A fair comparison of both.',
    heading: 'WatchVerd1ct vs Criticker',
    standfirst: 'Both reject the average rating. They disagree about what to do next.',
    status: 'published',
    updated: '2026-07-25',
    sections: [
      {
        heading: 'What Criticker does better',
        body: [
          'Criticker understood something important long before most of the industry: an average rating is close to useless, and what matters is what people with taste like yours thought. Its Probable Rating, computed from users whose rating history correlates with yours, is a genuinely good idea executed with rigour.',
          'For a dedicated user with hundreds of ratings logged, the predictions become sharp, and the transparency of the taste-similarity index is admirable. It is a serious tool for serious raters.',
        ],
        bullets: [
          'Taste-similarity scoring done properly, and early',
          'Very strong predictions once you have rated a lot',
          'Transparent, statistics-first philosophy',
        ],
      },
      {
        heading: 'Why people like WatchVerd1ct',
        body: [
          'Criticker asks you to invest first: the model needs a substantial rating history before it earns its accuracy. WatchVerd1ct is built to be useful on the first request, because a plain-English ask carries most of what is needed — media type, service, runtime, mood, who is watching.',
          'It also models things a pure rating-similarity engine does not: whether the title is available on your services tonight, whether it fits the time you have, and how it scores for each person in the room rather than for you alone.',
        ],
        bullets: [
          'Useful before you have rated anything, not after a hundred ratings',
          'Availability and runtime treated as hard constraints, not hints',
          'Household scoring that protects the least-served person',
        ],
      },
      {
        heading: 'Who should skip WatchVerd1ct',
        body: [
          'If you have already invested years into a Criticker rating history, that data is genuinely valuable and we currently have no import path for it. Starting over is a real cost and you should weigh it honestly.',
          'If you enjoy the statistical craft — tuning your taste-similarity circle, studying correlation — Criticker is built for that kind of attention. WatchVerd1ct deliberately hides its mathematics behind a decision.',
        ],
      },
      {
        heading: 'The difference in one sentence',
        body: [
          'Criticker predicts the rating you would give a film. WatchVerd1ct predicts whether you should press play on it tonight, given who is watching, how long you have and what you can actually stream.',
          'Both are personalisation. Only one of them is a decision.',
        ],
      },
    ],
    faq: [
      {
        question: 'Is Your Match the same as a Probable Rating?',
        answer:
          'They are cousins. Both predict personal enjoyment rather than crowd consensus. Your Match additionally weighs situational context and is presented alongside a Tonight Fit and a confidence level, so you can see how much to trust it.',
      },
      {
        question: 'Can I import my Criticker ratings?',
        answer:
          'Not currently. CSV import is the first planned import path, and it is openly listed as our biggest gap against established rating services.',
      },
      {
        question: 'How does WatchVerd1ct work without a long rating history?',
        answer:
          'Your request carries real constraints, and an optional short calibration round accelerates the profile. Confidence is displayed honestly, so an early prediction is never presented as more certain than it is.',
      },
    ],
    related: [
      { href: '/compare/imdb', label: 'WatchVerd1ct vs IMDb' },
      { href: '/guides/how-personalised-ratings-work', label: 'How personalised ratings work' },
      { href: '/guides/why-average-ratings-fail', label: 'Why average ratings fail' },
      { href: '/for/personalized-ratings', label: 'Personalised ratings, explained' },
    ],
    cta: CTA,
  },
  {
    kind: 'compare',
    slug: 'rottentomatoes',
    title: 'WatchVerd1ct vs Rotten Tomatoes Explained',
    description:
      'The Tomatometer measures critical consensus. It was never designed to predict what you will enjoy. Here is what each score actually means and when to use it.',
    heading: 'WatchVerd1ct vs Rotten Tomatoes',
    standfirst: 'A consensus meter and a personal prediction are not the same measurement.',
    status: 'published',
    updated: '2026-07-25',
    sections: [
      {
        heading: 'What Rotten Tomatoes does better',
        body: [
          'The Tomatometer is a genuinely useful instrument when you understand what it measures: the percentage of reviewing critics who were broadly positive. As a consensus signal it is fast, legible and hard to argue with.',
          'Aggregating professional criticism at that scale is real work, and the audience score alongside it gives a second, independent view. For "did this land with critics?", nothing is quicker.',
        ],
        bullets: [
          'The clearest single read on critical consensus',
          'Two independent signals: critics and audience',
          'Instantly understandable at a glance',
        ],
      },
      {
        heading: 'Why the percentage misleads people',
        body: [
          'The Tomatometer is not a quality score, though it is almost universally read as one. A film where every critic said "pleasant, forgettable, mildly recommended" can score higher than a divisive masterpiece that half of them disliked, because the meter counts thumbs rather than intensity.',
          'It also cannot know anything about you. Critical consensus and personal enjoyment correlate loosely at best, and for genre film — horror, romance, action comedy — they often diverge sharply.',
        ],
      },
      {
        heading: 'Why people like WatchVerd1ct',
        body: [
          'WatchVerd1ct treats critic and audience scores as evidence rather than as the answer. They feed a blended Watchability score, and that score is then weighed against your own taste profile to produce a personal prediction with its reasoning visible.',
          'Crucially, it tells you which parts of the evidence are strong and which are thin. A title with one rating source and unverified availability is presented as low confidence, not dressed up as certainty.',
        ],
        bullets: [
          'Multiple rating sources shown with their names, never merged silently',
          'Confidence explained from the evidence actually present',
          'A personal prediction, not a crowd percentage',
        ],
      },
      {
        heading: 'Who should skip WatchVerd1ct',
        body: [
          'If all you want is a fast sanity check before buying a cinema ticket, the Tomatometer does that in one second and WatchVerd1ct is more machinery than you need.',
          'If you actively enjoy critical writing and want to read the reviews behind the number, Rotten Tomatoes links you straight to them. We summarise evidence; we do not reproduce criticism.',
        ],
      },
    ],
    faq: [
      {
        question: 'Does WatchVerd1ct show the Tomatometer?',
        answer:
          'Yes, where it is available, clearly labelled and alongside the audience score and IMDb rating. Every source is named so you can see what the blended score is actually made of.',
      },
      {
        question: 'Why does a high Tomatometer sometimes get a low Your Match?',
        answer:
          'Because they measure different things. A critically acclaimed slow drama can be an excellent film and still be a poor match for someone whose profile shows a consistent preference for pace.',
      },
      {
        question: 'What if a title has no ratings at all?',
        answer:
          'We say so and mark confidence as low. We never invent a score, and a page about a title with no evidence and no availability is not allowed to publish at all.',
      },
    ],
    related: [
      { href: '/compare/imdb', label: 'WatchVerd1ct vs IMDb' },
      { href: '/guides/critics-vs-audiences', label: 'Critics vs audiences' },
      { href: '/guides/why-average-ratings-fail', label: 'Why average ratings fail' },
      { href: '/for/date-night', label: 'Picking a film for date night' },
    ],
    cta: CTA,
  },
];
