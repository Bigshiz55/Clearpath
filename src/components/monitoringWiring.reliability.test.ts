import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * RELIABILITY SPRINT — item 9. These files live under src/app/ (routes,
 * not-found/error boundaries, the dashboard page) or are client components
 * wired into a specific failure branch — not meaningfully unit-testable
 * without a live Next.js/Supabase runtime (see quizReachable.test.ts for the
 * established precedent of source-level assertions for this class of file).
 * Each check pins one specific wiring point so a future refactor can't
 * silently drop a reliability report the way `ImportTasteFlow`'s Add button
 * silently dropped all persistence before item 7.
 */
function src(relPath: string): string {
  return readFileSync(join(process.cwd(), relPath), 'utf8');
}

/** These files DESCRIBE the code they must never contain, so prose would
 *  otherwise trip the assertions guarding it. */
const stripComments = (text: string) =>
  text.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');


describe('not-found.tsx reports not_found', () => {
  const file = src('src/app/not-found.tsx');
  it('reports on mount with only the pathname, never the query string', () => {
    expect(file).toMatch(/reportReliabilityEvent\('not_found',\s*\{\s*path:\s*\(pathname/);
    expect(file).not.toMatch(/window\.location\.search|searchParams/);
  });
});

describe('error.tsx root error boundary', () => {
  const file = src('src/app/error.tsx');
  it('reports js_error with only bounded fields, never the message or stack', () => {
    const call = file.match(/reportReliabilityEvent\('js_error',\s*\{[\s\S]*?\}\);/)?.[0];
    expect(call).toBeDefined();
    expect(call).toMatch(/error\.name/);
    expect(call).toMatch(/error\.digest/);
    expect(call).not.toMatch(/error\.message/);
    expect(call).not.toMatch(/error\.stack/);
  });
  it('offers a real recovery action, not just a message', () => {
    expect(file).toMatch(/onClick=\{reset\}/);
  });
});

describe('global-error.tsx root-layout error boundary', () => {
  const file = src('src/app/global-error.tsx');
  it('reports js_error tagged root:true, and stays self-contained', () => {
    expect(file).toMatch(/reportReliabilityEvent\('js_error'/);
    expect(file).toMatch(/root:\s*true/);
    expect(file).not.toMatch(/error\.message/);
    expect(file).toMatch(/<html/);
  });
});

describe('/api/monitor route', () => {
  const file = src('src/app/api/monitor/route.ts');
  it('validates the beacon body with zod against the real event name enum', () => {
    expect(file).toMatch(/RELIABILITY_EVENTS/);
    expect(file).toMatch(/z\.enum\(RELIABILITY_EVENTS\)/);
  });
  it('always responds 204 so a reporting call can never itself fail the caller', () => {
    expect(file).toMatch(/status:\s*204/);
  });
});

describe('/dev/reliability dashboard gating', () => {
  const file = src('src/app/dev/reliability/page.tsx');
  it('404s unless non-production or an admin email, matching the search-qa precedent', () => {
    expect(file).toMatch(/qaAllowedByEnv/);
    expect(file).toMatch(/isAdminEmail/);
    expect(file).toMatch(/notFound\(\)/);
  });
  it('reads from getReliabilitySummary rather than querying Supabase directly', () => {
    expect(file).toMatch(/getReliabilitySummary/);
  });
});

describe('homepage → first-Verdict timing beacon wiring', () => {
  it('HomeArrivalBeacon stamps arrival on mount', () => {
    const file = src('src/components/HomeArrivalBeacon.tsx');
    expect(file).toMatch(/markHomepageArrival/);
    expect(file).toMatch(/useEffect/);
  });
  it('the homepage renders the arrival beacon', () => {
    const file = src('src/app/page.tsx');
    expect(file).toMatch(/<HomeArrivalBeacon/);
  });
  it('VerdictDelivery reports the first genuine winner, not a "too close to call" verdict', () => {
    const file = src('src/components/VerdictDelivery.tsx');
    expect(file).toMatch(/reportFirstVerdictShown/);
    expect(file).toMatch(/state === 'done' && verdict\?\.winner/);
  });
});

describe('named failure-branch wiring', () => {
  it('TitleGridCalibration reports quiz_load_failure on both API-error and exception paths', () => {
    const file = src('src/components/TitleGridCalibration.tsx');
    expect(file.match(/reportReliabilityEvent\('quiz_load_failure'/g)?.length).toBe(2);
  });
  it('LoginForm reports signin_email_failure on OTP send failure', () => {
    const file = src('src/components/auth/LoginForm.tsx');
    expect(file).toMatch(/reportReliabilityEvent\('signin_email_failure'/);
  });
  it('ImportTasteFlow reports import_failure, distinguishing signin-required from a real error', () => {
    const file = src('src/components/import/ImportTasteFlow.tsx');
    expect(file).toMatch(/reportReliabilityEvent\('import_failure',\s*\{\s*reason:/);
  });
  it('HomeRecommendations and Top10Slate report page_load_failure on both timeout/hang and rejection', () => {
    for (const path of ['src/components/HomeRecommendations.tsx', 'src/components/Top10Slate.tsx']) {
      const file = src(path);
      expect(file.match(/reportReliabilityEvent\('page_load_failure'/g)?.length).toBe(2);
    }
  });
  it('tileFacts reports availability_resolution_failure before falling back to EMPTY', () => {
    const file = src('src/lib/tileFacts.ts');
    expect(file).toMatch(/reportReliabilityEvent\('availability_resolution_failure'/);
  });
});

describe('server-side reliability wiring', () => {
  it('tmdbFetch records api_failure on every give-up path except the 404 outcome', () => {
    const file = src('src/lib/tmdb/client.ts');
    const calls = file.match(/recordReliabilityEvent\('api_failure'/g)?.length ?? 0;
    expect(calls).toBeGreaterThanOrEqual(4);
  });
  it('the releases route records new_releases_empty on a degraded or empty result', () => {
    const file = src('src/app/api/releases/route.ts');
    expect(file).toMatch(/recordReliabilityEvent\('new_releases_empty'/);
    expect(file).toMatch(/degraded \|\| items\.length === 0/);
  });
  it('a Pack render performs no ingest at all — so there is no pack_timeout to record', () => {
    // Replaces an assertion that lazyIngest reported pack_timeout. Per-Pack
    // ingest was deleted (see src/lib/packs/packRefresh.ts): a customer GET
    // no longer runs provider I/O, so the timeout it guarded cannot happen
    // on that path. Guarding the absence is what keeps it from coming back.
    const refresh = stripComments(src('src/lib/packs/packRefresh.ts'));
    expect(refresh).not.toMatch(/runTvmazeIngest|runTvMediaIngest/);
    const page = stripComments(src('src/app/packs/[slug]/page.tsx'));
    expect(page).not.toMatch(/ensurePackIngested|runTvmazeIngest/);
  });
});
