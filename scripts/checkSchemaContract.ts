/**
 * BUILD GATE 1 OF 2 — needs no database.
 *
 * Fails the build when application code reads or writes a Postgres object
 * that `src/lib/schemaContract.ts` does not declare. That keeps the contract
 * complete as the code grows, which is what makes the SECOND gate
 * (scripts/verifyProductionSchema.ts, which probes a live deployment) able to
 * catch a migration that never ran.
 *
 * This gate alone would NOT have caught migration 0041 — the contract would
 * have declared the tables and the code would still have shipped ahead of the
 * schema. It is the half that runs without credentials; the live probe is the
 * half that has the answer.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { SCHEMA_CONTRACT, UNMAPPED_OBJECTS } from '../src/lib/schemaContract';

const ROOT = join(__dirname, '..');

function sourceFiles(dir: string, acc: string[] = []): string[] {
  for (const entry of readdirSync(join(ROOT, dir))) {
    const rel = `${dir}/${entry}`;
    if (statSync(join(ROOT, rel)).isDirectory()) sourceFiles(rel, acc);
    else if (/\.tsx?$/.test(entry) && !entry.includes('.test.')) acc.push(rel);
  }
  return acc;
}

function main(): void {
  const declared = new Set([...SCHEMA_CONTRACT.map((r) => r.object), ...UNMAPPED_OBJECTS]);
  const used = new Map<string, string>();

  for (const file of sourceFiles('src')) {
    // Comments stripped first: several of these files DESCRIBE `.from('x')`
    // calls in prose, and a gate that trips on its own documentation teaches
    // people to weaken the gate.
    const src = readFileSync(join(ROOT, file), 'utf8')
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/^\s*\/\/.*$/gm, '');
    for (const m of src.matchAll(/\.from\('([a-z_]+)'\)/g)) {
      if (!used.has(m[1]!)) used.set(m[1]!, file);
    }
  }

  const undeclared = [...used.entries()].filter(([obj]) => !declared.has(obj));
  if (undeclared.length > 0) {
    console.error('[check-schema-contract] FAILED — code uses database objects that');
    console.error('src/lib/schemaContract.ts does not declare, so no deploy gate can');
    console.error('verify they exist in production:');
    for (const [obj, file] of undeclared) console.error(`  - ${obj}  (first used in ${file})`);
    console.error('');
    console.error('Fix: add each one to SCHEMA_CONTRACT with the migration that creates');
    console.error('it, or to UNMAPPED_OBJECTS with a comment saying where it comes from.');
    process.exit(1);
  }

  console.log(
    `[check-schema-contract] OK — ${used.size} object(s) used by code, all declared ` +
      `(${SCHEMA_CONTRACT.length} contracted, ${UNMAPPED_OBJECTS.length} unmapped).`,
  );
}

main();
