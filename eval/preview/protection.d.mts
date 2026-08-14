/**
 * Types for the dependency-free protection probe.
 *
 * The implementation is `.mjs` ON PURPOSE: the black-box workflow runs it with
 * bare `node` and no `npm ci`, so the gate cannot depend on an install step it
 * does not have. This declaration is what lets a `.ts` test import it under the
 * `tsc --noEmit` gate.
 */

export type TransportKind = 'DNS' | 'TLS' | 'TIMEOUT' | 'REDIRECT_LOOP' | 'CONNECTION' | 'UNKNOWN';

export type ProtectionVerdict =
  | 'PASSED'
  | 'BYPASS_REJECTED'
  | 'PROTECTION_CHALLENGE'
  | 'UNAUTHORIZED'
  | 'COOKIE_HANDSHAKE'
  | 'FOREIGN_REDIRECT'
  | 'NOT_JSON'
  | 'HTTP_ERROR'
  | 'TRANSPORT';

export declare const PROTECTION: Record<ProtectionVerdict, ProtectionVerdict>;
export declare const TRANSPORT: Record<TransportKind, TransportKind>;

export interface TransportFailure {
  kind: TransportKind;
  code?: string;
  message: string;
}

export interface RedirectDescription {
  /** Hostname (with port when present). Never the query string. */
  host: string;
  /** Path only. Never the query string. */
  path: string;
  kind: 'same-origin' | 'vercel-sso' | 'foreign' | 'malformed';
}

export interface ProtectionResult {
  verdict: ProtectionVerdict;
  bypassSent: boolean;
  status?: number;
  redirect?: RedirectDescription | null;
  transport?: TransportFailure;
  contentType?: string;
  json?: unknown;
}

export interface RequestOptions {
  method?: string;
  headers?: Record<string, string>;
  body?: string;
  timeoutMs?: number;
  fetchImpl?: typeof fetch;
}

export type RequestResult =
  | { ok: true; status: number; res: Response; location: string | null }
  | { ok: false; error: TransportFailure };

export declare function makeRedactor(secrets?: (string | undefined)[]): (text: unknown) => string;
export declare function classifyTransportError(err: unknown): TransportFailure;
export declare function classifyLocation(location: string | null, baseUrl: string): RedirectDescription | null;
export declare function bypassHeaders(bypass: string, extra?: Record<string, string>): Record<string, string>;
export declare function looksLikeVercelProtection(body: unknown): boolean;
export declare function request(url: string, options?: RequestOptions): Promise<RequestResult>;
export declare function diagnoseProtection(
  baseUrl: string,
  bypass: string,
  options?: { timeoutMs?: number; fetchImpl?: typeof fetch; path?: string },
): Promise<ProtectionResult>;
export declare function explainProtection(result: ProtectionResult, redact?: (text: unknown) => string): string;
