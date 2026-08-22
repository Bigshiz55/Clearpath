import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * P0-5 GUARD: no customer-facing screen may expose internal/technical language.
 *
 * These files render copy to end users (error UI, empty states, toasts). They
 * previously leaked migration numbers ("migrations (0004, 0014, 0026)"),
 * devops terms ("this deployment"), internal cadence ("refreshes hourly") and
 * raw config reasons ("DATA_MODE is not set …"). The user-safe rewrites are
 * easy to quietly regress, so the class is asserted at source level rather than
 * merely documented. Technical detail may still be LOGGED (console.*) — those
 * lines are stripped below because a log is not a screen.
 */

const read = (p: string) => readFileSync(join(process.cwd(), p), 'utf8');

/** Comments and log lines describe the very leaks we forbid on screen, so drop
 *  them before asserting: only what can actually reach a user is checked. */
const sanitize = (src: string) =>
  src
    .replace(/\/\*[\s\S]*?\*\//g, '') // block + JSX comments
    .replace(/^\s*\/\/.*$/gm, '') // whole-line // comments
    .split('\n')
    .filter((line) => !line.includes('console.')) // internal logging, never rendered
    .join('\n');

/** Every file P0-5 rewrote whose strings render to end users. */
const USER_FACING_FILES = [
  'src/components/court/CourtRoom.tsx',
  'src/components/LiveCourt.tsx',
  'src/app/app/friends/page.tsx',
  'src/app/app/u/[username]/page.tsx',
  'src/components/packs/ChecklistSection.tsx',
  'src/components/OnTvGuide.tsx',
  'src/app/app/tv/page.tsx',
  'src/app/app/what-to-watch/page.tsx',
  'src/components/watch/AvailabilityPanel.tsx',
  'src/components/tv/WatchNowList.tsx',
  'src/components/tv/CoverageNote.tsx',
  'src/app/api/court/repick/route.ts',
  'src/app/api/court/start/route.ts',
];

/** Internal/technical language that must never reach a customer-facing screen. */
const FORBIDDEN: Array<{ label: string; re: RegExp }> = [
  { label: 'migration number', re: /migrations?\s*\(?\s*0\d{3}/i },
  { label: 'database/Supabase migration phrase', re: /\b(?:database|supabase)\s+migrations?\b/i },
  { label: 'devops "this deployment"', re: /\bthis deployment\b/i },
  { label: 'devops "for/on this deployment"', re: /\b(?:for|on)\s+this deployment\b/i },
  { label: 'internal cadence "refreshes/refreshed hourly"', re: /refreshe[sd]\s+hourly/i },
  { label: 'raw config env var DATA_MODE', re: /\bDATA_MODE\b/ },
];

describe('P0-5 — user-facing copy exposes no internal/technical language', () => {
  for (const file of USER_FACING_FILES) {
    const rendered = sanitize(read(file));
    for (const { label, re } of FORBIDDEN) {
      it(`${file} has no ${label}`, () => {
        expect(rendered).not.toMatch(re);
      });
    }
  }
});
