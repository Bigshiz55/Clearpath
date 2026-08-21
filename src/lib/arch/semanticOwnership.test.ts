/**
 * SEMANTIC OWNERSHIP — the Phase 7 law, pinned at the source level.
 *
 * Free-form user English gets ONE semantic interpretation. Downstream may
 * execute structured fields; it may not independently reinterpret the
 * sentence, and the browser's parse of the sentence is never authority.
 * The behavioral half lives in src/app/api/finder/finderOwnership.test.ts;
 * these pins stop the structure itself from regressing.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = join(__dirname, '..', '..', '..');
const read = (p: string) => readFileSync(join(ROOT, p), 'utf8');

const finderRoute = read('src/app/api/finder/route.ts');
const askRoute = read('src/app/api/ask/route.ts');

describe('the finder holds the canonical fence', () => {
  it('imports the canonical interpreter and executes through the same resolver as /api/ask', () => {
    expect(finderRoute).toMatch(/from '@\/lib\/interpret\/interpret'/);
    expect(finderRoute).toMatch(/from '@\/lib\/ask\/canonicalExecution'/);
    expect(finderRoute).toMatch(/const canonicalOwnsLanguage = canonical !== null && canonical\.kind === 'recommendation'/);
  });

  it('every legacy whole-utterance reader is fenced behind !canonicalOwnsLanguage', () => {
    /* Each of these exists to extract meaning from raw English. On the
       canonical arm the meaning already arrived structured; an unfenced call
       would be a second reader. The fence expressions are pinned verbatim so
       an accidental unguard shows up as a diff HERE, not as drift. */
    expect(finderRoute).toMatch(/if \(!canonicalOwnsLanguage\) \{\s*\n\s*query = augmentInternational\(query, text\);/);
    expect(finderRoute).toMatch(/if \(!canonicalOwnsLanguage && text && \(!query\.castIds/);
    expect(finderRoute).toMatch(/if \(!canonicalOwnsLanguage && text\) \{\s*\n\s*const applied = await applyRequiredSubject/);
    expect(finderRoute).toMatch(/if \(!canonicalOwnsLanguage && cls\?\.mode === 'similar_to'\)/);
  });
});

describe('the sentence outranks the client parse of it — on both routes', () => {
  it('finder: text-first derivation; body.query stands alone only without a sentence', () => {
    expect(finderRoute).toMatch(/query = text \? naiveParseQuery\(text\) : body\.query \? coerceClientQuery\(body\.query\) : \{ \.\.\.EMPTY_QUERY \}/);
    expect(finderRoute).not.toMatch(/body\.query \? coerce\w*Query\(body\.query\) : text/);
  });

  it('ask: the legacy arm derives from text; body.query stands alone only on chip-removal turns', () => {
    expect(askRoute).toMatch(/query = text \? naiveParseQuery\(text\) : body\.query \? coerceClientQuery\(body\.query\) : \{ \.\.\.EMPTY_QUERY \}/);
    expect(askRoute).not.toMatch(/body\.query \? coerce\w*Query\(body\.query\) : text/);
  });

  it('the wire itself carries one authority: AskTheJudge sends its parse only when no text travels', () => {
    const askTheJudge = read('src/components/AskTheJudge.tsx');
    expect(askTheJudge).toMatch(/\.\.\.\(text \? \{\} : \{ query \}\)/);
  });
});

describe('one substance predicate for the unresolved-clarify decision', () => {
  it('both routes call the SHARED requestHasOtherConstraints — no inline copy may return', () => {
    /* The finder's inline copy diverged from the ask's (it dropped the
       origin/language/audio fields), so "a French movie with an unresolvable
       person" clarified away its origin constraint on one route while
       executing with the miss disclosed on the other. Reviewer catch. */
    expect(finderRoute).toMatch(/requestHasOtherConstraints: requestHasOtherConstraints\(/);
    expect(askRoute).toMatch(/requestHasOtherConstraints: requestHasOtherConstraints\(/);
    expect(finderRoute).not.toMatch(/const requestHasOtherConstraints =/);
    expect(askRoute).not.toMatch(/const requestHasOtherConstraints =/);
  });

  it('an origin/language/audio-only request counts as substance — it executes with the miss disclosed', async () => {
    const { requestHasOtherConstraints } = await import('@/lib/ask/unresolvedResponse');
    const { EMPTY_QUERY } = await import('@/lib/finderParse');
    expect(requestHasOtherConstraints({ ...EMPTY_QUERY, originCountries: ['FR'] })).toBe(true);
    expect(requestHasOtherConstraints({ ...EMPTY_QUERY, originalLanguages: ['es'] })).toBe(true);
    expect(requestHasOtherConstraints({ ...EMPTY_QUERY, englishDubOnly: true })).toBe(true);
    expect(requestHasOtherConstraints({ ...EMPTY_QUERY })).toBe(false);
  });
});

describe('one boundary where a client query enters', () => {
  it('coerceClientQuery is defined exactly once, and neither route keeps a private copy', () => {
    expect(read('src/lib/finderQueryBoundary.ts')).toMatch(/export function coerceClientQuery/);
    expect(finderRoute).not.toMatch(/function coerceQuery/);
    expect(askRoute).not.toMatch(/function coerceQuery/);
    expect(finderRoute).toMatch(/from '@\/lib\/finderQueryBoundary'/);
    expect(askRoute).toMatch(/from '@\/lib\/finderQueryBoundary'/);
  });
});

describe('TASK #36 fences: the LLM and the airing siblings', () => {
  it('the ask route computes the LLM parse only when canonical will not serve', () => {
    expect(askRoute).toMatch(/const ai = text && !canonicalWillServe \? await parseAskWithAI\(text\) : null/);
    expect(askRoute).not.toMatch(/const ai = text \? await parseAskWithAI\(text\) : null/);
  });

  it("the airing arm's genre and media read canonical fields, not the raw sentence", () => {
    const buildCase = read('src/app/api/build-case/route.ts');
    expect(buildCase).toMatch(/const airingClause = canonicalAiring\.requestClause \|\| text/);
    expect(buildCase).toMatch(/const genre = detectGenre\(airingClause\)/);
    expect(buildCase).toMatch(/const movieOnly = canonicalAiring\.media === 'movie'/);
    expect(buildCase).not.toMatch(/movies\?\|films\?.*\.test\(` \$\{text/);
  });
});

describe('routing is not meaning: the destination cascade transports the sentence losslessly', () => {
  it('every ask-bound destination carries the raw query verbatim for the one owner to read', async () => {
    /* The client cascade (SearchBar/QuickSearch/BuildCaseBox) may choose a
       DESTINATION from vocabulary; it may never deliver an altered sentence.
       The canonical interpreter at the destination is the one reader of
       meaning — so whatever routes to /app/ask must arrive byte-identical. */
    const { resolveSearchDestination } = await import('@/lib/search/searchIntent');
    const { canonicalRequestRoute } = await import('@/lib/nlu/requestRoute');
    const sentences = [
      'a funny movie under two hours but not a romance',
      'Give me 3 Sylvester Stallone movies',
      'anything except horror on Netflix',
      'I love slow burns but I hate gore, find me a thriller',
    ];
    for (const s of sentences) {
      const dest = resolveSearchDestination(s, []);
      if (dest?.reason === 'ask') {
        const q = new URL(`https://x${dest.href}`).searchParams.get('q');
        expect(q, `cascade altered the sentence: ${s}`).toBe(s);
      }
      const route = canonicalRequestRoute(s);
      if (route.kind === 'request') {
        const q = new URL(`https://x${route.href}`).searchParams.get('q');
        expect(q, `hero box altered the sentence: ${s}`).toBe(s);
      }
    }
  });
});

describe('retained shared-definition deciders are single-owner, not competitors', () => {
  it('the search destination and the hero-box guard consume the ONE clause-layer owner', () => {
    /* SearchBar/QuickSearch (destination cascade) and BuildCaseBox (the
       incident guard that keeps a request off the generic feed) run in the
       browser — but through the SAME single-definition functions the server
       consults (`clauseLayerSaysRequest`, `canonicalRequestRoute`). One
       definition cannot disagree with itself; these stay by design and any
       fork of them into a private vocabulary must fail here. */
    const searchIntent = read('src/lib/search/searchIntent.ts');
    expect(searchIntent).toMatch(/clauseLayerSaysRequest/);
    const requestRoute = read('src/lib/nlu/requestRoute.ts');
    expect(requestRoute).toMatch(/clauseLayerSaysRequest/);
    /* The one client fallback that recomputed a server answer is gone: the
       search bar takes the server's `intent` verbatim. */
    const searchBar = read('src/components/SearchBar.tsx');
    expect(searchBar).not.toMatch(/\?\? lexicalIntent\(/);
  });
});
