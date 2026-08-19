import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import path from 'node:path';

/**
 * THE TASTE DNA INCREMENT COSTS NOTHING TO OPENAI — PROVEN STRUCTURALLY.
 *
 * `titleDimensions.backfill.test.ts` proves the one reachable classifier does
 * not fire. This proves the stronger, cheaper property: the EMBEDDING channel
 * is not reachable from Ask's personalization at all — not guarded, not
 * conditional, absent from the import graph.
 *
 * Walking the graph rather than asserting on one file is the point. A future
 * edit that adds `rankByDna` (which blends the paid embedding channel) to
 * `personalRanking.ts` — or to anything it imports, however deep — fails here
 * even though every existing unit test would still pass, because they mock
 * `@/lib/titleDimensions` wholesale and never see the real module.
 */

const ROOT = path.resolve(__dirname, '../../..');

function resolveSpec(spec: string, from: string): string | null {
  let base: string;
  if (spec.startsWith('@/')) base = path.join(ROOT, 'src', spec.slice(2));
  else if (spec.startsWith('.')) base = path.resolve(path.dirname(from), spec);
  else return null; // a bare package, handled separately
  for (const candidate of [`${base}.ts`, `${base}.tsx`, path.join(base, 'index.ts')]) {
    if (existsSync(candidate)) return candidate;
  }
  return null;
}

/** Every local module reachable from an entry point, plus the bare packages. */
function importGraph(entry: string): { files: Set<string>; packages: Set<string> } {
  const files = new Set<string>([entry]);
  const packages = new Set<string>();
  const queue = [entry];
  while (queue.length > 0) {
    const file = queue.shift()!;
    let src: string;
    try {
      src = readFileSync(file, 'utf8');
    } catch {
      continue;
    }
    for (const m of src.matchAll(/(?:from\s+|import\s*\(\s*)['"]([^'"]+)['"]/g)) {
      const spec = m[1]!;
      if (!spec.startsWith('.') && !spec.startsWith('@/')) {
        packages.add(spec);
        continue;
      }
      const resolved = resolveSpec(spec, file);
      if (!resolved || files.has(resolved)) continue;
      files.add(resolved);
      queue.push(resolved);
    }
  }
  return { files, packages };
}

const ENTRY = path.join(ROOT, 'src/lib/ask/personalRanking.ts');

describe('Taste DNA ranking adds no paid AI surface to Ask', () => {
  const { files, packages } = importGraph(ENTRY);

  it('reaches a real, non-trivial graph (so a silent resolve failure cannot fake a pass)', () => {
    // Without this, a broken resolver would return {entry} and every assertion
    // below would pass vacuously.
    expect(files.size).toBeGreaterThan(10);
    expect([...files].some((f) => f.endsWith('titleDimensions.ts'))).toBe(true);
  });

  it('cannot reach the EMBEDDING channel', () => {
    const offenders: string[] = [];
    for (const f of files) {
      const src = readFileSync(f, 'utf8');
      // Strip comments so prose ABOUT the embedding channel does not trip this.
      const code = src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
      if (/\b(?:getTitleVector|computeTitleVector|rankByDna)\s*\(/.test(code) || /\bembed\s*\(/.test(code)) {
        offenders.push(path.relative(ROOT, f));
      }
    }
    expect(offenders, 'the embedding channel is billed per title on a cache miss').toEqual([]);
  });

  it('pulls in no AI SDK package', () => {
    const ai = [...packages].filter((p) => /openai|anthropic|ai-sdk|@ai/i.test(p));
    expect(ai).toEqual([]);
  });

  it('reaches exactly one OpenAI-calling module, and calls only its cache-only readers', () => {
    /* `titleDimensions.ts` DOES contain a gpt-4o-mini classifier. Importing it
       is unavoidable — the cached fingerprint readers live there too. What must
       stay true is which of its functions Ask actually calls. */
    const src = readFileSync(ENTRY, 'utf8');
    const imported = src.match(/import\s*\{([^}]+)\}\s*from\s*'@\/lib\/titleDimensions'/);
    expect(imported, 'the import shape changed — re-verify the cost of what is now pulled in').toBeTruthy();
    const names = imported![1]!.split(',').map((s) => s.trim()).filter(Boolean).sort();
    expect(names).toEqual(['getCachedDimensions', 'getUserDimensionProfile']);
    // And the profile read must opt out of the classifying backfill.
    expect(src).toMatch(/getUserDimensionProfile\([^)]*\{\s*backfill:\s*false\s*\}/s);
  });
});
