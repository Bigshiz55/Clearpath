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
  if (!value || value.trim() === '') {
    throw new ConfigError(
      `Missing required configuration: ${name}.${hint ? ' ' + hint : ''}`,
    );
  }
  return value;
}

function optional(name: string): string | undefined {
  const value = process.env[name];
  return value && value.trim() !== '' ? value : undefined;
}

export const publicEnv = {
  supabaseUrl(): string {
    return required(
      'NEXT_PUBLIC_SUPABASE_URL',
      'Set it to your Supabase project URL.',
    );
  },
  supabasePublishableKey(): string {
    return required(
      'NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY',
      'Set it to your Supabase publishable (anon) key.',
    );
  },
  siteUrl(): string {
    // Falls back to localhost in dev; safe non-secret default.
    return optional('NEXT_PUBLIC_SITE_URL') ?? 'http://localhost:3000';
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
    siteUrl: publicEnv.siteUrl(),
  };
}
