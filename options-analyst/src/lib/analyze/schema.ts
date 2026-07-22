import { z } from "zod/v4";

/** Exact output contract for the AI analyst. */
export const recommendedActionSchema = z.object({
  action: z.enum(["OPEN", "CLOSE", "ROLL"]),
  ticker: z.string(),
  strategy: z.string(),
  legs: z.array(z.string()),
  /** ISO date YYYY-MM-DD */
  expiration: z.string(),
  rationale: z.string(),
  max_loss: z.number(),
  max_profit: z.number(),
});

export const analysisSchema = z.object({
  market_read: z.string(),
  portfolio_health: z.string(),
  recommended_actions: z.array(recommendedActionSchema),
});

export type RecommendedAction = z.infer<typeof recommendedActionSchema>;
export type Analysis = z.infer<typeof analysisSchema>;
