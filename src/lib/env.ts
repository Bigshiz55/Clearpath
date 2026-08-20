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

/**
 * Catches the setup mistake of pasting the Supabase project URL — the
 * adjacent field in DEPLOYMENT.md's env table — into NEXT_PUBLIC_SITE_URL
 * instead of the deployed app's own URL. Every canonical/og:url in the app
 * is built from `siteUrl()` below, so a Supabase URL there would make every
 * shared link preview point at the database instead of the site.
 */
function isSupabaseHost(url: string): boolean {
  try {
    return /(^|\.)supabase\.co$/i.test(new URL(url).hostname);
  } catch {
    return false;
  }
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
  /**
   * THE ONLY function that may know the site's own URL. Every canonical
   * tag, og:url, sitemap entry, and share/invite link must call this —
   * never read `NEXT_PUBLIC_SITE_URL` or hardcode a domain directly, or
   * the value stops being centralized.
   *
   * `NEXT_PUBLIC_SITE_URL` itself is computed once, at build time, in
   * next.config.mjs — it self-heals to the real deployment's domain via
   * Vercel's own system env vars even when nobody has set it by hand, so
   * this should only ever see localhost during a plain local `next dev`.
   */
  siteUrl(): string {
    const value = process.env.NEXT_PUBLIC_SITE_URL;
    const trimmed = value && value.trim() !== '' ? value.trim() : null;
    if (trimmed && isSupabaseHost(trimmed)) return 'http://localhost:3000';
    return trimmed ?? 'http://localhost:3000';
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
    /* BOTH SUPABASE KEY GENERATIONS ARE ACCEPTED. Supabase's dashboard now
       issues secret keys in the `sb_secret_…` format under the name
       SUPABASE_SECRET_KEY; the legacy JWT-format service_role key remains
       valid under its historical name. supabase-js takes either value as the
       privileged key parameter, and this code never inspects the format —
       so the only failure mode was the VARIABLE NAME. The legacy name wins
       when both are set (existing deployments change nothing). */
    const modern = optional('SUPABASE_SECRET_KEY');
    const legacy = optional('SUPABASE_SERVICE_ROLE_KEY');
    if (legacy) return legacy;
    if (modern) return modern;
    return required(
      'SUPABASE_SERVICE_ROLE_KEY',
      'This server-only key is needed for privileged reads/writes (account deletion, ledger reads). The new-format SUPABASE_SECRET_KEY (sb_secret_…) is accepted too.',
    );
  },
  openaiKey(): string | undefined {
    return optional('OPENAI_API_KEY');
  },
  /**
   * Anthropic API key for the AI orchestrator (the Claude interpretation layer).
   * Server-only — never NEXT_PUBLIC, never logged, never returned to the browser
   * or included in an artifact. Optional: absent means the discovery brain
   * degrades to the deterministic path (see AI_DISCOVERY_MODE). Production traffic
   * must use the official Anthropic API with a key set here — nothing else.
   */
  anthropicKey(): string | undefined {
    return optional('ANTHROPIC_API_KEY');
  },
  /** Which provider the AI adapter uses. Provider-independent by design; only the
   *  factory reads this. Defaults to anthropic. */
  aiProvider(): string {
    return (optional('AI_PROVIDER') ?? 'anthropic').toLowerCase();
  },
  /** The interpretation model id. Defaults to claude-sonnet-5. */
  aiModel(): string {
    return optional('AI_MODEL') ?? 'claude-sonnet-5';
  },
  /**
   * Model-routing config (§11). Present so the fields exist and are documented,
   * but multi-model routing is NOT enabled yet — every call uses aiModel() until
   * routing is turned on deliberately. Each falls back to the primary model.
   */
  aiModelRouting(): { simple: string; primary: string; complex: string } {
    const primary = optional('AI_PRIMARY_MODEL') ?? this.aiModel();
    return {
      simple: optional('AI_SIMPLE_MODEL') ?? primary,
      primary,
      complex: optional('AI_COMPLEX_MODEL') ?? primary,
    };
  },
  /**
   * The discovery brain's mode (§13). THREE values:
   *   'legacy'    — the deterministic/OpenAI path serves every request; the
   *                 Claude layer is never invoked. This is the DEFAULT, so
   *                 turning the feature on is an explicit owner action and
   *                 nothing changes in production until it is.
   *   'shadow'    — legacy still serves the user; Claude interprets in parallel
   *                 and only safe comparison telemetry is stored.
   *   'anthropic' — Claude interpretation drives results, degrading to legacy on
   *                 any failure.
   * Any unrecognized value is treated as 'legacy' (fail safe).
   */
  aiDiscoveryMode(): 'legacy' | 'shadow' | 'anthropic' {
    const v = (optional('AI_DISCOVERY_MODE') ?? 'legacy').toLowerCase();
    return v === 'shadow' || v === 'anthropic' ? v : 'legacy';
  },
  omdbKey(): string | undefined {
    return optional('OMDB_API_KEY');
  },
  mdblistKey(): string | undefined {
    return optional('MDBLIST_API_KEY');
  },
  /** Watchmode — streaming availability + deep links. Optional; TMDB is the
   *  fallback when unset. Get a key at https://api.watchmode.com/. */
  watchmodeKey(): string | undefined {
    return optional('WATCHMODE_API_KEY');
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
  /** Direct Postgres connection string for admin migrations (SUPABASE_DB_URL or
   *  MIGRATIONS_DB_URL). Optional — the migrate endpoint is dormant without it. */
  migrationsDbUrl(): string | undefined {
    return optional('SUPABASE_DB_URL') ?? optional('MIGRATIONS_DB_URL');
  },
  /** Shared secret that also authorizes the migrate endpoint (MIGRATE_SECRET). */
  migrateSecret(): string | undefined {
    return optional('MIGRATE_SECRET');
  },
  /**
   * TEMPORARY founder access code. Server-only, never NEXT_PUBLIC, never
   * logged, never returned by any API. Its presence alone enables the
   * /founder/access flow; its absence disables that flow entirely (the route
   * then behaves as if it does not exist).
   *
   * Must NOT be shared with any service credential — it is its own secret.
   */
  founderAccessCode(): string | undefined {
    const v = optional('FOUNDER_ACCESS_CODE');
    // A short code is not defensible behind any rate limiter; refuse to treat
    // one as configured rather than offering false assurance.
    return v && v.length >= 16 ? v : undefined;
  },
  /**
   * Allowlist of admin emails (ADMIN_EMAILS), separated by commas OR whitespace
   * — including newlines, because Vercel's env editor is a textarea and people
   * paste one address per line.
   *
   * This deliberately splits the RAW value BEFORE `clean()` touches it.
   * `clean()` strips non-printable characters by DELETING them, so cleaning
   * first turns "a@x.com\nb@y.com" into the single fused entry
   * "a@x.comb@y.com" — the list still looks populated (count 1) while matching
   * nobody, which is a 404 with no diagnosis attached.
   */
  adminEmails(): string[] {
    return (process.env.ADMIN_EMAILS ?? '')
      .split(/[,;\s]+/)
      .map((s) => clean(s).toLowerCase())
      .filter(Boolean);
  },
  /**
   * Approved founder accounts for the /TestScott · /TestHeather · /TestAmy
   * environments. Server-only; these are EMAILS of real sign-in accounts, never
   * credentials. A founder route is accessible only to its mapped email (or an
   * admin). Set FOUNDER_SCOTT_EMAIL / FOUNDER_HEATHER_EMAIL / FOUNDER_AMY_EMAIL.
   */
  founderEmails(): Record<'scott' | 'heather' | 'amy', string | undefined> {
    const norm = (v?: string) => (v ? v.trim().toLowerCase() || undefined : undefined);
    return {
      scott: norm(optional('FOUNDER_SCOTT_EMAIL')),
      heather: norm(optional('FOUNDER_HEATHER_EMAIL')),
      amy: norm(optional('FOUNDER_AMY_EMAIL')),
    };
  },
  /**
   * Affiliate program tags — appended to provider deep links at redirect time.
   * These are NOT secrets (they ride in the public outbound URL), but we read
   * them server-side so they never bloat the client bundle. Each is optional;
   * a service earns nothing until its tag is set.
   */
  affiliateConfig(): { amazonTag?: string; appleToken?: string; appleCampaign?: string } {
    return {
      amazonTag: optional('AMAZON_ASSOCIATES_TAG'),
      appleToken: optional('APPLE_AFFILIATE_TOKEN'),
      appleCampaign: optional('APPLE_AFFILIATE_CAMPAIGN'),
    };
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
    // Presence of EITHER privileged-key generation (legacy service_role JWT
    // or the new sb_secret_… under SUPABASE_SECRET_KEY) — the same resolution
    // serverEnv.serviceRoleKey() performs.
    serviceRoleKey: Boolean(optional('SUPABASE_SERVICE_ROLE_KEY') || optional('SUPABASE_SECRET_KEY')),
    openaiKey: Boolean(optional('OPENAI_API_KEY')),
    anthropicKey: Boolean(optional('ANTHROPIC_API_KEY')),
    aiProvider: (optional('AI_PROVIDER') ?? 'anthropic').toLowerCase(),
    aiModel: optional('AI_MODEL') ?? 'claude-sonnet-5',
    aiDiscoveryMode: (() => {
      const v = (optional('AI_DISCOVERY_MODE') ?? 'legacy').toLowerCase();
      return v === 'shadow' || v === 'anthropic' ? v : 'legacy';
    })(),
    omdbKey: Boolean(optional('OMDB_API_KEY')),
    mdblistKey: Boolean(optional('MDBLIST_API_KEY')),
    watchmodeKey: Boolean(optional('WATCHMODE_API_KEY')),
    cronSecret: Boolean(optional('CRON_SECRET')),
    resendKey: Boolean(optional('RESEND_API_KEY')),
    push: Boolean(optional('NEXT_PUBLIC_VAPID_PUBLIC_KEY') && optional('VAPID_PRIVATE_KEY')),
    affiliate: Boolean(optional('AMAZON_ASSOCIATES_TAG') || optional('APPLE_AFFILIATE_TOKEN')),
    migrateSecret: Boolean(optional('MIGRATE_SECRET')),
    migrationsDbUrl: Boolean(optional('SUPABASE_DB_URL') || optional('MIGRATIONS_DB_URL')),
    siteUrl: publicEnv.siteUrl(),
  };
}
