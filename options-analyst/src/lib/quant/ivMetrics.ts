/**
 * Volatility metrics computed from raw market data. Pure math, no I/O.
 *
 * Honesty note: true IV Rank / IV Percentile require a 52-week history of
 * implied volatility, which keyless data sources don't provide. Instead we
 * compute an IV/RV premium ratio (current ATM IV vs. realized vol), which is
 * the same "is premium rich or cheap?" signal. Anything we can't compute is
 * reported as null — never fabricated.
 */

export interface ContractLite {
  strike: number;
  impliedVolatility?: number | null;
  bid?: number | null;
  ask?: number | null;
}

/** Annualized close-to-close realized volatility from a series of closes. */
export function realizedVol(closes: number[], periodsPerYear = 252): number | null {
  if (closes.length < 10) return null;
  const rets: number[] = [];
  for (let i = 1; i < closes.length; i++) {
    if (closes[i - 1] > 0 && closes[i] > 0) {
      rets.push(Math.log(closes[i] / closes[i - 1]));
    }
  }
  if (rets.length < 5) return null;
  const mean = rets.reduce((a, b) => a + b, 0) / rets.length;
  const variance = rets.reduce((a, b) => a + (b - mean) ** 2, 0) / (rets.length - 1);
  return Math.sqrt(variance * periodsPerYear);
}

/**
 * ATM implied volatility: average IV of the contracts nearest the spot price
 * (up to `n` closest strikes per side), ignoring contracts with no IV.
 */
export function atmIV(
  calls: ContractLite[],
  puts: ContractLite[],
  spot: number,
  n = 2,
): number | null {
  const nearest = (contracts: ContractLite[]) =>
    contracts
      .filter((c) => c.impliedVolatility != null && c.impliedVolatility > 0)
      .sort((a, b) => Math.abs(a.strike - spot) - Math.abs(b.strike - spot))
      .slice(0, n)
      .map((c) => c.impliedVolatility as number);

  const ivs = [...nearest(calls), ...nearest(puts)];
  if (ivs.length === 0) return null;
  return ivs.reduce((a, b) => a + b, 0) / ivs.length;
}

/** 1-sigma expected move in dollars over T years at volatility iv. */
export function expectedMove(spot: number, iv: number, T: number): number {
  return spot * iv * Math.sqrt(T);
}

/**
 * Median relative bid-ask spread of near-the-money contracts — a liquidity
 * gauge. Returns null when there aren't enough two-sided quotes.
 */
export function medianSpreadPct(
  contracts: ContractLite[],
  spot: number,
  windowPct = 0.1,
): number | null {
  const spreads = contracts
    .filter(
      (c) =>
        Math.abs(c.strike - spot) / spot <= windowPct &&
        c.bid != null &&
        c.ask != null &&
        c.bid > 0 &&
        c.ask > c.bid,
    )
    .map((c) => {
      const mid = (c.bid! + c.ask!) / 2;
      return (c.ask! - c.bid!) / mid;
    })
    .sort((a, b) => a - b);
  if (spreads.length === 0) return null;
  const mid = Math.floor(spreads.length / 2);
  return spreads.length % 2 ? spreads[mid] : (spreads[mid - 1] + spreads[mid]) / 2;
}
