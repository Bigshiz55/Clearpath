import { describe, expect, it } from "vitest";
import { bsGreeks, bsPrice, impliedVol, normCdf, yearsUntil } from "./blackScholes";

// Canonical textbook case: S=100, K=100, T=1y, r=5%, sigma=20%
const S = 100;
const K = 100;
const T = 1;
const r = 0.05;
const sigma = 0.2;

describe("normCdf", () => {
  it("matches known values", () => {
    expect(normCdf(0)).toBeCloseTo(0.5, 7);
    expect(normCdf(1.96)).toBeCloseTo(0.975, 3);
    expect(normCdf(-1.96)).toBeCloseTo(0.025, 3);
  });
});

describe("bsPrice", () => {
  it("prices the canonical ATM call", () => {
    expect(bsPrice("call", S, K, T, r, sigma)).toBeCloseTo(10.4506, 3);
  });

  it("prices the canonical ATM put (put-call parity)", () => {
    expect(bsPrice("put", S, K, T, r, sigma)).toBeCloseTo(5.5735, 3);
  });

  it("respects put-call parity for arbitrary inputs", () => {
    const call = bsPrice("call", 95, 105, 0.4, 0.03, 0.35);
    const put = bsPrice("put", 95, 105, 0.4, 0.03, 0.35);
    expect(call - put).toBeCloseTo(95 - 105 * Math.exp(-0.03 * 0.4), 8);
  });

  it("returns intrinsic value at expiration", () => {
    expect(bsPrice("call", 110, 100, 0, r, sigma)).toBe(10);
    expect(bsPrice("put", 110, 100, 0, r, sigma)).toBe(0);
  });
});

describe("bsGreeks", () => {
  const call = bsGreeks("call", S, K, T, r, sigma);
  const put = bsGreeks("put", S, K, T, r, sigma);

  it("computes delta", () => {
    expect(call.delta).toBeCloseTo(0.6368, 3);
    expect(put.delta).toBeCloseTo(-0.3632, 3);
  });

  it("computes gamma (same for call and put)", () => {
    expect(call.gamma).toBeCloseTo(0.018762, 4);
    expect(put.gamma).toBeCloseTo(call.gamma, 10);
  });

  it("computes vega per vol point (same for call and put)", () => {
    expect(call.vega).toBeCloseTo(0.37524, 4);
    expect(put.vega).toBeCloseTo(call.vega, 10);
  });

  it("computes theta per day", () => {
    // Annual call theta ≈ -6.414 → per day ≈ -0.01757
    expect(call.theta).toBeCloseTo(-0.01757, 4);
    expect(put.theta).toBeLessThan(0);
    expect(put.theta).toBeGreaterThan(call.theta); // put decays slower here (r > 0)
  });
});

describe("impliedVol", () => {
  it("recovers the input volatility from a model price", () => {
    const price = bsPrice("call", S, K, T, r, 0.35);
    expect(impliedVol("call", price, S, K, T, r)).toBeCloseTo(0.35, 4);
  });

  it("recovers vol for puts and short-dated options", () => {
    const price = bsPrice("put", 420, 400, 0.08, 0.04, 0.55);
    expect(impliedVol("put", price, 420, 400, 0.08, 0.04)).toBeCloseTo(0.55, 3);
  });

  it("returns null for prices below intrinsic", () => {
    expect(impliedVol("call", 0.0001, 200, 100, 0.5, 0.05)).toBeNull();
  });
});

describe("yearsUntil", () => {
  it("converts ms horizons to years", () => {
    const now = 1_700_000_000_000;
    const oneYearLater = now + 365 * 24 * 3600 * 1000;
    expect(yearsUntil(oneYearLater, now)).toBeCloseTo(1, 10);
    expect(yearsUntil(now - 1000, now)).toBe(0);
  });
});
