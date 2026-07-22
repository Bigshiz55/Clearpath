import "server-only";
import yahooFinance from "yahoo-finance2";
import {
  atmIV,
  expectedMove,
  medianSpreadPct,
  realizedVol,
} from "@/lib/quant/ivMetrics";

yahooFinance.suppressNotices(["yahooSurvey"]);

/** Assumed risk-free rate for Greeks. Close enough for position sizing. */
export const RISK_FREE_RATE = 0.04;

export interface Quote {
  symbol: string;
  price: number | null;
  change: number | null;
  changePercent: number | null;
  fiftyTwoWeekLow: number | null;
  fiftyTwoWeekHigh: number | null;
  marketState: string | null;
}

export async function getQuotes(symbols: string[]): Promise<Quote[]> {
  const results = await Promise.allSettled(
    symbols.map((s) => yahooFinance.quote(s)),
  );
  return results.map((r, i) => {
    if (r.status === "rejected") {
      return {
        symbol: symbols[i],
        price: null,
        change: null,
        changePercent: null,
        fiftyTwoWeekLow: null,
        fiftyTwoWeekHigh: null,
        marketState: null,
      };
    }
    const q = r.value;
    return {
      symbol: symbols[i],
      price: q.regularMarketPrice ?? null,
      change: q.regularMarketChange ?? null,
      changePercent: q.regularMarketChangePercent ?? null,
      fiftyTwoWeekLow: q.fiftyTwoWeekLow ?? null,
      fiftyTwoWeekHigh: q.fiftyTwoWeekHigh ?? null,
      marketState: q.marketState ?? null,
    };
  });
}

export interface ContractRow {
  strike: number;
  bid: number | null;
  ask: number | null;
  lastPrice: number | null;
  impliedVolatility: number | null;
  openInterest: number | null;
  volume: number | null;
}

export interface ChainSnapshot {
  symbol: string;
  spot: number;
  expiration: string; // ISO date
  expirationsAvailable: string[];
  daysToExpiration: number;
  calls: ContractRow[];
  puts: ContractRow[];
  /** Average IV of near-the-money contracts for this expiration. */
  atmIV: number | null;
  /** Annualized 3-month close-to-close realized vol. */
  realizedVol3m: number | null;
  /** atmIV / realizedVol — >1.15 means premium is rich vs recent movement. */
  ivRvRatio: number | null;
  /** 1-sigma expected move ($) to this expiration, from ATM IV. */
  expectedMove: number | null;
  /** Median relative bid-ask spread near the money (liquidity gauge). */
  medianSpreadPct: number | null;
}

const isoDate = (d: Date) => d.toISOString().slice(0, 10);

function mapContracts(raw: any[]): ContractRow[] {
  return (raw ?? []).map((c: any) => ({
    strike: c.strike,
    bid: c.bid ?? null,
    ask: c.ask ?? null,
    lastPrice: c.lastPrice ?? null,
    impliedVolatility:
      typeof c.impliedVolatility === "number" && c.impliedVolatility > 0.001
        ? c.impliedVolatility
        : null,
    openInterest: c.openInterest ?? null,
    volume: c.volume ?? null,
  }));
}

/**
 * Fetch the option chain for one expiration (nearest to `targetDate`, or the
 * nearest listed expiration ≥ ~20 days out when omitted) plus computed vol
 * metrics. Data is delayed Yahoo data — good for analysis, not for execution.
 */
export async function getChainSnapshot(
  symbol: string,
  targetDate?: string,
): Promise<ChainSnapshot> {
  const meta: any = await yahooFinance.options(symbol, {}, { validateResult: false });
  const expirations: Date[] = (meta.expirationDates ?? []).map((d: any) => new Date(d));
  if (expirations.length === 0) {
    throw new Error(`No listed options for ${symbol}`);
  }

  const now = Date.now();
  let chosen: Date;
  if (targetDate) {
    const target = new Date(targetDate + "T00:00:00Z").getTime();
    chosen = expirations.reduce((best, d) =>
      Math.abs(d.getTime() - target) < Math.abs(best.getTime() - target) ? d : best,
    );
  } else {
    // Default: first expiration at least ~20 days out (premium-selling sweet spot)
    chosen =
      expirations.find((d) => d.getTime() - now > 20 * 24 * 3600 * 1000) ??
      expirations[expirations.length - 1];
  }

  const [detail, quote, history] = await Promise.all([
    yahooFinance.options(symbol, { date: chosen }, { validateResult: false }) as Promise<any>,
    yahooFinance.quote(symbol),
    yahooFinance
      .chart(symbol, {
        period1: new Date(now - 95 * 24 * 3600 * 1000),
        interval: "1d",
      })
      .catch(() => null),
  ]);

  const spot = quote.regularMarketPrice;
  if (spot == null) throw new Error(`No price for ${symbol}`);

  const chain = detail.options?.[0];
  const calls = mapContracts(chain?.calls);
  const puts = mapContracts(chain?.puts);

  const closes: number[] =
    history?.quotes?.map((q: any) => q.close).filter((c: any) => typeof c === "number") ?? [];

  const iv = atmIV(calls, puts, spot);
  const rv = realizedVol(closes);
  const T = Math.max(chosen.getTime() - now, 0) / (365 * 24 * 3600 * 1000);

  return {
    symbol: symbol.toUpperCase(),
    spot,
    expiration: isoDate(chosen),
    expirationsAvailable: expirations.map(isoDate),
    daysToExpiration: Math.round(T * 365),
    calls,
    puts,
    atmIV: iv,
    realizedVol3m: rv,
    ivRvRatio: iv != null && rv != null && rv > 0 ? iv / rv : null,
    expectedMove: iv != null ? expectedMove(spot, iv, T) : null,
    medianSpreadPct: medianSpreadPct([...calls, ...puts], spot),
  };
}
