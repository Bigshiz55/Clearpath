import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { INTERACTION_MANIFEST } from './interactionManifest';

/**
 * THE COVERAGE GATE. A visible control in the manifest without a live,
 * verifiable automated test fails CI — coverage can't silently rot.
 */

const ROOT = process.cwd();

describe('interaction manifest — structure', () => {
  it('every control has a unique id, a route, a label, and an expected effect', () => {
    const ids = new Set<string>();
    for (const c of INTERACTION_MANIFEST) {
      expect(c.controlId.length, `controlId missing`).toBeGreaterThan(2);
      expect(ids.has(c.controlId), `duplicate controlId ${c.controlId}`).toBe(false);
      ids.add(c.controlId);
      expect(c.route.length, `${c.controlId}: route missing`).toBeGreaterThan(0);
      expect(c.label.length, `${c.controlId}: label missing`).toBeGreaterThan(0);
      expect(c.expectedEffect.length, `${c.controlId}: expectedEffect missing`).toBeGreaterThan(10);
    }
  });
});

describe('interaction manifest — CI coverage gate', () => {
  it('EVERY control has at least one automated test', () => {
    for (const c of INTERACTION_MANIFEST) {
      expect(c.coveredBy.length, `${c.controlId} ("${c.label}") has NO automated test`).toBeGreaterThan(0);
    }
  });

  it('every referenced test file exists and still mentions the control needle', () => {
    for (const c of INTERACTION_MANIFEST) {
      for (const ref of c.coveredBy) {
        const abs = join(ROOT, ref.file);
        expect(existsSync(abs), `${c.controlId}: coverage file ${ref.file} does not exist`).toBe(true);
        const content = readFileSync(abs, 'utf8');
        expect(
          content.includes(ref.needle),
          `${c.controlId}: ${ref.file} no longer mentions "${ref.needle}" — the control lost its test`
        ).toBe(true);
      }
    }
  });

  it('unit-covered controls also reference files vitest actually runs (*.test.ts)', () => {
    for (const c of INTERACTION_MANIFEST) {
      for (const ref of c.coveredBy) {
        if (ref.kind === 'unit') {
          expect(ref.file.endsWith('.test.ts'), `${c.controlId}: unit ref ${ref.file} is not a vitest file`).toBe(true);
        } else {
          expect(ref.file.startsWith('tests/'), `${c.controlId}: ${ref.kind} ref ${ref.file} is not a Playwright spec`).toBe(true);
        }
      }
    }
  });
});
