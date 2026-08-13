/**
 * Types for `preflight.mjs`.
 *
 * The implementation is plain `.mjs` on purpose — the refresh entrypoint is a
 * Node script that runs BEFORE any TypeScript tooling is loaded, which is the
 * whole point of a preflight. This declaration is what lets the vitest suite
 * import it with the same type safety as any other module.
 */
export declare const REFUSAL: string;

export interface DirtyEntry {
  /** The two porcelain status characters, e.g. ' M', '??', 'A '. */
  status: string;
  path: string;
}

export declare function dirtyEntries(porcelain: string): DirtyEntry[];
export declare function isCleanTree(porcelain: string): boolean;
export declare function refusalMessage(porcelain: string): string;
