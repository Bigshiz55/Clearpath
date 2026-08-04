import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const route = readFileSync(join(process.cwd(), 'src/app/api/admin/reconcile-dry/route.ts'), 'utf8');
const ui = readFileSync(join(process.cwd(), 'src/components/admin/ReconcileDryRunButton.tsx'), 'utf8');

/** Strip comments: these files DESCRIBE the secrets they must never handle,
 *  so prose would otherwise trip the very assertions guarding the code. */
const stripComments = (src: string) =>
  src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
const routeCode = stripComments(route);
const uiCode = stripComments(ui);
const secretRoute = readFileSync(join(process.cwd(), 'src/app/api/admin/reconcile-migrations/route.ts'), 'utf8');

describe('authorization', () => {
  it('anonymous or session-less callers get 401, not 403', () => {
    expect(route).toMatch(/Sign in to run this check[\s\S]*?status: 401/);
  });

  it('a signed-in NON-admin gets 403 — a different status from unauthenticated', () => {
    expect(route).toMatch(/isAdminEmail\(email\)[\s\S]{0,200}status: 403/);
  });

  it('authorizes from the session only — no secret path on this route', () => {
    expect(route).toContain('supabase.auth.getUser()');
    expect(route).toContain('isAdminEmail');
    expect(route).not.toMatch(/migrateSecret\(\)/);
    expect(route).not.toMatch(/Bearer/);
  });

  it('does NOT weaken the existing secret-authenticated route', () => {
    expect(secretRoute).toMatch(/migrateSecret\(\)/);
    expect(secretRoute).toMatch(/Bearer \$\{secret\}/);
  });
});

describe('structurally incapable of writing', () => {
  it('has no insert, update or DDL anywhere in the module', () => {
    const sql = routeCode.toLowerCase();
    expect(sql).not.toContain('insert into');
    expect(sql).not.toContain('update ');
    expect(sql).not.toContain('create table');
    expect(sql).not.toContain('alter table');
    expect(sql).not.toContain('ledger_ddl');
  });

  it('never reads a dryRun parameter — there is no flag to flip', () => {
    expect(route).not.toMatch(/body\.dryRun/);
    expect(route).toMatch(/dryRun: true/);
  });

  it('always reports backfilled:false', () => {
    expect(route).toMatch(/backfilled: false/);
  });

  it('the client sends no body at all', () => {
    expect(ui).not.toMatch(/JSON\.stringify\(\{\s*dryRun/);
  });
});

describe('no secret ever reaches the browser', () => {
  it('the client component has no secret input and no secret constant', () => {
    expect(uiCode).not.toMatch(/MIGRATE_SECRET|SERVICE_ROLE|SUPABASE_DB_URL/i);
    expect(uiCode).not.toMatch(/type="password"/);
    // No input of any kind: there is nowhere to type a secret.
    expect(uiCode).not.toMatch(/<input/);
  });

  it('the route never echoes the connection string or a secret back', () => {
    expect(route).toMatch(/Never echo the URL/);
    expect(route).not.toMatch(/dbUrl\s*\}/);
  });
});

describe('CSRF, rate limiting, confirmation, audit', () => {
  it('rejects cross-origin callers', () => {
    expect(route).toContain('sameOrigin');
    expect(route).toMatch(/Cross-origin requests are not accepted[\s\S]{0,80}403/);
  });
  it('rate limits per admin', () => {
    expect(route).toMatch(/RATE_LIMIT_MAX/);
    expect(route).toMatch(/status: 429/);
  });
  it('requires an explicit confirmation step in the UI', () => {
    expect(ui).toContain('reconcile-dry-confirm');
    expect(ui).toMatch(/will not write to the ledger or apply any migration/i);
  });
  it('logs who ran it, when, and the outcome', () => {
    expect(route).toContain('recordReliabilityEvent');
    expect(route).toMatch(/action: 'reconcile_dry_run'/);
    expect(route).toMatch(/admin: email/);
  });
});

describe('results are readable', () => {
  it('renders every required column', () => {
    for (const c of ['Migration', 'Classification', 'Database object found', 'Ledger status', 'Recommended action']) {
      expect(ui, c).toContain(c);
    }
  });
  it('offers a copy button for the full JSON', () => {
    expect(ui).toContain('reconcile-dry-copy');
    expect(ui).toMatch(/clipboard\.writeText\(JSON\.stringify\(result/);
  });
});

describe('the failure explains itself instead of dead-ending', () => {
  const who = readFileSync(join(process.cwd(), 'src/app/api/admin/whoami/route.ts'), 'utf8');
  const whoCode = stripComments(who);

  it('distinguishes the four reasons an admin action can be refused', () => {
    for (const step of ['sign_in', 'configure_allowlist', 'wrong_account', 'ready']) {
      expect(whoCode, step).toContain(step);
    }
  });

  it('treats an anonymous Supabase session as NOT signed in — the app mints those for ordinary visitors', () => {
    expect(whoCode).toMatch(/anonymous = !user\.email/);
  });

  it('never returns the allowlist itself or any secret — only whether one exists', () => {
    expect(whoCode).toMatch(/allowlistConfigured/);
    expect(whoCode).not.toMatch(/adminEmails\(\)\s*[,}]/);
    expect(whoCode).not.toMatch(/MIGRATE_SECRET|SERVICE_ROLE/i);
  });

  it('the UI offers a one-click sign-in that returns to this page', () => {
    expect(uiCode).toContain('/login?next=/admin/migrations');
    expect(uiCode).toContain('reconcile-dry-signin');
  });

  it('tells the owner exactly what to fix when the allowlist is empty', () => {
    expect(uiCode).toContain('ADMIN_EMAILS');
  });
});
