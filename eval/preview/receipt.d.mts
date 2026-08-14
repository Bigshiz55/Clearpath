/** Types for the structured receipt assertions. See receipt.mjs. */
export declare const TMDB_GENRE: { THRILLER: number; DOCUMENTARY: number };
export declare const TMDB_PERSON: { SYLVESTER_STALLONE: number };
export declare function query(body: unknown): Record<string, unknown>;
export declare function hasGenreId(body: unknown, id: number): boolean;
export declare function excludesGenreId(body: unknown, id: number): boolean;
export declare function hasCastId(body: unknown, personId: number): boolean;
export declare function mediaTypeIs(body: unknown, value: string): boolean;
export declare function maxRuntimeIs(body: unknown, minutes: number | null): boolean;
export declare function kind(body: unknown): string | null;
export declare function requestedCount(body: unknown): number | null;
export declare function subjectIs(body: unknown, term: string): boolean;
export declare function describeQuery(body: unknown): string;
