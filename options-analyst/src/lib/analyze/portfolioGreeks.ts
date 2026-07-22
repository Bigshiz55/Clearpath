import "server-only";
import type { Portfolio } from "@/lib/portfolio";
import { bsGreeks, yearsUntil, type OptionType } from "@/lib/quant/blackScholes";
import { getChainSnapshot, getQuotes, RISK_FREE_RATE, type ChainSnapshot } from "@/lib/market/yahoo";

export interface PositionGreeks {
  label: string;
  delta: number | null;
  theta: number | null;
  vega: number | null;
  note?: string;
}

export interface PortfolioGreeksReport {
  positions: PositionGreeks[];
  /** Share-equivalent net delta across everything we could price. */
  netDelta: number | null;
  /** $ per day across priced option positions. */
  netTheta: number | null;
  /** $ per vol point across priced option positions. */
  netVega: number | null;
  unpricedCount: number;
}

/**
 * Deterministic portfolio Greeks: equities contribute delta = shares; each
 * option leg is priced with Black-Scholes at the IV of the matching listed
 * contract (ATM IV fallback). Positions we can't price are reported as such —
 * never guessed.
 */
export async function computePortfolioGreeks(
  portfolio: Portfolio,
  chains: Map<string, ChainSnapshot>,
): Promise<PortfolioGreeksReport> {
  const positions: PositionGreeks[] = [];
  let netDelta = 0;
  let netTheta = 0;
  let netVega = 0;
  let priced = 0;
  let unpriced = 0;

  const equityTickers = portfolio.equities.map((e) => e.ticker.toUpperCase());
  const equityQuotes = equityTickers.length ? await getQuotes(equityTickers) : [];

  portfolio.equities.forEach((e, i) => {
    const price = equityQuotes[i]?.price;
    positions.push({
      label: `${e.shares} shares ${e.ticker.toUpperCase()}${price != null ? ` @ $${price.toFixed(2)}` : ""}`,
      delta: e.shares,
      theta: 0,
      vega: 0,
    });
    netDelta += e.shares;
    priced++;
  });

  for (const opt of portfolio.options) {
    const ticker = opt.ticker.toUpperCase();
    const sign = opt.side === "long" ? 1 : -1;
    const label = `${opt.side} ${opt.contracts}x ${ticker} ${opt.expiration} ${opt.strike}${opt.type === "call" ? "C" : "P"}`;

    let chain = chains.get(ticker);
    if (!chain || chain.expiration !== opt.expiration) {
      try {
        chain = await getChainSnapshot(ticker, opt.expiration);
        chains.set(`${ticker}:${opt.expiration}`, chain);
      } catch {
        chain = undefined;
      }
    }

    if (!chain) {
      positions.push({ label, delta: null, theta: null, vega: null, note: "no market data" });
      unpriced++;
      continue;
    }

    const side = opt.type === "call" ? chain.calls : chain.puts;
    const contract = side.find((c) => Math.abs(c.strike - opt.strike) < 1e-6);
    const iv = contract?.impliedVolatility ?? chain.atmIV;
    if (iv == null) {
      positions.push({ label, delta: null, theta: null, vega: null, note: "no IV available" });
      unpriced++;
      continue;
    }

    const T = yearsUntil(new Date(opt.expiration + "T21:00:00Z").getTime());
    const g = bsGreeks(opt.type as OptionType, chain.spot, opt.strike, T, RISK_FREE_RATE, iv);
    const mult = sign * opt.contracts * 100;

    const delta = g.delta * mult;
    const theta = g.theta * mult;
    const vega = g.vega * mult;
    positions.push({
      label,
      delta: round2(delta),
      theta: round2(theta),
      vega: round2(vega),
      note: contract?.impliedVolatility == null ? "priced at ATM IV (contract IV missing)" : undefined,
    });
    netDelta += delta;
    netTheta += theta;
    netVega += vega;
    priced++;
  }

  return {
    positions,
    netDelta: priced > 0 ? round2(netDelta) : null,
    netTheta: priced > 0 ? round2(netTheta) : null,
    netVega: priced > 0 ? round2(netVega) : null,
    unpricedCount: unpriced,
  };
}

const round2 = (x: number) => Math.round(x * 100) / 100;
