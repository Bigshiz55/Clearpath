import { execSync } from 'node:child_process';
import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dir = dirname(fileURLToPath(import.meta.url));

/** Read build metadata ONCE at build time. Never hardcoded — sourced from
 *  package.json, Vercel's git env, a local git fallback, and the migrations dir. */
function buildMeta() {
  const pkg = JSON.parse(readFileSync(join(__dir, 'package.json'), 'utf8'));
  const git = (cmd, fallback = '') => {
    try {
      return execSync(cmd, { cwd: __dir, stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim();
    } catch {
      return fallback;
    }
  };
  const sha = process.env.VERCEL_GIT_COMMIT_SHA || git('git rev-parse HEAD');
  const branch = process.env.VERCEL_GIT_COMMIT_REF || git('git rev-parse --abbrev-ref HEAD');
  let schema = '';
  try {
    schema = readdirSync(join(__dir, 'supabase', 'migrations'))
      .filter((f) => f.endsWith('.sql'))
      .sort()
      .pop()?.replace(/\.sql$/, '') ?? '';
  } catch { /* none */ }
  // The ONE place the site's canonical URL is computed. Every og:url,
  // canonical tag, sitemap entry, and share/invite link reads this same
  // value via `publicEnv.siteUrl()` (src/lib/env.ts) — nothing else may
  // hardcode a domain or default to localhost.
  //
  // A manually-set NEXT_PUBLIC_SITE_URL wins — UNLESS it's obviously not
  // this site's own URL on a real Vercel build. Root-caused on production:
  // NEXT_PUBLIC_SITE_URL was set to the SUPABASE project URL (the adjacent
  // field in DEPLOYMENT.md's env table — an easy paste mistake), which
  // src/lib/env.ts's `isSupabaseHost` guard already caught at runtime, but
  // that guard's own fallback was a bare 'http://localhost:3000' rather
  // than a self-heal — so the canonical/og:url still ended up wrong, just
  // one layer further downstream than expected. Localhost itself is the
  // other documented mistake this must also catch. `process.env.VERCEL_ENV`
  // is set by Vercel on every build (production, preview, even a
  // Vercel-run development build) and never set on a plain local `next
  // dev`/`next build`, so it's the right signal for "this is a real
  // deployment — a value that clearly isn't our own domain can only be a
  // mistake, not an intentional override."
  //
  // Absent (or overridden past) a bad explicit value, this self-heals from
  // Vercel's own system env vars: production always resolves to the stable
  // production domain (VERCEL_PROJECT_PRODUCTION_URL, with the known
  // permanent domain as a last-resort literal), a preview deploy points at
  // its own preview URL rather than falsely claiming to be production, and
  // only a plain local dev server with no Vercel env at all falls back to
  // localhost.
  const isObviouslyNotOurSite = (value) => {
    let hostname;
    try {
      hostname = new URL(value).hostname;
    } catch {
      return true; // not even a valid absolute URL
    }
    return /^localhost$/i.test(hostname) || /(^|\.)supabase\.co$/i.test(hostname);
  };
  const explicitSiteUrl = (process.env.NEXT_PUBLIC_SITE_URL || '').trim();
  const explicitIsBad = Boolean(process.env.VERCEL_ENV) && isObviouslyNotOurSite(explicitSiteUrl);
  const siteUrl =
    explicitSiteUrl && !explicitIsBad
      ? explicitSiteUrl
      : process.env.VERCEL_ENV === 'production'
        ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL || 'clearpath-pearl-chi.vercel.app'}`
        : process.env.VERCEL_URL
          ? `https://${process.env.VERCEL_URL}`
          : 'http://localhost:3000';

  return {
    NEXT_PUBLIC_APP_VERSION: pkg.version ?? '0.0.0',
    NEXT_PUBLIC_BUILD_TIME: new Date().toISOString(),
    NEXT_PUBLIC_GIT_SHA: sha,
    NEXT_PUBLIC_GIT_BRANCH: branch,
    NEXT_PUBLIC_VERCEL_ENV: process.env.VERCEL_ENV || (process.env.NODE_ENV === 'production' ? '' : 'development'),
    NEXT_PUBLIC_DEPLOY_URL: process.env.VERCEL_URL || '',
    NEXT_PUBLIC_SCHEMA_VERSION: schema,
    NEXT_PUBLIC_API_VERSION: pkg.apiVersion ?? 'v1',
    NEXT_PUBLIC_SITE_URL: siteUrl,
  };
}

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  env: buildMeta(),
  images: {
    remotePatterns: [
      { protocol: 'https', hostname: 'image.tmdb.org' },
    ],
  },
  async headers() {
    const securityHeaders = [
      { key: 'X-Content-Type-Options', value: 'nosniff' },
      { key: 'X-Frame-Options', value: 'DENY' },
      { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
      // microphone=(self): voice search (SearchBar SpeechRecognition) needs the
      // mic on our own origin; an empty allowlist silently breaks the mic
      // button in production. Camera/geolocation stay fully denied.
      { key: 'Permissions-Policy', value: 'camera=(), microphone=(self), geolocation=()' },
      {
        key: 'Strict-Transport-Security',
        value: 'max-age=63072000; includeSubDomains; preload',
      },
    ];
    return [
      { source: '/:path*', headers: securityHeaders },
      // Never cache authenticated app responses.
      {
        source: '/app/:path*',
        headers: [{ key: 'Cache-Control', value: 'private, no-store' }],
      },
      {
        source: '/api/:path*',
        headers: [{ key: 'Cache-Control', value: 'no-store' }],
      },
    ];
  },
};

export default nextConfig;
