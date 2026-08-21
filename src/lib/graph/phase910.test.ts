/**
 * PHASES 4/9/10 — the content-evidence layer joins main, the inspectors read
 * real provenance, and a "why" can only say what a run's edges prove.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { join } from 'node:path';
import { groundedWhy } from './groundedWhy';
import { inv7BecauseMapsToEvidence, checkRunInvariants } from './invariants';
import type { DecisionRun } from './types';

const ROOT = join(__dirname, '..', '..', '..');
const CREATED = '2026-08-21T02:00:00.000Z';

describe('Phase 4 — the deployed knowledge schema is reconciled into main', () => {
  it('0048_title_knowledge.sql is byte-identical to the migration production applied', () => {
    /* The owner applied 0048 to the production database from the abandoned
       claude/watch-verdict-app-wwbtbg branch (commit 1d91866) — the DB's CLI
       ledger names it. Bringing a DIFFERENT file under the same name would
       poison the name+checksum ledger discipline; this pins the exact bytes. */
    const sql = readFileSync(join(ROOT, 'supabase/migrations/0048_title_knowledge.sql'));
    expect(createHash('sha256').update(sql).digest('hex')).toBe(
      'f6633c13171f1116aa2786a459063c186420f033dbbe3a82787fcc4378eea0a7',
    );
  });

  it('the tables are declared in the schema contract and the migration registry', () => {
    const contract = readFileSync(join(ROOT, 'src/lib/schemaContract.ts'), 'utf8');
    expect(contract).toMatch(/title_knowledge/);
    expect(contract).toMatch(/title_subject_facts/);
    const pending = readFileSync(join(ROOT, 'src/lib/pendingMigrations.ts'), 'utf8');
    expect(pending).toMatch(/0047_decision_runs/);
    expect(pending).toMatch(/0048_title_knowledge/);
  });
});

describe('Phase 10 — a why can only say what the edges prove', () => {
  const run: DecisionRun = {
    id: 'r',
    entryPoint: 'ask',
    rawText: 'a boxing movie',
    intent: { kind: 'recommendation', persistence: 'request_only' },
    edges: [
      { subject: 'request', predicate: 'requires_subject', object: 'boxing' },
      {
        subject: 'candidate:movie:1366',
        predicate: 'satisfies',
        object: 'boxing',
        provenance: { source: 'deterministic_rule', observedAt: CREATED, confidence: 0.92 },
      },
      { subject: 'candidate:movie:1366', predicate: 'scored', object: '87' },
      {
        subject: 'candidate:movie:1366',
        predicate: 'available_on',
        object: 'Netflix',
        provenance: { source: 'external:tmdb', observedAt: '2026-08-20T12:00:00.000Z' },
      },
      { subject: 'results', predicate: 'returned', object: 'candidate:movie:1366' },
    ],
    createdAt: CREATED,
  };

  it('derives every line from an edge, with provenance where the edge has it', () => {
    const why = groundedWhy(run, 'candidate:movie:1366');
    expect(why.some((l) => l.includes('satisfies') && l.includes('boxing') && l.includes('deterministic_rule'))).toBe(true);
    expect(why.some((l) => l.includes('scored 87'))).toBe(true);
    expect(why.some((l) => l.includes('on Netflix') && l.includes('2026-08-20'))).toBe(true);
  });

  it('a candidate the run holds no evidence about gets NO why — never an invented one', () => {
    expect(groundedWhy(run, 'candidate:movie:999')).toEqual([]);
  });

  it('INV-7: a because-claim with no evidence behind it is a violation', () => {
    const bad: DecisionRun = {
      ...run,
      edges: [
        { subject: 'results', predicate: 'returned', object: 'candidate:movie:7', detail: { because: 'you love boxing' } },
        { subject: 'candidate:movie:7', predicate: 'returned', object: 'x', detail: { because: 'gritty like Rocky' } },
      ],
    };
    const v = inv7BecauseMapsToEvidence(bad);
    expect(v.length).toBe(2);
    expect(v[0]!.invariant).toBe('INV-7');
  });

  it('a because-claim grounded by evidence for the same subject is lawful, and the suite runs INV-7', () => {
    const good: DecisionRun = {
      ...run,
      edges: [
        ...run.edges,
        {
          subject: 'candidate:movie:1366',
          predicate: 'returned',
          object: 'x',
          detail: { because: 'satisfies your boxing requirement' },
        },
      ],
    };
    expect(inv7BecauseMapsToEvidence(good)).toEqual([]);
    expect(checkRunInvariants(run).filter((v) => v.invariant === 'INV-7')).toEqual([]);
  });
});

describe('Phase 9 — the inspectors exist and read real provenance', () => {
  it('the title-evidence inspector renders fingerprint, knowledge and availability with absent-states', () => {
    const src = readFileSync(join(ROOT, 'src/app/growth-os/title-evidence/page.tsx'), 'utf8');
    expect(src).toMatch(/getCachedDimensions/);
    expect(src).toMatch(/readTitleKnowledge/);
    expect(src).toMatch(/getCardAvailability/);
    // Honest absence, named — never an empty section.
    expect(src).toMatch(/unreadable|not reached|Never availability-checked/);
  });

  it('the run inspector grounds its why in the run edges', () => {
    const src = readFileSync(join(ROOT, 'src/app/growth-os/decisions/[runId]/page.tsx'), 'utf8');
    expect(src).toMatch(/groundedWhy/);
    expect(src).toMatch(/no recorded evidence/);
  });

  it('the user-evidence inspector from Phase 3 still stands', () => {
    expect(existsSync(join(ROOT, 'src/app/growth-os/evidence/page.tsx'))).toBe(true);
  });
});
