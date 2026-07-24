/**
 * Seed data — CLEARLY LABELED DEMONSTRATION DATA.
 *
 * Every record has provenance.isDemo === true. The UI renders a "DEMO" badge
 * wherever these appear. Nothing here is real production information; it exists
 * so the command center is fully explorable before real adapters are connected.
 */
import type {
  ApprovalRequest,
  AuditEvent,
  Campaign,
  CostSnapshot,
  CustomerFeedback,
  DeploymentRecord,
  Experiment,
  FunnelDay,
  FunnelStepKey,
  IncidentRecord,
  Observation,
  Opportunity,
  Plan,
  Provenance,
  ProductId,
  PullRequestRecord,
  Recommendation,
  RevenueSnapshot,
  ScheduledJob,
} from "@/lib/types";

const NOW = "2026-07-24T13:00:00.000Z";

function demo(source: string, product: ProductId | "shared", confidence = 0.7, sourceUrl?: string): Provenance {
  return { source, sourceUrl: sourceUrl ?? null, product, collectedAt: NOW, confidence, isDemo: true };
}

// ── Funnel days (14 days each) ───────────────────────────────────────────────
// Deterministic pseudo-data; a clear leak at dna_started -> dna_completed for WV.
function makeFunnelDays(product: ProductId, base: number, dnaLeak: number): FunnelDay[] {
  const order: FunnelStepKey[] = [
    "impression", "click", "landing_visit", "signup", "dna_started", "dna_completed",
    "first_verdict", "successful_recommendation", "return_visit", "referral", "subscription",
  ];
  const rates: Record<FunnelStepKey, number> = {
    impression: 1, click: 0.04, landing_visit: 0.9, signup: 0.28, dna_started: 0.7,
    dna_completed: dnaLeak, first_verdict: 0.85, successful_recommendation: 0.62,
    return_visit: 0.45, referral: 0.12, subscription: 0.09,
  };
  const days: FunnelDay[] = [];
  for (let d = 13; d >= 0; d--) {
    const date = new Date(Date.parse("2026-07-24T00:00:00.000Z") - d * 86_400_000)
      .toISOString().slice(0, 10);
    const impressions = base + ((13 - d) * 37) % 220; // varies but deterministic
    let running = impressions;
    const counts = {} as Record<FunnelStepKey, number>;
    for (const step of order) {
      running = step === "impression" ? impressions : Math.round(running * rates[step]);
      counts[step] = running;
    }
    days.push({ product, date, counts, provenance: demo("mock:analytics", product, 0.65) });
  }
  return days;
}

export const SEED_FUNNEL_DAYS: FunnelDay[] = [
  ...makeFunnelDays("watchverdict", 4200, 0.41), // WV: only 41% finish DNA — the leak
  ...makeFunnelDays("readverdict", 900, 0.55),
];

// ── Observations ─────────────────────────────────────────────────────────────
export const SEED_OBSERVATIONS: Observation[] = [
  {
    id: "obs-wv-dna-drop", product: "watchverdict", kind: "metric_change",
    metric: "DNA completion rate", summary: "Watch DNA completion fell to 41% (target 60%). Biggest single funnel leak.",
    direction: "down", changePct: -8, severity: 78, provenance: demo("mock:analytics", "watchverdict", 0.72),
  },
  {
    id: "obs-wv-signup-up", product: "watchverdict", kind: "metric_change",
    metric: "Signups", summary: "Signups up 14% week-over-week following a TikTok mention.",
    direction: "up", changePct: 14, severity: 55, provenance: demo("mock:analytics", "watchverdict", 0.68),
  },
  {
    id: "obs-wv-churn", product: "watchverdict", kind: "revenue_signal",
    metric: "Churn", summary: "Monthly churn ticked up to 7.2% — threatens MRR growth.",
    direction: "down", changePct: -1, severity: 64, provenance: demo("mock:revenue", "watchverdict", 0.6),
  },
  {
    id: "obs-wv-cost", product: "watchverdict", kind: "cost_signal",
    metric: "AI cost/active user", summary: "AI cost per active user at $0.038 — within the $0.05 ceiling.",
    direction: "flat", changePct: 0, severity: 30, provenance: demo("mock:cost", "watchverdict", 0.7),
  },
  {
    id: "obs-rv-waitlist", product: "readverdict", kind: "metric_change",
    metric: "Waitlist signups", summary: "ReadVerdict waitlist reached 315 (target 2,000 by Oct 15).",
    direction: "up", changePct: 9, severity: 40, provenance: demo("mock:analytics", "readverdict", 0.6),
  },
  {
    id: "obs-rv-competitor", product: "readverdict", kind: "competitive_signal",
    metric: "Competitive gap", summary: "Top competitor lacks a personalized reading-DNA onboarding — differentiation opening.",
    direction: "up", changePct: null, severity: 48, provenance: demo("mock:research", "readverdict", 0.5),
  },
];

// ── Opportunities ────────────────────────────────────────────────────────────
export const SEED_OPPORTUNITIES: Opportunity[] = [
  {
    id: "opp-reddit-movies", product: "watchverdict", type: "community_conversation",
    title: "r/MovieSuggestions weekly 'what should I watch' thread has 800+ comments",
    audience: "Active movie-recommendation seekers", intent: "high", estimatedReach: 45000,
    competitiveDensity: 0.5, recommendedChannel: "Reddit (helpful reply, no spam)",
    suggestedResponse: "Answer 3 top requests genuinely, mention WatchVerdict once with a real verdict link.",
    expectedOutcome: "Qualified landing visits + signups", effort: "s", risk: "medium", confidence: 0.6,
    approvalState: "pending", outcome: null, discoveredAt: "2026-07-23T09:00:00.000Z",
    provenance: demo("mock:reddit", "watchverdict", 0.6, "https://reddit.com/r/MovieSuggestions"),
  },
  {
    id: "opp-seo-best-thrillers", product: "watchverdict", type: "seo",
    title: "'best psychological thrillers 2026' — rising query, weak SERP",
    audience: "Search intent, thriller fans", intent: "high", estimatedReach: 120000,
    competitiveDensity: 0.35, recommendedChannel: "SEO landing page + verdict list",
    suggestedResponse: "Publish a curated, honestly-scored thriller list page tied to Watch DNA.",
    expectedOutcome: "Organic traffic + DNA starts", effort: "m", risk: "low", confidence: 0.65,
    approvalState: "not_required", outcome: null, discoveredAt: "2026-07-22T11:00:00.000Z",
    provenance: demo("mock:seo", "watchverdict", 0.65),
  },
  {
    id: "opp-tiktok-creator", product: "watchverdict", type: "creator",
    title: "Mid-tier film TikTok creator (180k) open to product collabs",
    audience: "Gen-Z film fans", intent: "medium", estimatedReach: 180000,
    competitiveDensity: 0.4, recommendedChannel: "Creator partnership (paid)",
    suggestedResponse: "Draft outreach offering a co-branded 'rate my watchlist' video.",
    expectedOutcome: "Top-of-funnel reach + signups", effort: "m", risk: "medium", confidence: 0.5,
    approvalState: "pending", outcome: null, discoveredAt: "2026-07-21T15:00:00.000Z",
    provenance: demo("mock:social", "watchverdict", 0.5),
  },
  {
    id: "opp-journalist-streaming", product: "watchverdict", type: "journalist_media",
    title: "Tech reporter covering 'AI that actually recommends good movies'",
    audience: "Tech + streaming readers", intent: "medium", estimatedReach: 90000,
    competitiveDensity: 0.3, recommendedChannel: "PR pitch",
    suggestedResponse: "Pitch the deterministic-scoring angle (no hype, transparent methodology).",
    expectedOutcome: "Authoritative backlink + credibility", effort: "s", risk: "low", confidence: 0.55,
    approvalState: "pending", outcome: null, discoveredAt: "2026-07-20T12:00:00.000Z",
    provenance: demo("mock:pr", "watchverdict", 0.55),
  },
  {
    id: "opp-rv-newsletter", product: "readverdict", type: "newsletter",
    title: "Book-recommendation newsletter (25k) seeking a tools sponsor",
    audience: "Avid readers", intent: "medium", estimatedReach: 25000,
    competitiveDensity: 0.25, recommendedChannel: "Newsletter sponsorship (paid)",
    suggestedResponse: "Sponsor one issue tied to the ReadVerdict launch waitlist.",
    expectedOutcome: "Waitlist growth pre-launch", effort: "s", risk: "low", confidence: 0.5,
    approvalState: "pending", outcome: null, discoveredAt: "2026-07-19T10:00:00.000Z",
    provenance: demo("mock:newsletter", "readverdict", 0.5),
  },
  {
    id: "opp-rv-complaint", product: "readverdict", type: "complaint_pattern",
    title: "Recurring complaint about competitor's generic recommendations",
    audience: "Frustrated Goodreads users", intent: "high", estimatedReach: 15000,
    competitiveDensity: 0.2, recommendedChannel: "Community + comparison landing page",
    suggestedResponse: "Position Reader DNA as the personalized alternative; collect waitlist emails.",
    expectedOutcome: "Differentiated waitlist signups", effort: "s", risk: "low", confidence: 0.6,
    approvalState: "not_required", outcome: null, discoveredAt: "2026-07-18T14:00:00.000Z",
    provenance: demo("mock:research", "readverdict", 0.6),
  },
];

// ── Recommendations ──────────────────────────────────────────────────────────
export const SEED_RECOMMENDATIONS: Recommendation[] = [
  {
    id: "rec-fix-dna", product: "watchverdict", department: "product",
    problem: "Only 41% of users finish Watch DNA; it's the largest funnel leak and blocks activation.",
    evidence: ["DNA completion 41% vs 60% target", "Biggest absolute drop-off in the 14-day funnel"],
    recommendedAction: "Ship a shorter DNA path (5 questions) A/B test with progress indicator.",
    effort: "m", expectedImpact: 82, confidence: 0.7, metricAffected: "DNA completion rate",
    owner: "product-agent", approvalRequired: true, status: "proposed",
    deadline: "2026-07-31T00:00:00.000Z", sourceOpportunityId: null, createdAt: NOW,
  },
  {
    id: "rec-seo-thriller", product: "watchverdict", department: "marketing",
    problem: "High-intent 'best thrillers 2026' query has weak competition and no WV page.",
    evidence: ["Est. 120k monthly reach", "Competitive density 0.35"],
    recommendedAction: "Publish an honestly-scored thriller list page tied to DNA onboarding.",
    effort: "m", expectedImpact: 64, confidence: 0.65, metricAffected: "Qualified visitors",
    owner: "seo-agent", approvalRequired: false, status: "proposed",
    deadline: "2026-08-07T00:00:00.000Z", sourceOpportunityId: "opp-seo-best-thrillers", createdAt: NOW,
  },
  {
    id: "rec-churn-winback", product: "watchverdict", department: "customer_success",
    problem: "Churn rose to 7.2%, threatening MRR.",
    evidence: ["Churn +1pp MoM", "MRR $1,840 vs $5,000 target"],
    recommendedAction: "Draft a win-back email for users inactive 21+ days (requires approval to send).",
    effort: "s", expectedImpact: 58, confidence: 0.6, metricAffected: "Churn",
    owner: "lifecycle-agent", approvalRequired: true, status: "proposed",
    deadline: "2026-08-03T00:00:00.000Z", sourceOpportunityId: null, createdAt: NOW,
  },
  {
    id: "rec-reddit", product: "watchverdict", department: "growth",
    problem: "A high-intent Reddit thread offers qualified reach if answered helpfully.",
    evidence: ["800+ comments", "45k reach, intent high"],
    recommendedAction: "Post one genuinely helpful reply with a single verdict link (needs approval).",
    effort: "xs", expectedImpact: 44, confidence: 0.55, metricAffected: "Qualified visitors",
    owner: "community-agent", approvalRequired: true, status: "proposed",
    deadline: "2026-07-26T00:00:00.000Z", sourceOpportunityId: "opp-reddit-movies", createdAt: NOW,
  },
  {
    id: "rec-rv-waitlist", product: "readverdict", department: "marketing",
    problem: "ReadVerdict waitlist far behind target ahead of launch.",
    evidence: ["315 / 2,000 signups", "Newsletter + complaint-pattern openings available"],
    recommendedAction: "Sponsor one reader newsletter issue tied to a comparison landing page.",
    effort: "s", expectedImpact: 52, confidence: 0.5, metricAffected: "Account creation",
    owner: "growth-agent", approvalRequired: true, status: "proposed",
    deadline: "2026-08-10T00:00:00.000Z", sourceOpportunityId: "opp-rv-newsletter", createdAt: NOW,
  },
  {
    id: "rec-cost-guard", product: "watchverdict", department: "engineering",
    problem: "AI cost/active user is healthy now but jobs need a hard ceiling before scaling outreach.",
    evidence: ["$0.038 / active user", "No enforced daily LLM ceiling in prod yet"],
    recommendedAction: "Enable the $5/day LLM ceiling on scheduled jobs (already implemented in engine).",
    effort: "xs", expectedImpact: 36, confidence: 0.8, metricAffected: "AI cost per active user",
    owner: "eng-agent", approvalRequired: false, status: "proposed",
    deadline: "2026-07-28T00:00:00.000Z", sourceOpportunityId: null, createdAt: NOW,
  },
];

// ── Approvals ────────────────────────────────────────────────────────────────
export const SEED_APPROVALS: ApprovalRequest[] = [
  {
    id: "apr-reddit", product: "watchverdict", actionType: "public_social_post",
    proposedAction: "Post one helpful reply in r/MovieSuggestions with a single WatchVerdict link.",
    evidence: ["Thread has 800+ comments", "Reach ~45k, high intent"],
    expectedImpact: "Est. 60–120 qualified landing visits", risk: "medium", costUsd: 0,
    reversibility: "partial", generatedContent:
      "Great picks in here — if you liked those, WatchVerdict scored 'Nightcrawler' a 91 for exactly this mood: [link]. Happy to share more.",
    requestedApprover: "founder", decision: "pending", decisionReason: null, executionResult: null,
    createdAt: NOW, decidedAt: null,
  },
  {
    id: "apr-creator", product: "watchverdict", actionType: "influencer_outreach",
    proposedAction: "Send outreach DM to a 180k film TikTok creator proposing a paid collab.",
    evidence: ["Creator open to collabs", "Audience match: Gen-Z film fans"],
    expectedImpact: "Potential 180k reach; est. 200–500 signups", risk: "medium", costUsd: 400,
    reversibility: "reversible", generatedContent:
      "Hi! We built WatchVerdict — transparent, no-hype movie scoring. Would you be open to a 'rate my watchlist' collab? Budget attached.",
    requestedApprover: "founder", decision: "pending", decisionReason: null, executionResult: null,
    createdAt: NOW, decidedAt: null,
  },
  {
    id: "apr-winback", product: "watchverdict", actionType: "customer_email",
    proposedAction: "Send win-back email to 214 users inactive 21+ days.",
    evidence: ["Churn 7.2%", "Segment size 214"],
    expectedImpact: "Est. 10–20 reactivations", risk: "low", costUsd: 0,
    reversibility: "irreversible", generatedContent:
      "We added new verdicts we think you'll love — here are 3 picked by your Watch DNA. Come back?",
    requestedApprover: "founder", decision: "pending", decisionReason: null, executionResult: null,
    createdAt: NOW, decidedAt: null,
  },
  {
    id: "apr-rv-newsletter", product: "readverdict", actionType: "paid_campaign",
    proposedAction: "Buy one sponsored slot in a 25k reader newsletter for the launch waitlist.",
    evidence: ["Audience match", "Low competitive density"],
    expectedImpact: "Est. 150–400 waitlist signups", risk: "low", costUsd: 300,
    reversibility: "reversible", generatedContent: null,
    requestedApprover: "founder", decision: "approved",
    decisionReason: "Within budget, low risk, on-strategy pre-launch.", executionResult: null,
    createdAt: "2026-07-22T09:00:00.000Z", decidedAt: "2026-07-23T09:00:00.000Z",
  },
];

// ── Campaigns ────────────────────────────────────────────────────────────────
export const SEED_CAMPAIGNS: Campaign[] = [
  {
    id: "camp-tiktok-mood", product: "watchverdict",
    objective: "Drive qualified signups from mood-based movie discovery",
    audience: "Gen-Z & millennial film fans on TikTok",
    problemStatement: "People waste 20 minutes scrolling and still pick nothing.",
    positioning: "The app that scores movies honestly for YOUR taste.",
    offer: "Free Watch DNA + your first personalized verdict",
    channel: "TikTok (organic + creator)",
    creativeConcept: "'I let an app rate my entire watchlist' reaction format",
    hook: "This app just told me my favorite movie is a 62.",
    script: "POV: you think you have great taste... [reveal verdicts] ...turns out you're a 74.",
    caption: "Would you trust it? 👀 #movietok #whattowatch",
    thumbnailText: "MY WATCHLIST GOT RATED",
    landingCopy: "Build your Watch DNA in 60 seconds. Get verdicts that actually fit you.",
    emailCopy: "Your Watch DNA is ready — here are 3 verdicts picked for you.",
    prPitch: "Transparent movie scoring, no algorithmic black box.",
    creatorOutreach: "Co-branded 'rate my watchlist' video, budget provided.",
    redditResponse: "Honest reply + single verdict link where relevant.",
    variants: ["Hook A: 'rated my watchlist'", "Hook B: 'my taste is a 74'"],
    trackingId: "utm_wv_tiktok_mood_2026q3", budgetUsd: 500,
    status: "in_review", approvalState: "pending", createdAt: NOW,
  },
  {
    id: "camp-rv-launch", product: "readverdict",
    objective: "Grow pre-launch waitlist to 2,000",
    audience: "Avid readers frustrated by generic recs",
    problemStatement: "Reading recommendations ignore how you actually read.",
    positioning: "Reader DNA: recommendations that understand your reading taste.",
    offer: "Early access + founding-reader badge",
    channel: "Newsletter sponsorship + comparison landing page",
    creativeConcept: "'Why Goodreads keeps recommending the wrong books'",
    hook: "Your reading taste is more specific than a 5-star average.",
    script: "N/A (email + landing)", caption: "N/A",
    thumbnailText: "READER DNA IS COMING",
    landingCopy: "Join the ReadVerdict waitlist. Recommendations built from your Reader DNA.",
    emailCopy: "You're on the list. Here's what Reader DNA will do for you.",
    prPitch: "A personalized alternative to star-average book discovery.",
    creatorOutreach: "N/A in v1", redditResponse: "r/books comparison, non-spammy.",
    variants: ["Landing A: differentiation-led", "Landing B: waitlist-scarcity-led"],
    trackingId: "utm_rv_launch_waitlist_2026q3", budgetUsd: 300,
    status: "draft", approvalState: "not_required", createdAt: NOW,
  },
];

// ── Experiments ──────────────────────────────────────────────────────────────
export const SEED_EXPERIMENTS: Experiment[] = [
  {
    id: "exp-dna-short", product: "watchverdict",
    hypothesis: "A 5-question DNA (vs 9) raises completion from 41% to >55% without hurting recommendation quality.",
    funnelStep: "dna_completed", guardrailMetric: "Successful recommendation rate",
    variants: [
      { key: "control", label: "9 questions", exposures: 1200, conversions: 492 },
      { key: "short", label: "5 questions", exposures: 1180, conversions: 641 },
    ],
    status: "running", decision: null, createdAt: NOW,
  },
  {
    id: "exp-landing-hook", product: "watchverdict",
    hypothesis: "A mood-led landing hook converts visits to signups better than a feature-led hook.",
    funnelStep: "signup", guardrailMetric: "Bounce rate",
    variants: [
      { key: "feature", label: "Feature-led", exposures: 3000, conversions: 780 },
      { key: "mood", label: "Mood-led", exposures: 3010, conversions: 912 },
    ],
    status: "running", decision: null, createdAt: NOW,
  },
];

// ── Engineering ──────────────────────────────────────────────────────────────
export const SEED_PULL_REQUESTS: PullRequestRecord[] = [
  {
    id: "pr-wv-341", product: "watchverdict", repository: "Bigshiz55/Clearpath", number: 341,
    title: "Preference engine: three DNA channels + confidence", state: "merged",
    author: "founder", updatedAt: "2026-07-23T18:00:00.000Z", provenance: demo("mock:github", "watchverdict", 0.9),
  },
  {
    id: "pr-wv-344", product: "watchverdict", repository: "Bigshiz55/Clearpath", number: 344,
    title: "Shorter DNA path A/B scaffold", state: "open",
    author: "product-agent", updatedAt: "2026-07-24T09:00:00.000Z", provenance: demo("mock:github", "watchverdict", 0.9),
  },
];

export const SEED_DEPLOYMENTS: DeploymentRecord[] = [
  {
    id: "dep-wv-1", product: "watchverdict", environment: "production", status: "success",
    sha: "7b35cee", createdAt: "2026-07-23T19:00:00.000Z", provenance: demo("mock:vercel", "watchverdict", 0.9),
  },
  {
    id: "dep-wv-2", product: "watchverdict", environment: "preview", status: "building",
    sha: "a1b2c3d", createdAt: "2026-07-24T09:10:00.000Z", provenance: demo("mock:vercel", "watchverdict", 0.9),
  },
];

export const SEED_INCIDENTS: IncidentRecord[] = [
  {
    id: "inc-wv-search", product: "watchverdict", title: "Voice search intermittently returns empty results",
    severity: "sev2", status: "mitigated", summary: "Parser edge case on multi-platform queries; mitigation deployed, monitoring.",
    createdAt: "2026-07-22T16:00:00.000Z", provenance: demo("mock:incidents", "watchverdict", 0.8),
  },
];

export const SEED_FEEDBACK: CustomerFeedback[] = [
  {
    id: "fb-wv-dna-long", product: "watchverdict", kind: "complaint",
    summary: "\"The DNA quiz is too long, I gave up halfway.\"", count: 23,
    createdAt: NOW, provenance: demo("mock:support", "watchverdict", 0.7),
  },
  {
    id: "fb-wv-loved", product: "watchverdict", kind: "praise",
    summary: "\"The scores actually match what I end up liking.\"", count: 41,
    createdAt: NOW, provenance: demo("mock:support", "watchverdict", 0.7),
  },
  {
    id: "fb-rv-waitlist", product: "readverdict", kind: "feature_request",
    summary: "\"Please support audiobooks in Reader DNA.\"", count: 12,
    createdAt: NOW, provenance: demo("mock:support", "readverdict", 0.6),
  },
];

// ── Revenue & cost ───────────────────────────────────────────────────────────
export const SEED_PLANS: Plan[] = [
  { id: "plan-wv-free", product: "watchverdict", name: "Free", priceUsdMonthly: 0, trialDays: 0 },
  { id: "plan-wv-pro", product: "watchverdict", name: "Pro", priceUsdMonthly: 6, trialDays: 7 },
  { id: "plan-rv-free", product: "readverdict", name: "Free", priceUsdMonthly: 0, trialDays: 0 },
  { id: "plan-rv-pro", product: "readverdict", name: "Pro", priceUsdMonthly: 6, trialDays: 7 },
];

export const SEED_REVENUE: RevenueSnapshot[] = [
  {
    product: "watchverdict", date: "2026-07-24", mrrUsd: 1840, arrUsd: 22080,
    activeSubscriptions: 307, trials: 58, trialConversionPct: 0.34, freeToPaidPct: 0.041,
    churnPct: 0.072, revenuePerActiveUserUsd: 0.62, cacUsd: 3.1, ltvUsd: 14.2,
    provenance: demo("mock:revenue", "watchverdict", 0.6),
  },
  {
    product: "readverdict", date: "2026-07-24", mrrUsd: 0, arrUsd: 0,
    activeSubscriptions: 0, trials: 0, trialConversionPct: 0, freeToPaidPct: 0,
    churnPct: 0, revenuePerActiveUserUsd: 0, cacUsd: 0, ltvUsd: 0,
    provenance: demo("mock:revenue", "readverdict", 0.6),
  },
];

export const SEED_COST: CostSnapshot[] = [
  {
    product: "watchverdict", date: "2026-07-24", llmCostUsd: 2.10, infraCostUsd: 3.40,
    activeUsers: 1450, provenance: demo("mock:cost", "watchverdict", 0.7),
  },
  {
    product: "readverdict", date: "2026-07-24", llmCostUsd: 0.20, infraCostUsd: 0.90,
    activeUsers: 120, provenance: demo("mock:cost", "readverdict", 0.7),
  },
];

// ── Jobs & audit ─────────────────────────────────────────────────────────────
export const SEED_JOBS: ScheduledJob[] = [
  { id: "job-daily-loop", name: "Daily operating loop", cron: "0 13 * * *", costCeilingUsd: 5, enabled: true },
  { id: "job-opportunity-scan", name: "Opportunity scan (mock)", cron: "0 */6 * * *", costCeilingUsd: 2, enabled: true },
  { id: "job-metric-refresh", name: "Funnel metric refresh (mock)", cron: "15 * * * *", costCeilingUsd: 1, enabled: true },
];

export const SEED_AUDIT: AuditEvent[] = [
  {
    id: "aud-1", at: "2026-07-23T09:00:00.000Z", actor: "founder", action: "approval.approved",
    entityType: "approval", entityId: "apr-rv-newsletter", product: "readverdict",
    metadata: { reason: "Within budget, low risk, on-strategy pre-launch." },
  },
  {
    id: "aud-2", at: "2026-07-24T13:00:00.000Z", actor: "system:daily-loop", action: "recommendations.generated",
    entityType: "recommendation", entityId: "batch-2026-07-24", product: "shared",
    metadata: { count: 6, source: "mock adapters" },
  },
];
