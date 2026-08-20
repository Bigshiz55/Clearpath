/**
 * THE MINIFIER IS PART OF THE PROGRAM, AND IT SHIPPED A BUG THE SUITE COULD
 * NEVER SEE.
 *
 * Proven on the deployed preview at 344b991 and reproduced byte-for-byte from
 * a local `next build`: SWC constant-folded a `new RegExp` template literal
 * into a double-quoted string and mis-escaped `\\b` as `\\\b` — a backslash
 * followed by a BACKSPACE CHARACTER (0x08) instead of a backslash followed by
 * the letter b. The word boundary became "match a literal backspace", the
 * negation regex matched nothing ever, and every "no X" on /api/ask inverted
 * to "X wanted". Vitest runs unminified source, so 5208 tests were green while
 * the deployed product reversed negations.
 *
 * This gate closes that class: after `next build`, decode every double-quoted
 * string literal in the emitted server chunks and fail if any decodes to a
 * control character that no legitimate string in this app contains — backspace
 * (\b, 0x08), vertical tab (\v, 0x0B) or form feed (\f, 0x0C). Those appear in
 * real output only when an escape was folded wrongly.
 *
 * Wired as `postbuild`, so `npm run build` cannot report success over a
 * corrupted bundle — locally, in CI, and on any deploy that runs the npm
 * script.
 */
import { readdirSync, readFileSync, statSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { createRequire } from 'node:module';

/* A REAL TOKENIZER, NOT A QUOTE-PAIRING REGEX. The first draft of this checker
   paired double quotes across the file, so a regex LITERAL sitting between two
   genuine strings read as string content and its legitimate \b word
   boundaries reported as corruption — 50+ false positives on one chunk. Minified
   JS cannot be lexed by pattern-matching; acorn is already in the tree, and its
   tokenizer decodes each string's VALUE exactly the way the engine will. */
const require = createRequire(import.meta.url);
const acorn = require('acorn');

const ROOTS = ['.next/server'];
const BAD = { 8: '\\b (backspace)', 11: '\\v (vertical tab)', 12: '\\f (form feed)' };

/**
 * Yield [decodedValue, rawSnippet, offset] for every string-like token whose
 * DECODED value the engine will actually use.
 *
 * `String.raw` templates are skipped: the tag consumes the RAW text, so the
 * cooked value acorn reports (where `\b` is a backspace) never exists at
 * runtime. This file's own first draft flagged every source-authored
 * `RegExp(String.raw\`...\`)` in the tree — the idiom that is CORRECT under
 * this toolchain — which would have made the gate cry wolf on healthy builds.
 */
function* stringTokens(src) {
  const tokenizer = acorn.tokenizer(src, { ecmaVersion: 'latest', allowHashBang: true });
  let inTemplate = false;
  let templateIsRaw = false;
  while (true) {
    let tok;
    try { tok = tokenizer.getToken(); } catch { return; }
    if (tok.type === acorn.tokTypes.eof) return;
    if (tok.type === acorn.tokTypes.backQuote) {
      if (!inTemplate) {
        inTemplate = true;
        templateIsRaw = /String\s*\.\s*raw\s*$/.test(src.slice(Math.max(0, tok.start - 24), tok.start));
      } else {
        inTemplate = false;
        templateIsRaw = false;
      }
      continue;
    }
    if (tok.type === acorn.tokTypes.string) {
      yield [String(tok.value ?? ''), src.slice(tok.start, Math.min(tok.end, tok.start + 100)), tok.start];
    } else if (tok.type === acorn.tokTypes.template && !templateIsRaw) {
      yield [String(tok.value ?? ''), src.slice(tok.start, Math.min(tok.end, tok.start + 100)), tok.start];
    }
  }
}

function* jsFiles(dir) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    const st = statSync(p);
    if (st.isDirectory()) yield* jsFiles(p);
    else if (name.endsWith('.js')) yield p;
  }
}

let findings = 0;
let scanned = 0;
for (const root of ROOTS) {
  if (!existsSync(root)) {
    console.error(`bundle-escapes: ${root} does not exist — run next build first`);
    process.exit(2);
  }
  for (const file of jsFiles(root)) {
    scanned += 1;
    const src = readFileSync(file, 'utf8');
    // Fast path: a corrupted fold needs a backslash run ending in b/f/v somewhere.
    if (!/\\[bfv]/.test(src)) continue;
    for (const [value, raw, off] of stringTokens(src)) {
      for (const ch of value) {
        const code = ch.charCodeAt(0);
        if (BAD[code]) {
          findings += 1;
          console.error(`CORRUPTED ESCAPE ${BAD[code]} in ${file} @${off}\n  token starts: ${raw.replace(/\s+/g, ' ')}…`);
          break;
        }
      }
    }
  }
}
console.log(`bundle-escapes: scanned ${scanned} emitted file(s), ${findings} corrupted literal(s)`);
process.exit(findings > 0 ? 1 : 0);
