import type { DiscoveryPage } from '../types';

/** GUIDE PAGES (/guides/[slug]) — long-form educational content. */

const CTA = { label: 'Get your personal Verd1ct', href: '/start' };

export const GUIDE_PAGES: DiscoveryPage[] = [
  {
    kind: 'guide',
    slug: 'why-average-ratings-fail',
    title: 'Why Average Movie Ratings Fail You',
    description:
      'A 7.4 tells you almost nothing about whether you will enjoy a film. Here is what averaging destroys, and what to measure instead of crowd consensus.',
    heading: 'Why average ratings fail',
    standfirst: 'The most-used number in film is answering a question nobody asked.',
    status: 'published',
    updated: '2026-07-25',
    sections: [
      {
        heading: 'The information an average throws away',
        body: [
          'When thousands of opinions are collapsed into one number, the most useful part is discarded: the shape of the disagreement. A film rated 7.0 because almost everyone found it fine, and a film rated 7.0 because half the audience adored it while the other half switched off, are radically different propositions — and the average cannot distinguish them.',
          'For the second film, the only question that matters is which half you belong to. That is precisely the question an average is structurally incapable of answering.',
        ],
      },
      {
        heading: 'Why people like averages anyway',
        body: [
          'Averages are not worthless, and it is worth being fair to them. They are fast, comparable across titles, resistant to manipulation at scale, and they genuinely do identify the extremes: something rated 2.1 by fifty thousand people is almost certainly bad.',
          'The failure is in the middle, which is where nearly every real decision happens. Between 6.5 and 7.8 sits most of what you might actually watch tonight, and in that band the average has almost no discriminating power for an individual.',
        ],
        bullets: [
          'Excellent at identifying the genuinely terrible',
          'Comparable across a whole catalogue',
          'Nearly useless in the middle band, where decisions happen',
        ],
      },
      {
        heading: 'Where averages lose you',
        body: [
          'Genre pulls scores in ways that have nothing to do with quality. Horror and romantic comedy are rated systematically lower than prestige drama by general audiences, because the people rating them include many who do not enjoy the genre at all. If you love horror, the average is actively misleading.',
          'Timing distorts too. Scores drift as a film ages, early ratings skew toward fans, and a beloved cult film may have been mediocre by consensus on release.',
        ],
      },
      {
        heading: 'What to measure instead',
        body: [
          'The useful question is conditional: what did people whose taste resembles mine think? That single change turns a popularity measure into a prediction, and it is the idea behind taste-similarity scoring.',
          'WatchVerd1ct goes one step further by adding the situation. Your Match predicts long-term enjoyment; Tonight Fit predicts whether it suits this evening, this group and this much time. Keeping them separate matters, because a film can be a great match for you and a poor choice for tonight.',
        ],
        bullets: [
          'Condition on taste similarity, not the whole crowd',
          'Separate long-term fit from tonight\'s fit',
          'State confidence instead of implying precision',
        ],
      },
      {
        heading: 'Who should skip personalisation',
        body: [
          'If you are choosing for a mixed group of strangers — a party, a classroom, a flight — crowd consensus is genuinely the right instrument, because the safest broadly-acceptable choice is what you need.',
          'And if you enjoy the ritual of arguing about a shared number, personalisation removes something social. Not every problem needs solving.',
        ],
      },
    ],
    faq: [
      {
        question: 'Are averages useless?',
        answer:
          'No. They are good at identifying genuinely bad films and useful as one piece of evidence. They are weak exactly where most decisions happen, in the crowded middle of the scale.',
      },
      {
        question: 'What is a taste-similarity score?',
        answer:
          'A prediction built from users whose rating history correlates with yours, rather than from everyone. Criticker pioneered the approach and WatchVerd1ct builds on the same principle with added situational context.',
      },
      {
        question: 'Does WatchVerd1ct still show average ratings?',
        answer:
          'Yes, as labelled evidence from named sources. They inform the general Watchability score but never override your personal prediction.',
      },
    ],
    related: [
      { href: '/guides/how-personalised-ratings-work', label: 'How personalised ratings work' },
      { href: '/guides/critics-vs-audiences', label: 'Critics vs audiences' },
      { href: '/compare/imdb', label: 'WatchVerd1ct vs IMDb' },
      { href: '/for/personalized-ratings', label: 'Personalised ratings' },
    ],
    cta: CTA,
  },
  {
    kind: 'guide',
    slug: 'how-personalised-ratings-work',
    title: 'How Personalised Movie Ratings Actually Work',
    description:
      'Taste similarity, content traits and situational context explained without jargon — and an honest account of where personalised prediction still breaks down.',
    heading: 'How personalised ratings work',
    standfirst: 'Three different techniques, each good at something the others are not.',
    status: 'published',
    updated: '2026-07-25',
    sections: [
      {
        heading: 'Collaborative filtering: people like you',
        body: [
          'The oldest and still one of the strongest ideas: find users whose ratings correlate with yours, then predict your score from theirs. It requires no understanding of the films themselves, which is its great strength — it discovers connections no genre taxonomy would ever encode.',
          'Its weakness is the cold start. A new user has nothing to correlate against, and a new film has too few ratings to place. It is excellent once it has data and helpless before then.',
        ],
      },
      {
        heading: 'Content traits: what the film is actually like',
        body: [
          'The complementary approach describes each title along interpretable axes — pace, tone, humour, darkness, structural complexity, ending type, violence, supernatural content — and learns which axes you respond to.',
          'This works from the very first reaction and, crucially, it can explain itself. "You tend to avoid slow-burn films" is a statement a person can verify and correct, which a latent factor in a matrix never can be.',
        ],
        bullets: [
          'Works immediately, without a rating history',
          'Explainable in ordinary language',
          'Correctable by the user when it gets something wrong',
        ],
      },
      {
        heading: 'Why people like the combination',
        body: [
          'WatchVerd1ct computes a deterministic Watchability score from external evidence first, then adjusts toward your trait profile within a bounded range. The bound matters: personalisation refines the evidence rather than replacing it, so a genuinely poor film cannot be promoted to excellent by taste alone.',
          'On top of that sits situation — who is watching, how long you have, what you can stream. This is where most recommenders stop and where most real decisions are actually made.',
        ],
      },
      {
        heading: 'Who should skip prediction, and where it breaks',
        body: [
          'Personalised prediction is weakest exactly where people are least predictable: mood-driven choices, novelty seeking, and films far outside anything you have watched before. A model built on your history is structurally conservative and will under-value the genuinely surprising.',
          'It also cannot know that you had a hard day and want something undemanding, unless you say so. That is why plain-English requests carry real weight in the ranking rather than being decoration.',
        ],
      },
      {
        heading: 'Confidence, stated honestly',
        body: [
          'Every prediction carries a confidence level derived from the evidence actually present: how much taste signal exists, how many independent rating sources agree, and whether availability is verified. Thin evidence produces low confidence, shown plainly.',
          'A system that always sounds certain is easy to build and impossible to trust.',
        ],
      },
    ],
    faq: [
      {
        question: 'Is this machine learning?',
        answer:
          'The core scoring is deterministic and testable. Language understanding uses a model to parse requests, and content traits are classified once per title and cached. Every result is validated against your hard constraints regardless.',
      },
      {
        question: 'Why is my prediction sometimes wrong?',
        answer:
          'Mood, novelty and unusual titles are genuinely hard. Telling the system it got a prediction wrong is one of the most valuable signals you can give it.',
      },
      {
        question: 'Can I see the traits it learned?',
        answer:
          'Yes — your DNA view shows strongest preferences and aversions with the evidence behind each, and lets you correct anything inaccurate.',
      },
    ],
    related: [
      { href: '/guides/why-average-ratings-fail', label: 'Why average ratings fail' },
      { href: '/guides/how-viewer-dna-works', label: 'How Viewer DNA works' },
      { href: '/compare/criticker', label: 'WatchVerd1ct vs Criticker' },
      { href: '/for/personalized-ratings', label: 'Personalised ratings' },
    ],
    cta: CTA,
  },
  {
    kind: 'guide',
    slug: 'how-viewer-dna-works',
    title: 'How Viewer DNA Works in WatchVerd1ct',
    description:
      'Your Viewer DNA is a readable profile across interpretable traits — not a black box. What it stores, how it learns, and how to correct it when it is wrong.',
    heading: 'How Viewer DNA works',
    standfirst: 'A taste profile you can read, question and correct.',
    status: 'published',
    updated: '2026-07-25',
    sections: [
      {
        heading: 'What it is',
        body: [
          'Viewer DNA is a profile of your taste across interpretable dimensions: pace, tone, humour, emotional intensity, darkness, structural complexity, predictability, ending preference, runtime tolerance, language and era preferences, and comfort-viewing tendency.',
          'Every dimension is readable. That is a deliberate design constraint rather than a technical limitation — a profile you cannot read is a profile you cannot correct, and an uncorrectable model compounds its own mistakes forever.',
        ],
      },
      {
        heading: 'Why people like it',
        body: [
          'Because it explains itself. When a recommendation appears, you can see which traits pushed it up and which held it back, and decide whether you agree with the reasoning rather than simply accepting or rejecting a number.',
          'It also separates the permanent from the temporary. Wanting a comedy tonight is not the same as being someone who prefers comedies, and conflating those two is how recommendation systems slowly drift away from who you actually are.',
        ],
        bullets: [
          'Readable traits instead of opaque latent factors',
          'Temporary context never rewrites your permanent profile',
          'Every inferred trait can be corrected or removed',
        ],
      },
      {
        heading: 'How it learns',
        body: [
          'Reactions carry different meanings and are treated differently. Marking something as not for tonight changes nothing permanent. Saying you never want to see it again is a strong, lasting signal. Watching something to completion says more than saving it and never returning.',
          'Optional reason chips sharpen this further: "too slow" teaches something specific about pace, which is far more useful than a bare dislike.',
        ],
      },
      {
        heading: 'Who should skip it',
        body: [
          'If you would rather not have a profile built at all, you can use plain-English requests without one — your stated constraints still drive the results, they simply are not personalised.',
          'If you share one account across a household with very different tastes, a single profile blurs. Use separate people in a Court room instead, so each person is scored individually.',
        ],
      },
      {
        heading: 'Confidence and honesty',
        body: [
          'The system reports how confident it is per dimension. Early on, most dimensions have thin evidence, and the interface says so instead of projecting false authority.',
          'Your DNA is private, protected by row-level security, and never appears on any public page.',
        ],
      },
    ],
    faq: [
      {
        question: 'Does a temporary preference change my DNA?',
        answer:
          'No. Tonight-only choices are stored separately from your permanent profile and are never written into it unless you deliberately save them.',
      },
      {
        question: 'Can I reset my profile?',
        answer:
          'Yes. Individual traits can be corrected or removed, and the whole profile can be cleared from your account settings.',
      },
      {
        question: 'Is my DNA shared with anyone?',
        answer:
          'No. It is protected by row-level security and used only to generate your own recommendations. Public pages contain no personal data of any kind.',
      },
    ],
    related: [
      { href: '/guides/how-personalised-ratings-work', label: 'How personalised ratings work' },
      { href: '/guides/how-court-works', label: 'How group decisions work' },
      { href: '/for/personalized-ratings', label: 'Personalised ratings' },
      { href: '/compare/letterboxd', label: 'WatchVerd1ct vs Letterboxd' },
    ],
    cta: CTA,
  },
  {
    kind: 'guide',
    slug: 'how-court-works',
    title: 'How Group Movie Decisions Work in Court',
    description:
      'Court scores a film for every person in the room, protects a genuine objection, and returns one Verd1ct. Why averaging group taste is the wrong answer.',
    heading: 'How Court decides for a group',
    standfirst: 'Averaging two people\'s taste produces a film neither of them chose.',
    status: 'published',
    updated: '2026-07-25',
    sections: [
      {
        heading: 'The problem with averaging',
        body: [
          'Take a film scoring 96 for one person and 38 for another. The average is 67 — a respectable-looking number that describes nobody\'s experience. One person will love it and the other will endure it, and the system has quietly decided that is acceptable.',
          'Now take a film scoring 74 and 70. The average is lower, yet it is obviously the better group choice. Any system ranking by average gets this exactly backwards.',
        ],
      },
      {
        heading: 'Why people like floor-weighted scoring',
        body: [
          'Court ranks by a score weighted toward whoever is served least. A title only scores well for the group when it works for everyone, which is the actual definition of a good shared pick.',
          'Every individual score stays visible. Nobody has to argue their case from memory — the disagreement is on the screen, which turns out to remove most of the friction by itself.',
        ],
        bullets: [
          'The joint score leans on the least-served person',
          'All individual scores stay visible',
          'A wide split is flagged as a mismatch, not hidden',
        ],
      },
      {
        heading: 'Reactions that mean different things',
        body: [
          'Court separates four responses. FOR means you actively want it. MAYBE means you would accept it. PASS means not tonight, and is never recorded as a permanent dislike. VETO is a strong objection, and a vetoed title cannot win while that objection stands.',
          'Collapsing these into likes and dislikes would destroy the information that makes the group decision work.',
        ],
      },
      {
        heading: 'Who should skip it',
        body: [
          'For two people with near-identical taste, the ceremony is unnecessary — a normal search will serve you fine.',
          'If your group enjoys the debate, a tool that shortens it to one answer is removing part of the evening you actually like.',
        ],
      },
      {
        heading: 'Honest about incomplete participation',
        body: [
          'If someone has not reacted yet, the result says so — "Verd1ct based on 3 of 4 participants" — rather than silently pretending everyone responded. If every option has been vetoed, it says that too, instead of promoting something the room already rejected.',
        ],
      },
    ],
    faq: [
      {
        question: 'How many people can join?',
        answer:
          'Up to eight in one room. Everyone joins with a display name and no account is required.',
      },
      {
        question: 'Does a veto ban a film forever?',
        answer:
          'No. A veto applies to the current decision only. Marking something as never recommend is a separate, deliberate action.',
      },
      {
        question: 'What if we do not like the result?',
        answer:
          'Appeal. The winner is excluded and the next strongest option is calculated, keeping every participant, preference and reaction intact.',
      },
    ],
    related: [
      { href: '/for/couples', label: 'Movie picker for couples' },
      { href: '/for/families', label: 'Family movie night' },
      { href: '/guides/how-viewer-dna-works', label: 'How Viewer DNA works' },
      { href: '/for/movie-night', label: 'What should I watch tonight?' },
    ],
    cta: CTA,
  },
  {
    kind: 'guide',
    slug: 'critics-vs-audiences',
    title: 'Critics vs Audiences: Which Score to Trust',
    description:
      'Critic and audience scores disagree in predictable ways. Which one predicts your enjoyment better depends on genre, and here is how to read the gap.',
    heading: 'Critics vs audiences',
    standfirst: 'When the two scores disagree, the gap itself is the useful information.',
    status: 'published',
    updated: '2026-07-25',
    sections: [
      {
        heading: 'What each score actually measures',
        body: [
          'A critic score aggregates people who watch enormous numbers of films professionally. That expertise brings real value — craft, structure, originality, context within a director\'s work — and a real bias: critics have seen the familiar formula hundreds of times and are wearier of it than you are.',
          'An audience score aggregates people who chose to watch, which means it is drawn largely from the film\'s target market. It measures satisfaction rather than craft.',
        ],
      },
      {
        heading: 'Why people like reading the gap',
        body: [
          'When critics score much higher than audiences, the film is usually formally accomplished but demanding — slow, ambiguous, or emotionally difficult. When audiences score much higher, it usually delivers exactly what its genre promises without doing anything new.',
          'Neither pattern is bad. Which one suits you depends entirely on what you want from the evening, and the gap tells you which kind of film you are looking at more reliably than either number alone.',
        ],
        bullets: [
          'Critics high, audience low: accomplished but demanding',
          'Audience high, critics low: satisfying genre delivery',
          'Both high: broad appeal, usually a safe group pick',
        ],
      },
      {
        heading: 'Where both scores lose you',
        body: [
          'Neither knows anything about you, your evening, or who is on the sofa. Both are summaries of other people, and for genre film in particular they can point in opposite directions from your actual enjoyment.',
          'They also say nothing about availability, runtime or whether the person beside you can tolerate the content — the practical constraints that decide most viewing.',
        ],
      },
      {
        heading: 'Who should skip aggregate scores entirely',
        body: [
          'If you are choosing for yourself and you already know your own taste well, both numbers can actively mislead you. Someone who loves a genre that critics routinely dismiss will be steered wrong by the critic score and only loosely helped by the audience one.',
          'And if avoiding spoilers matters to you, aggregate pages are risky territory — the surrounding review excerpts frequently give away more than the numbers do.',
        ],
      },
      {
        heading: 'How WatchVerd1ct uses both',
        body: [
          'Both are shown with their sources named, and both feed the blended Watchability score. That score is evidence, not a verdict: it is then weighed against your own taste profile to produce a personal prediction with visible reasoning.',
          'Where only one source exists, confidence drops and the interface says so rather than presenting a single number as consensus.',
        ],
      },
    ],
    faq: [
      {
        question: 'Which score should I trust more?',
        answer:
          'For craft and originality, critics. For genre satisfaction, audiences. For whether you personally will enjoy it tonight, neither — that is what a personalised prediction is for.',
      },
      {
        question: 'Why does WatchVerd1ct blend them?',
        answer:
          'Because they measure different real things and both are evidence. The blend is transparent, every source is named, and it never overrides your personal match.',
      },
      {
        question: 'What if a film has no critic score?',
        answer:
          'We show what exists, lower the confidence accordingly, and say so. We never fabricate a score to fill a gap.',
      },
    ],
    related: [
      { href: '/compare/rottentomatoes', label: 'WatchVerd1ct vs Rotten Tomatoes' },
      { href: '/guides/why-average-ratings-fail', label: 'Why average ratings fail' },
      { href: '/compare/imdb', label: 'WatchVerd1ct vs IMDb' },
      { href: '/for/movie-night', label: 'What should I watch tonight?' },
    ],
    cta: CTA,
  },
  {
    kind: 'guide',
    slug: 'how-watchverd1ct-works',
    title: 'How WatchVerd1ct Works, Step by Step',
    description:
      'From a plain-English request to one Verd1ct: how constraints are parsed, candidates validated, results ranked, and why nothing invalid is ever shown.',
    heading: 'How WatchVerd1ct works',
    standfirst: 'Thousands of titles in, one Verd1ct out — and every step is visible.',
    status: 'published',
    updated: '2026-07-25',
    sections: [
      {
        heading: 'One: your request becomes a plan',
        body: [
          'You type what you want the way you would say it aloud. That sentence is parsed into a structured plan: media type, how many results, which services, runtime limits, language and audio requirements, exclusions, and who is watching.',
          'The plan is shown back to you so you can see exactly how the request was understood, and correct it in one tap if anything was misread.',
        ],
      },
      {
        heading: 'Two: hard constraints are separated from preferences',
        body: [
          'Some parts of a request are rules and some are inclinations. "On Netflix", "movies only", "under two hours", "no supernatural" are rules. "Something funny", "a bit like Sherlock" are inclinations that shape ranking.',
          'Confusing the two is the single most common failure in recommendation products, and it is why people stop trusting them. A rule that gets quietly relaxed to fill a results grid is a broken promise.',
        ],
        bullets: [
          'Rules are enforced absolutely',
          'Preferences influence ranking only',
          'A rule is never relaxed silently to pad results',
        ],
      },
      {
        heading: 'Why people like this order of operations',
        body: [
          'Most recommendation products rank first and filter afterwards, which is why a highly-rated title that breaks your stated rules so often slips through. Doing it the other way round costs a little performance and buys the one thing that matters: you can trust what you are shown.',
          'It also makes honest shortfalls possible. Because validation happens before ranking, the system knows exactly how many titles genuinely qualified and can say so instead of padding the list.',
        ],
      },
      {
        heading: 'Three: validate before ranking',
        body: [
          'Candidates are retrieved, then every one is checked against every hard constraint before any ranking happens. Anything that fails is removed, not demoted — so no score, however high, can push an invalid result onto your screen.',
          'A final gate re-checks the results immediately before rendering. It is deliberately redundant, because this is the guarantee the whole product rests on.',
        ],
      },
      {
        heading: 'Four: rank, explain, and admit shortfalls',
        body: [
          'Valid candidates are ranked using your Viewer DNA and the situation you described, and each result explains why it rose, what held it back, which requirements were checked, and how confident the system is.',
          'If you asked for three and only two qualify, you are shown two and told why. Padding the third with something that breaks your constraints would be the easy choice and the wrong one.',
        ],
      },
      {
        heading: 'Who should skip WatchVerd1ct',
        body: [
          'If you enjoy browsing, or you watch one service and trust its own suggestions, this is more machinery than you need.',
          'If you want a film database or a review community, other products do those jobs better and we are not trying to displace them.',
        ],
      },
    ],
    faq: [
      {
        question: 'Do I need an account?',
        answer:
          'No. You can make a request and get a real answer immediately. An account persists your Viewer DNA so recommendations improve over time.',
      },
      {
        question: 'What happens if nothing matches?',
        answer:
          'You are told honestly, with the specific constraint that is blocking results and a way to relax it. You are never shown invalid filler.',
      },
      {
        question: 'How is availability verified?',
        answer:
          'From our listings data source for your region, labelled with a confidence level. Where availability cannot be confirmed, it is marked unconfirmed rather than assumed.',
      },
    ],
    related: [
      { href: '/guides/how-viewer-dna-works', label: 'How Viewer DNA works' },
      { href: '/guides/how-court-works', label: 'How group decisions work' },
      { href: '/for/movie-night', label: 'What should I watch tonight?' },
      { href: '/compare/imdb', label: 'WatchVerd1ct vs IMDb' },
    ],
    cta: CTA,
  },
];
