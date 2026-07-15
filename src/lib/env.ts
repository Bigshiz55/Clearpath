/**
 * Typed environment access.
 *
 * We validate lazily at *request time* (not import/build time) so that
 * `next build` succeeds in CI without real secrets. Each accessor throws a
 * clear, user-friendly error only when a feature that needs the value is
 * actually used.
 */

class ConfigError extends Error {
  readonly userMessage: string;
  constructor(message: string) {
    super(message);
    this.name = 'ConfigError';
    this.userMessage = message;
  }
}

export { ConfigError };

function required(name: string, hint?: string): string {
  const value = process.env[name];
  return requireValue(value, name, hint);
}

/**
 * Clean a configuration value. Trims surrounding whitespace and strips any
 * non-printable / non-ASCII characters. Pasted secrets frequently pick up junk
 * — a trailing newline, a smart quote, or a mask "bullet" (•, U+2022) copied
 * from a field that hides the value behind dots. Any character above code point
 * 255 makes an HTTP header throw a ByteString error, taking down the whole
 * request; our URLs and keys are always plain ASCII, so this is safe.
 */
function clean(value: string | undefined): string {
  // eslint-disable-next-line no-control-regex
  return (value ?? '').trim().replace(/[^\x20-\x7E]/g, '');
}

function requireValue(
  value: string | undefined,
  name: string,
  hint?: string,
): string {
  const cleaned = clean(value);
  if (!cleaned) {
    throw new ConfigError(
      `Missing required configuration: ${name}.${hint ? ' ' + hint : ''}`,
    );
  }
  return cleaned;
}

function optional(name: string): string | undefined {
  const value = clean(process.env[name]);
  return value ? value : undefined;
}

export const publicEnv = {
  // IMPORTANT: these must reference `process.env.NEXT_PUBLIC_*` as *static*
  // literals (not `process.env[name]`). Next.js only inlines public env vars
  // into the client bundle when it can see the literal key at build time. A
  // dynamic lookup would be `undefined` in the browser even when the value is
  // configured, which surfaces as a bogus "Missing required configuration".
  supabaseUrl(): string {
    return requireValue(
      process.env.NEXT_PUBLIC_SUPABASE_URL,
      'NEXT_PUBLIC_SUPABASE_URL',
      'Set it to your Supabase project URL.',
    );
  },
  supabasePublishableKey(): string {
    return requireValue(
      process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
      'NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY',
      'Set it to your Supabase publishable (anon) key.',
    );
  },
  siteUrl(): string {
    // Falls back to localhost in dev; safe non-secret default.
    const value = process.env.NEXT_PUBLIC_SITE_URL;
    return value && value.trim() !== '' ? value : 'http://localhost:3000';
  },
  vapidPublicKey(): string | undefined {
    const v = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
    return v && v.trim() !== '' ? v.trim() : undefined;
  },
};

export const serverEnv = {
  tmdbKey(): string {
    return required(
      'TMDB_API_KEY',
      'Get a free key at https://www.themoviedb.org/settings/api',
    );
  },
  tmdbKeyOptional(): string | undefined {
    return optional('TMDB_API_KEY');
  },
  serviceRoleKey(): string {
    return required(
      'SUPABASE_SERVICE_ROLE_KEY',
      'This server-only key is needed for account deletion.',
    );
  },
  openaiKey(): string | undefined {
    return optional('OPENAI_API_KEY');
  },
  omdbKey(): string | undefined {
    return optional('OMDB_API_KEY');
  },
  mdblistKey(): string | undefined {
    return optional('MDBLIST_API_KEY');
  },
  cronSecret(): string | undefined {
    return optional('CRON_SECRET');
  },
  resendKey(): string | undefined {
    return optional('RESEND_API_KEY');
  },
  vapidPrivateKey(): string | undefined {
    return optional('VAPID_PRIVATE_KEY');
  },
  vapidSubject(): string {
    return optional('VAPID_SUBJECT') ?? 'mailto:notifications@watchverdict.app';
  },
  /** Comma/space-separated allowlist of admin emails (ADMIN_EMAILS). */
  adminEmails(): string[] {
    return (optional('ADMIN_EMAILS') ?? '')
      .split(/[,\s]+/)
      .map((s) => s.trim().toLowerCase())
      .filter(Boolean);
  },
};

/**
 * Non-throwing snapshot used by the health endpoint and startup diagnostics.
 * Reports *presence* only — never returns the secret values themselves.
 */
export function envHealth() {
  return {
    supabaseUrl: Boolean(optional('NEXT_PUBLIC_SUPABASE_URL')),
    supabasePublishableKey: Boolean(
      optional('NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY'),
    ),
    tmdbKey: Boolean(optional('TMDB_API_KEY')),
    serviceRoleKey: Boolean(optional('SUPABASE_SERVICE_ROLE_KEY')),
    openaiKey: Boolean(optional('OPENAI_API_KEY')),
    omdbKey: Boolean(optional('OMDB_API_KEY')),
    mdblistKey: Boolean(optional('MDBLIST_API_KEY')),
    cronSecret: Boolean(optional('CRON_SECRET')),
    resendKey: Boolean(optional('RESEND_API_KEY')),
    push: Boolean(optional('NEXT_PUBLIC_VAPID_PUBLIC_KEY') && optional('VAPID_PRIVATE_KEY')),
    siteUrl: publicEnv.siteUrl(),
  };
}
