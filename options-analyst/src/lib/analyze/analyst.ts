import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import type { Portfolio } from "@/lib/portfolio";
import type { ChainSnapshot, ContractRow } from "@/lib/market/yahoo";
import type { PortfolioGreeksReport } from "@/lib/analyze/portfolioGreeks";
import { analysisSchema, type Analysis } from "@/lib/analyze/schema";
import { QUANT_PM_SYSTEM_PROMPT } from "@/lib/analyze/prompt";

const MODEL = "claude-opus-4-8";

/** Trim a chain to near-the-money contracts so the prompt stays compact. */
function trimChain(chain: ChainSnapshot, windowPct = 0.15) {
  const near = (rows: ContractRow[]) =>
    rows
      .filter((c) => Math.abs(c.strike - chain.spot) / chain.spot <= windowPct)
      .map((c) => ({
        strike: c.strike,
        bid: c.bid,
        ask: c.ask,
        iv: c.impliedVolatility != null ? Math.round(c.impliedVolatility * 1000) / 1000 : null,
        oi: c.openInterest,
      }));
  return {
    symbol: chain.symbol,
    spot: chain.spot,
    expiration: chain.expiration,
    days_to_expiration: chain.daysToExpiration,
    other_expirations: chain.expirationsAvailable.slice(0, 12),
    atm_iv: chain.atmIV,
    realized_vol_3m: chain.realizedVol3m,
    iv_rv_ratio: chain.ivRvRatio,
    expected_move_dollars: chain.expectedMove,
    median_ntm_spread_pct: chain.medianSpreadPct,
    calls: near(chain.calls),
    puts: near(chain.puts),
  };
}

export async function runAnalysis(
  portfolio: Portfolio,
  greeks: PortfolioGreeksReport,
  chains: ChainSnapshot[],
): Promise<Analysis> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    throw new AnalystConfigError(
      "ANTHROPIC_API_KEY is not set. Market data still works; the AI analyst does not.",
    );
  }

  const client = new Anthropic({ apiKey });

  const userPayload = {
    as_of: new Date().toISOString(),
    portfolio,
    computed_portfolio_greeks: greeks,
    market_data: chains.map((c) => trimChain(c)),
    note: "Quotes are delayed. IV Rank/Percentile history is unavailable — use iv_rv_ratio.",
  };

  const response = await client.messages.parse({
    model: MODEL,
    max_tokens: 16000,
    thinking: { type: "adaptive" },
    system: QUANT_PM_SYSTEM_PROMPT,
    messages: [
      {
        role: "user",
        content:
          "Analyze my portfolio against the market data below and produce your recommendation.\n\n" +
          JSON.stringify(userPayload, null, 1),
      },
    ],
    output_config: { format: zodOutputFormat(analysisSchema) },
  });

  if (response.stop_reason === "refusal") {
    throw new Error("The model declined this request.");
  }
  const parsed = response.parsed_output;
  if (!parsed) {
    throw new Error("Model returned output that did not match the expected schema.");
  }
  return parsed;
}

export class AnalystConfigError extends Error {}
