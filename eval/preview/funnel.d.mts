/** Types for the funnel reader. See funnel.mjs. */
export type Stage = [string, number | null | undefined];
export declare function funnelStages(d: Record<string, number | null | undefined>): Stage[];
export declare function renderFunnel(stages: Stage[]): string;
export declare function diedAt(stages: Stage[]): string | null;
