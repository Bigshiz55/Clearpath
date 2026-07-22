/**
 * Pure Black-Scholes math. No I/O — everything here is deterministic and unit-tested.
 *
 * Conventions:
 *  - T is time to expiration in years
 *  - sigma is annualized volatility as a decimal (0.20 = 20%)
 *  - r is the annualized continuously-compounded risk-free rate
 *  - theta is returned PER CALENDAR DAY
 *  - vega is returned per 1 percentage point of volatility (sigma +0.01)
 */

export type OptionType = "call" | "put";

export function normPdf(x: number): number {
  return Math.exp(-0.5 * x * x) / Math.sqrt(2 * Math.PI);
}

/** Abramowitz & Stegun approximation of the standard normal CDF (|err| < 7.5e-8). */
export function normCdf(x: number): number {
  const b1 = 0.319381530;
  const b2 = -0.356563782;
  const b3 = 1.781477937;
  const b4 = -1.821255978;
  const b5 = 1.330274429;
  const p = 0.2316419;

  const absX = Math.abs(x);
  const t = 1 / (1 + p * absX);
  const poly = t * (b1 + t * (b2 + t * (b3 + t * (b4 + t * b5))));
  const tail = normPdf(absX) * poly;
  return x >= 0 ? 1 - tail : tail;
}

function d1(S: number, K: number, T: number, r: number, sigma: number): number {
  return (Math.log(S / K) + (r + 0.5 * sigma * sigma) * T) / (sigma * Math.sqrt(T));
}

export function bsPrice(
  type: OptionType,
  S: number,
  K: number,
  T: number,
  r: number,
  sigma: number,
): number {
  if (T <= 0 || sigma <= 0) {
    // Expired / zero-vol: intrinsic value
    return type === "call" ? Math.max(S - K, 0) : Math.max(K - S, 0);
  }
  const D1 = d1(S, K, T, r, sigma);
  const D2 = D1 - sigma * Math.sqrt(T);
  if (type === "call") {
    return S * normCdf(D1) - K * Math.exp(-r * T) * normCdf(D2);
  }
  return K * Math.exp(-r * T) * normCdf(-D2) - S * normCdf(-D1);
}

export interface Greeks {
  delta: number;
  gamma: number;
  /** per calendar day */
  theta: number;
  /** per 1 vol percentage point */
  vega: number;
}

export function bsGreeks(
  type: OptionType,
  S: number,
  K: number,
  T: number,
  r: number,
  sigma: number,
): Greeks {
  if (T <= 0 || sigma <= 0) {
    const itm = type === "call" ? S > K : S < K;
    return { delta: itm ? (type === "call" ? 1 : -1) : 0, gamma: 0, theta: 0, vega: 0 };
  }
  const sqrtT = Math.sqrt(T);
  const D1 = d1(S, K, T, r, sigma);
  const D2 = D1 - sigma * sqrtT;

  const delta = type === "call" ? normCdf(D1) : normCdf(D1) - 1;
  const gamma = normPdf(D1) / (S * sigma * sqrtT);
  const vegaRaw = S * normPdf(D1) * sqrtT; // per 1.0 change in sigma

  const thetaCommon = -(S * normPdf(D1) * sigma) / (2 * sqrtT);
  const thetaYear =
    type === "call"
      ? thetaCommon - r * K * Math.exp(-r * T) * normCdf(D2)
      : thetaCommon + r * K * Math.exp(-r * T) * normCdf(-D2);

  return {
    delta,
    gamma,
    theta: thetaYear / 365,
    vega: vegaRaw / 100,
  };
}

/**
 * Implied volatility via bisection. Returns null when the market price sits
 * outside the no-arbitrage bounds (e.g. below intrinsic) or fails to converge.
 */
export function impliedVol(
  type: OptionType,
  price: number,
  S: number,
  K: number,
  T: number,
  r: number,
): number | null {
  if (T <= 0 || price <= 0) return null;
  let lo = 0.001;
  let hi = 5;
  if (bsPrice(type, S, K, T, r, lo) > price) return null;
  if (bsPrice(type, S, K, T, r, hi) < price) return null;

  for (let i = 0; i < 100; i++) {
    const mid = (lo + hi) / 2;
    const p = bsPrice(type, S, K, T, r, mid);
    if (Math.abs(p - price) < 1e-8) return mid;
    if (p < price) lo = mid;
    else hi = mid;
  }
  return (lo + hi) / 2;
}

/** Time to expiration in years from now until `expiration` (ms epoch or Date). */
export function yearsUntil(expiration: number | Date, now: number = Date.now()): number {
  const expMs = expiration instanceof Date ? expiration.getTime() : expiration;
  return Math.max(expMs - now, 0) / (365 * 24 * 3600 * 1000);
}
