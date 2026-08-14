/** Types for the black-box world oracle. See world.mjs. */
export type FactVerdict = 'PROVEN' | 'REFUTED' | 'UNPROVABLE';
export declare const FACT: Record<FactVerdict, FactVerdict>;
export interface Fact { verdict: FactVerdict; why: string }
/** Enough to ASK the deployment about a candidate: which title, which route. */
export interface WorldItem { id: number; mediaType: string; title: string }
/** Enough to READ the product's own eligibility verdict off a candidate. The
 *  subject proof needs no id, because it asks the deployment nothing. */
export interface SubjectCandidate { title?: string; subjectEvidence?: Record<string, unknown> }
export declare function subjectFact(item: SubjectCandidate, expectedSubject: string): Fact;
export declare function genresFor(baseUrl: string, headers: Record<string, string>, item: WorldItem): Promise<string[] | null>;
export declare function genreFact(baseUrl: string, headers: Record<string, string>, item: WorldItem, genreName: string): Promise<Fact>;
export declare function topBilledFor(baseUrl: string, headers: Record<string, string>, item: WorldItem): Promise<{ id: number; name: string; knownFor?: string }[] | null>;
export declare function castFact(baseUrl: string, headers: Record<string, string>, item: WorldItem, personId: number, personName: string): Promise<Fact>;
export declare function resolvePersonId(baseUrl: string, headers: Record<string, string>, name: string): Promise<number | null>;
export declare function foldFacts(facts: Fact[]): { ok: boolean; gap: boolean; detail: string; facts: Fact[] };
