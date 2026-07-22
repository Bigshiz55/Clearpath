import { describe, expect, it } from "vitest";
import { atmIV, expectedMove, medianSpreadPct, realizedVol } from "./ivMetrics";

describe("realizedVol", () => {
  it("returns 0 for a constant-return series", () => {
    // 1% daily growth — every log return identical, so stdev is 0
    const closes = Array.from({ length: 30 }, (_, i) => 100 * 1.01 ** i);
    expect(realizedVol(closes)).toBeCloseTo(0, 10);
  });

  it("annualizes alternating ±1% moves to a plausible vol", () => {
    const closes: number[] = [100];
    for (let i = 0; i < 60; i++) closes.push(closes[closes.length - 1] * (i % 2 ? 0.99 : 1.01));
    const rv = realizedVol(closes)!;
    // stdev of ±1% log returns ≈ 1%, annualized ≈ 16%
    expect(rv).toBeGreaterThan(0.1);
    expect(rv).toBeLessThan(0.25);
  });

  it("returns null with insufficient data", () => {
    expect(realizedVol([100, 101, 102])).toBeNull();
  });
});

describe("atmIV", () => {
  const calls = [
    { strike: 95, impliedVolatility: 0.32 },
    { strike: 100, impliedVolatility: 0.3 },
    { strike: 105, impliedVolatility: 0.29 },
  ];
  const puts = [
    { strike: 95, impliedVolatility: 0.34 },
    { strike: 100, impliedVolatility: 0.32 },
    { strike: 105, impliedVolatility: 0.31 },
  ];

  it("averages the nearest strikes on both sides", () => {
    // n=1 → strikes at 100: (0.30 + 0.32) / 2
    expect(atmIV(calls, puts, 100, 1)).toBeCloseTo(0.31, 10);
  });

  it("ignores contracts with missing IV", () => {
    const sparse = [{ strike: 100, impliedVolatility: null }, { strike: 101, impliedVolatility: 0.4 }];
    expect(atmIV(sparse, [], 100, 1)).toBeCloseTo(0.4, 10);
  });

  it("returns null when no IVs exist", () => {
    expect(atmIV([{ strike: 100 }], [{ strike: 100 }], 100)).toBeNull();
  });
});

describe("expectedMove", () => {
  it("computes 1-sigma move", () => {
    // 30 days at 25% vol on a $200 stock
    expect(expectedMove(200, 0.25, 30 / 365)).toBeCloseTo(200 * 0.25 * Math.sqrt(30 / 365), 10);
  });
});

describe("medianSpreadPct", () => {
  it("computes the median relative spread near the money", () => {
    const contracts = [
      { strike: 100, bid: 1.0, ask: 1.1 },  // ~9.5%
      { strike: 102, bid: 2.0, ask: 2.1 },  // ~4.9%
      { strike: 104, bid: 3.0, ask: 3.3 },  // ~9.5%
      { strike: 150, bid: 0.01, ask: 1.0 }, // outside window, ignored
    ];
    const med = medianSpreadPct(contracts, 100)!;
    expect(med).toBeGreaterThan(0.04);
    expect(med).toBeLessThan(0.1);
  });

  it("returns null with no usable quotes", () => {
    expect(medianSpreadPct([{ strike: 100, bid: 0, ask: 0 }], 100)).toBeNull();
  });
});
