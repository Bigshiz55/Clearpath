// Runtime env access — read lazily at call time, never at import/build time,
// so `next build` succeeds with no configuration and every integration degrades
// gracefully until its keys are present.

function read(name: string): string | undefined {
  const v = process.env[name];
  return v && v.trim().length > 0 ? v.trim() : undefined;
}

export function siteUrl(): string {
  return read('NEXT_PUBLIC_SITE_URL') ?? 'http://localhost:3000';
}

/** Supabase browser-safe config, or null when not yet configured. */
export function supabasePublicConfig(): { url: string; anonKey: string } | null {
  const url = read('NEXT_PUBLIC_SUPABASE_URL');
  const anonKey = read('NEXT_PUBLIC_SUPABASE_ANON_KEY');
  if (!url || !anonKey) return null;
  return { url, anonKey };
}

/** True once Supabase auth/persistence is configured. */
export function isSupabaseConfigured(): boolean {
  return supabasePublicConfig() !== null;
}

/** Server-only service-role key. Never expose to the client. */
export function supabaseServiceRoleKey(): string | undefined {
  return read('SUPABASE_SERVICE_ROLE_KEY');
}

export function openAiKey(): string | undefined {
  return read('OPENAI_API_KEY');
}

export interface EnvIssue {
  key: string;
  message: string;
  severity: 'error' | 'warning';
}

/**
 * Validate environment at RUNTIME (never at import/build), so `next build`
 * always succeeds with no configuration. Returns issues rather than throwing,
 * so a partially-configured deployment degrades gracefully. Only validates the
 * SHAPE of values that are present.
 */
export function validateEnv(): { ok: boolean; issues: EnvIssue[] } {
  const issues: EnvIssue[] = [];
  const url = read('NEXT_PUBLIC_SUPABASE_URL');
  const anon = read('NEXT_PUBLIC_SUPABASE_ANON_KEY');
  const service = read('SUPABASE_SERVICE_ROLE_KEY');

  if (url && !/^https?:\/\//.test(url)) {
    issues.push({ key: 'NEXT_PUBLIC_SUPABASE_URL', message: 'must be an http(s) URL', severity: 'error' });
  }
  // Partial Supabase config is a warning — the app still runs unauthenticated.
  const supabaseParts = [url, anon, service].filter(Boolean).length;
  if (supabaseParts > 0 && supabaseParts < 2) {
    issues.push({ key: 'SUPABASE_*', message: 'Supabase is partially configured; auth stays disabled', severity: 'warning' });
  }
  const site = read('NEXT_PUBLIC_SITE_URL');
  if (site && !/^https?:\/\//.test(site)) {
    issues.push({ key: 'NEXT_PUBLIC_SITE_URL', message: 'must be an http(s) URL', severity: 'warning' });
  }
  return { ok: issues.every((i) => i.severity !== 'error'), issues };
}
