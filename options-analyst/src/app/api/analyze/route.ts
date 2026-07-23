import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { z } from "zod/v4";
import { portfolioSchema, preferencesSchema } from "@/lib/portfolio";
import { getChainSnapshot, type ChainSnapshot } from "@/lib/market/yahoo";
import { computePortfolioGreeks } from "@/lib/analyze/portfolioGreeks";
import { AnalystConfigError, runAnalysis } from "@/lib/analyze/analyst";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

const bodySchema = z.object({
  portfolio: portfolioSchema,
  watchlist: z.array(z.string().min(1).max(10)).max(10).default([]),
  preferences: preferencesSchema.default({ bias: "auto", riskAppetite: "conservative" }),
});

export async function POST(req: NextRequest) {
  let body: z.infer<typeof bodySchema>;
  try {
    body = bodySchema.parse(await req.json());
  } catch (err) {
    return NextResponse.json(
      { error: "Invalid request body", detail: err instanceof z.ZodError ? err.issues : undefined },
      { status: 400 },
    );
  }

  const { portfolio, watchlist, preferences } = body;
  const tickers = new Set<string>([
    ...portfolio.equities.map((e) => e.ticker.toUpperCase()),
    ...portfolio.options.map((o) => o.ticker.toUpperCase()),
    ...watchlist.map((t) => t.toUpperCase()),
  ]);
  if (tickers.size === 0) {
    return NextResponse.json({ error: "Portfolio and watchlist are both empty" }, { status: 400 });
  }

  // Fetch one default-expiration chain per ticker; skip tickers with no options.
  const chains = new Map<string, ChainSnapshot>();
  const failures: string[] = [];
  await Promise.all(
    [...tickers].map(async (t) => {
      try {
        chains.set(t, await getChainSnapshot(t));
      } catch {
        failures.push(t);
      }
    }),
  );
  if (chains.size === 0) {
    return NextResponse.json(
      { error: `No market data available for: ${failures.join(", ")}` },
      { status: 502 },
    );
  }

  try {
    const greeks = await computePortfolioGreeks(portfolio, chains);
    const analysis = await runAnalysis(portfolio, greeks, [...chains.values()], preferences);
    return NextResponse.json({
      analysis,
      computed: { greeks, dataUnavailableFor: failures },
    });
  } catch (err) {
    if (err instanceof AnalystConfigError) {
      return NextResponse.json({ error: err.message }, { status: 503 });
    }
    if (err instanceof Anthropic.RateLimitError) {
      return NextResponse.json({ error: "Model rate-limited — retry shortly" }, { status: 429 });
    }
    if (err instanceof Anthropic.APIError) {
      return NextResponse.json(
        { error: `Model error (${err.status}): ${err.message}` },
        { status: 502 },
      );
    }
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "analysis failed" },
      { status: 500 },
    );
  }
}
