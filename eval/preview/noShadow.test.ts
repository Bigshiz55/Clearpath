/**
 * A LOCAL MAY NOT SHADOW AN IMPORTED READER.
 *
 * The gate exited 2 at CASE 2 with:
 *
 *   ReferenceError: Cannot access 'kind' before initialization
 *
 * A `const kind` declared far below, inside the same `main()`, put the IMPORTED
 * `kind` into the temporal dead zone for the whole function — so a call two
 * hundred lines earlier threw. The workflow classified it as INFRASTRUCTURE
 * rather than a product verdict, which is exactly right and is why the run cost
 * a cycle instead of a false accusation against the deployed app.
 *
 * `node --check` cannot catch this: the file is syntactically perfect. Only
 * executing it can, and executing it needs a live preview and two secrets. So
 * the shape is asserted here instead, where it costs nothing.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const GATE = join(__dirname, 'canonical-interpretation.mjs');
const source = readFileSync(GATE, 'utf8');

/** The names the gate imports from its helper modules. */
function importedNames(src: string): string[] {
  const out: string[] = [];
  for (const m of src.matchAll(/import\s*\{([^}]+)\}\s*from\s*'\.\/[^']+'/g)) {
    for (const raw of m[1]!.split(',')) {
      const name = raw.trim().split(/\s+as\s+/).pop()?.trim();
      if (name) out.push(name);
    }
  }
  return out;
}

describe('the black-box gate does not shadow its own imports', () => {
  const imported = importedNames(source);

  it('imports the readers it asserts with', () => {
    expect(imported).toContain('kind');
    expect(imported.length).toBeGreaterThan(5);
  });

  it.each(importedNames(source))('no local declaration shadows %s', (name) => {
    const declared = new RegExp(`^\\s*(?:const|let|var|function)\\s+${name}\\b`, 'm');
    const at = source.search(declared);
    expect(
      at,
      `a local '${name}' shadows the imported one. Every use of the import in the `
        + `same scope — including ones ABOVE this line — throws a temporal dead zone `
        + `ReferenceError at runtime, and the gate exits 2 without testing anything.`,
    ).toBe(-1);
  });
});
