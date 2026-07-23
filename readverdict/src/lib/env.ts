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
