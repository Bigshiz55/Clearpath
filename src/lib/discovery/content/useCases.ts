import type { DiscoveryPage } from '../types';

/** USE-CASE PAGES (/for/[slug]) — the situations people actually search for. */

const CTA = { label: 'Get your personal Verd1ct', href: '/start' };

export const USE_CASE_PAGES: DiscoveryPage[] = [
  {
    kind: 'for',
    slug: 'couples',
    title: 'Movie Picker for Couples That Actually Works',
    description:
      'Stop scrolling for forty minutes. WatchVerd1ct scores every film for both of you, protects a real objection, and returns one film you will both be happy with.',
    heading: 'A movie picker for couples',
    standfirst: 'Two people, two sets of taste, one evening. This is the part most apps get wrong.',
    status: 'published',
    updated: '2026-07-25',
    sections: [
      {
        heading: 'Why people like it',
        body: [
          'Almost every recommendation system is built for one person. When two people watch together, the usual workaround is to average their profiles — which reliably produces a film neither of them actively wanted, because the average of "loves horror" and "cannot watch horror" is a lukewarm thriller nobody chose.',
          'WatchVerd1ct scores each title for each person separately and shows both numbers. The joint score leans on whoever is served least, so a film rated 96 for you and 38 for your partner is never presented as an excellent shared pick. It is presented as what it is: a great solo watch and a bad couple watch.',
        ],
        bullets: [
          'Both scores always visible — no hidden averaging',
          'A strong objection blocks a title rather than being diluted',
          'Fairness notes when one person picked last time',
        ],
      },
      {
        heading: 'How the shared decision works',
        body: [
          'You each get a Your Match prediction from your own Viewer DNA. WatchVerd1ct then computes a household score weighted toward the least-served person, and states plainly whether the pick is strong, workable, or a genuine mismatch.',
          'When it is a mismatch, it says so instead of hiding it. That single piece of honesty removes most of the argument, because the disagreement is now visible on screen rather than being something one person has to voice.',
        ],
      },
      {
        heading: 'Who should skip it',
        body: [
          'If you and your partner already have near-identical taste, a single-profile recommender will serve you nearly as well and with less setup.',
          'If part of the ritual is browsing together and talking about the options, a tool that hands you one answer removes something you enjoy. Some couples want the deliberation, not the verdict.',
        ],
      },
      {
        heading: 'Constraints it takes seriously',
        body: [
          'Runtime, streaming service, media type and content limits are treated as hard requirements, not preferences to be balanced away by a high score. If you asked for under two hours on Netflix, nothing longer and nothing elsewhere will appear.',
          'When only two titles genuinely satisfy everything, WatchVerd1ct shows two and says so, rather than padding the list to look complete.',
        ],
      },
    ],
    faq: [
      {
        question: 'Do we both need accounts?',
        answer:
          'No. One account is enough to start, and a second person can join a shared Court room with just a display name. Saved profiles make future picks sharper, but nothing is gated behind registration.',
      },
      {
        question: 'What if one of us hates a genre?',
        answer:
          'Mark it as an objection. A vetoed title cannot win the group decision while that objection stands, no matter how highly it scores for the other person.',
      },
      {
        question: 'Can more than two people use it?',
        answer:
          'Yes. The same floor-weighted scoring works for families and friend groups, and every participant sees their own number alongside the joint result.',
      },
    ],
    related: [
      { href: '/for/date-night', label: 'Date night films' },
      { href: '/for/families', label: 'Family movie night' },
      { href: '/guides/how-court-works', label: 'How group decisions work' },
      { href: '/compare/letterboxd', label: 'WatchVerd1ct vs Letterboxd' },
    ],
    cta: CTA,
  },
  {
    kind: 'for',
    slug: 'families',
    title: 'Family Movie Night Picker Everyone Agrees On',
    description:
      'Find a film that suits every age in the room. Hard content limits, runtime that fits bedtime, and a joint score that protects the youngest viewer.',
    heading: 'Family movie night, decided',
    standfirst: 'Different ages, different limits, one film — before anyone loses interest.',
    status: 'published',
    updated: '2026-07-25',
    sections: [
      {
        heading: 'Why people like it',
        body: [
          'Family viewing has hard edges that most recommendation engines treat as soft suggestions. A content limit is not a preference to be outweighed by a high rating — it is a rule, and a system that breaks it once loses trust permanently.',
          'WatchVerd1ct validates every candidate against those rules before ranking begins. Anything that fails is removed rather than demoted, so nothing inappropriate can surface because it happened to score well.',
        ],
        bullets: [
          'Content limits enforced as rules, not weighted preferences',
          'Runtime that actually fits the time before bedtime',
          'Every family member scored, with the youngest protected',
        ],
      },
      {
        heading: 'The Family Movie Night flow',
        body: [
          'Ask in plain English — "family movie night, under two hours, nothing scary" — and the request is parsed into structured constraints you can see and correct. Adjust the sliders and press Update results; the ranking recomputes and any title that no longer qualifies disappears.',
          'When the same film survives your new filters, WatchVerd1ct says why it is still the strongest match, rather than leaving you wondering whether the filters did anything at all.',
        ],
      },
      {
        heading: 'Who should skip it',
        body: [
          'If you rely on a curated children\'s service that already restricts its whole catalogue to age-appropriate titles, much of this work is done for you inside that app.',
          'For detailed, scene-by-scene parental guidance, a dedicated content-advisory service goes deeper than we do. We enforce the limits you set; we do not publish our own age ratings.',
        ],
      },
      {
        heading: 'Honest about availability',
        body: [
          'Nothing is worse than agreeing on a film and then discovering it is not on any service you have. Availability is filtered before ranking, and where our listings source cannot verify it, the interface says "availability unconfirmed" rather than guessing.',
        ],
      },
    ],
    faq: [
      {
        question: 'Can I block specific content permanently?',
        answer:
          'Yes. Exclusions you set as preferences persist, while anything you choose for one evening applies only to that request and never alters your saved profile.',
      },
      {
        question: 'Does it know age ratings?',
        answer:
          'It uses the certification and content signals available from our data sources and applies your stated limits strictly. For detailed scene-level guidance, use a dedicated parental advisory service alongside it.',
      },
      {
        question: 'What if nothing matches?',
        answer:
          'It tells you honestly that fewer titles qualified than you asked for, and offers the specific constraint to relax. It never fills the gap with titles that break your rules.',
      },
    ],
    related: [
      { href: '/for/couples', label: 'Movie picker for couples' },
      { href: '/for/movie-night', label: 'Movie night, decided' },
      { href: '/discover/movies-under-90-minutes', label: 'Films under 90 minutes' },
      { href: '/guides/how-court-works', label: 'How group decisions work' },
    ],
    cta: CTA,
  },
  {
    kind: 'for',
    slug: 'date-night',
    title: 'Date Night Movie Picker: One Good Answer',
    description:
      'A film you will both enjoy, on a service you already have, in the time you actually have. No forty-minute scroll and no compromise nobody wanted.',
    heading: 'Date night, sorted in a minute',
    standfirst: 'The evening is short. The scrolling should be shorter.',
    status: 'published',
    updated: '2026-07-25',
    sections: [
      {
        heading: 'Why people like it',
        body: [
          'The failure mode of date night is not a shortage of films — it is that browsing is itself the thing that ruins the mood. Forty minutes of scrolling turns a relaxed evening into a negotiation, and by the time something is chosen nobody is excited about it.',
          'WatchVerd1ct is built to end that in one exchange. Say what you are in the mood for, who is watching and how long you have, and it returns one recommendation with its reasoning — plus a small number of alternatives if the first does not appeal.',
        ],
        bullets: [
          'One decisive answer instead of an endless grid',
          'Both people scored, with disagreement made visible',
          'Runtime respected so the evening does not overrun',
        ],
      },
      {
        heading: 'What makes a good date-night pick',
        body: [
          'It has to clear both people\'s limits, fit the time available, be genuinely available to stream, and — the part algorithms usually miss — not require enormous concentration if the point of the evening is the company.',
          'Tonight Fit exists for exactly this. A film can be an excellent long-term match for your taste and still be the wrong choice for tonight, and WatchVerd1ct separates those two judgements instead of collapsing them into one number.',
        ],
      },
      {
        heading: 'Who should skip it',
        body: [
          'If you already have a shortlist you are both happy with, you do not need a decision engine — you need to press play.',
          'If you like discovering things by wandering through a catalogue with no particular goal, a tool designed to end the search quickly is working against what you enjoy.',
        ],
      },
      {
        heading: 'Why it explains itself',
        body: [
          'Every recommendation shows why it rose, what held it back and how confident the system is. A pick you can see the reasoning for is much easier to agree to than a mysterious suggestion from a black box.',
        ],
      },
    ],
    faq: [
      {
        question: 'How long does it take?',
        answer:
          'One request. Type what you want in plain English and you get a recommendation with reasons — typically faster than opening two streaming apps.',
      },
      {
        question: 'Can I exclude anything we have already seen?',
        answer:
          'Yes. Titles you mark as watched are excluded from future recommendations, and "not tonight" hides something for this evening without recording it as a dislike.',
      },
      {
        question: 'What if we disagree?',
        answer:
          'The interface shows both scores and flags a genuine mismatch rather than hiding it. Seeing the disagreement on screen usually settles it faster than arguing about it.',
      },
    ],
    related: [
      { href: '/for/couples', label: 'Movie picker for couples' },
      { href: '/discover/fast-thrillers', label: 'Thrillers worth your evening' },
      { href: '/guides/how-viewer-dna-works', label: 'How Viewer DNA works' },
      { href: '/compare/rottentomatoes', label: 'WatchVerd1ct vs Rotten Tomatoes' },
    ],
    cta: CTA,
  },
  {
    kind: 'for',
    slug: 'movie-night',
    title: 'What Should I Watch Tonight? Get One Answer',
    description:
      'Thousands of titles, one Verd1ct. Tell WatchVerd1ct your mood, your services and who is watching, and get a decision with the reasoning shown.',
    heading: 'What should I watch tonight?',
    standfirst: 'The question everyone asks, answered in one request instead of forty minutes.',
    status: 'published',
    updated: '2026-07-25',
    sections: [
      {
        heading: 'Why people like it',
        body: [
          'The modern problem is not scarcity, it is paralysis. Six subscriptions and tens of thousands of titles produce a decision cost so high that people give up and rewatch something familiar — which is a strange outcome for an industry built on new work.',
          'WatchVerd1ct removes the browsing step. You describe what you want the way you would describe it to a friend, and it returns a recommendation that satisfies your constraints, explains itself and tells you where to watch it.',
        ],
        bullets: [
          'Plain-English requests, not filter menus',
          'Hard constraints honoured exactly as stated',
          'One answer with reasoning, plus a couple of alternatives',
        ],
      },
      {
        heading: 'How the decision is made',
        body: [
          'Your request is parsed into a structured plan — media type, services, runtime, mood, exclusions, how many results you want. Candidates are retrieved, then every one is validated against the hard parts of that plan before any ranking happens.',
          'Only valid candidates are ranked, using your Viewer DNA and the situation you described. If fewer titles qualify than you asked for, you are told honestly rather than shown filler.',
        ],
      },
      {
        heading: 'Who should skip it',
        body: [
          'If you only ever watch one service and are happy with its own recommendations, that is a perfectly reasonable setup and this adds little.',
          'If you find browsing relaxing, an engine designed to finish the search quickly is solving a problem you do not have.',
        ],
      },
      {
        heading: 'Thousands of titles. One Verd1ct.',
        body: [
          'That is the whole promise, and it is deliberately narrow. WatchVerd1ct is not trying to be a database, a social network or a review site. It exists to end the search with something you are actually glad you watched.',
        ],
      },
    ],
    faq: [
      {
        question: 'Do I need an account to try it?',
        answer:
          'No. You can make a request and get a real answer before signing up. An account exists so your Viewer DNA persists and future recommendations get sharper.',
      },
      {
        question: 'Which streaming services are supported?',
        answer:
          'All the major subscription services plus free ad-supported ones, using availability data from our listings source for your region. Availability we cannot verify is labelled as unconfirmed rather than assumed.',
      },
      {
        question: 'Can it handle very specific requests?',
        answer:
          'Yes — things like "three movies on Netflix under 100 minutes with no supernatural content" are parsed into exact constraints, and every result is validated against them before it is shown.',
      },
    ],
    related: [
      { href: '/for/couples', label: 'Movie picker for couples' },
      { href: '/for/families', label: 'Family movie night' },
      { href: '/discover/movies-for-couples', label: 'Films for two people' },
      { href: '/guides/how-watchverd1ct-works', label: 'How WatchVerd1ct works' },
    ],
    cta: CTA,
  },
  {
    kind: 'for',
    slug: 'personalized-ratings',
    title: 'Personalised Movie Ratings Built From Your Taste',
    description:
      'A rating that predicts what you will enjoy, not what the average viewer thought. How Your Match is built, what it uses, and how confident it really is.',
    heading: 'Personalised ratings, not crowd averages',
    standfirst: 'The same film can be a 9 for you and a 4 for the person beside you. One number cannot say both.',
    status: 'published',
    updated: '2026-07-25',
    sections: [
      {
        heading: 'Why people like it',
        body: [
          'A crowd average answers a question you never asked. You do not want to know what the median viewer thought — you want to know what you will think, and those two numbers can be wildly different for exactly the films where the decision is hardest.',
          'Your Match is a prediction of your enjoyment, built from your reactions across interpretable traits: pace, tone, humour, darkness, complexity, ending preference, runtime tolerance and more. Because the traits are readable, the prediction can explain itself.',
        ],
        bullets: [
          'A prediction for you, not a summary of everyone else',
          'Built from interpretable traits you can inspect and correct',
          'Confidence stated honestly instead of implied',
        ],
      },
      {
        heading: 'How the profile is built',
        body: [
          'Every reaction is a signal, and they are not all equal. Liking a title, dismissing it for tonight, and never wanting to see it again mean three different things, and collapsing them into one thumbs-down would teach the model something false.',
          'An optional short calibration round accelerates the profile early on, and you can inspect what has been inferred about your taste and correct anything that is wrong.',
        ],
      },
      {
        heading: 'Who should skip it',
        body: [
          'If you deliberately want the crowd view — because you are choosing for a group of strangers, or you simply enjoy the consensus — a personalised score is the wrong instrument.',
          'If you are unwilling to react to anything, the model has little to work with. Early predictions lean on your request rather than your history, and the interface says so.',
        ],
      },
      {
        heading: 'Why confidence matters more than precision',
        body: [
          'Any system can print a number. The harder and more honest thing is saying how much that number should be trusted, and WatchVerd1ct derives confidence from the evidence actually present: how much taste signal exists, how many independent rating sources agree, and whether availability is verified.',
          'Low confidence is shown as low confidence. We would rather be trusted than look clever.',
        ],
      },
    ],
    faq: [
      {
        question: 'How many titles must I rate?',
        answer:
          'None to start. Predictions improve steadily as you react, and the confidence indicator tells you when the profile is thin rather than pretending otherwise.',
      },
      {
        question: 'Can I see and edit what it learned?',
        answer:
          'Yes. Your DNA view lists your strongest preferences and aversions with the evidence behind them, and every inferred trait can be corrected or removed.',
      },
      {
        question: 'Is my rating history private?',
        answer:
          'Yes. Your profile is yours, protected by row-level security, and it is never exposed publicly. Public pages on this site contain no personal data.',
      },
    ],
    related: [
      { href: '/guides/how-personalised-ratings-work', label: 'How personalised ratings work' },
      { href: '/guides/why-average-ratings-fail', label: 'Why average ratings fail' },
      { href: '/compare/criticker', label: 'WatchVerd1ct vs Criticker' },
      { href: '/for/movie-night', label: 'What should I watch tonight?' },
    ],
    cta: CTA,
  },
];
