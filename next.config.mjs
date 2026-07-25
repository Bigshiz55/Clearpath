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
  return {
    NEXT_PUBLIC_APP_VERSION: pkg.version ?? '0.0.0',
    NEXT_PUBLIC_BUILD_TIME: new Date().toISOString(),
    NEXT_PUBLIC_GIT_SHA: sha,
    NEXT_PUBLIC_GIT_BRANCH: branch,
    NEXT_PUBLIC_VERCEL_ENV: process.env.VERCEL_ENV || (process.env.NODE_ENV === 'production' ? '' : 'development'),
    NEXT_PUBLIC_DEPLOY_URL: process.env.VERCEL_URL || '',
    NEXT_PUBLIC_SCHEMA_VERSION: schema,
    NEXT_PUBLIC_API_VERSION: pkg.apiVersion ?? 'v1',
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
