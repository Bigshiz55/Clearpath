import { z } from "zod/v4";

/** Portfolio shape the user edits in the UI and posts to /api/analyze. */
export const optionPositionSchema = z.object({
  ticker: z.string().min(1).max(10),
  type: z.enum(["call", "put"]),
  side: z.enum(["long", "short"]),
  strike: z.number().positive(),
  /** ISO date, e.g. "2026-08-21" */
  expiration: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  contracts: z.number().int().positive(),
  costBasis: z.number().optional(),
});

export const equityPositionSchema = z.object({
  ticker: z.string().min(1).max(10),
  shares: z.number(),
  costBasis: z.number().optional(),
});

export const portfolioSchema = z.object({
  cash: z.number().nonnegative(),
  equities: z.array(equityPositionSchema).default([]),
  options: z.array(optionPositionSchema).default([]),
});

export type OptionPosition = z.infer<typeof optionPositionSchema>;
export type EquityPosition = z.infer<typeof equityPositionSchema>;
export type Portfolio = z.infer<typeof portfolioSchema>;

export const SAMPLE_PORTFOLIO: Portfolio = {
  cash: 25000,
  equities: [
    { ticker: "AAPL", shares: 100, costBasis: 185 },
    { ticker: "SPY", shares: 50, costBasis: 520 },
  ],
  options: [
    {
      ticker: "AAPL",
      type: "call",
      side: "short",
      strike: 250,
      expiration: "2026-08-21",
      contracts: 1,
      costBasis: 3.5,
    },
  ],
};
