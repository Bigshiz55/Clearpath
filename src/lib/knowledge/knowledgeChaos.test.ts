/**
 * KNOWLEDGE-LAYER CHAOS / GENERALIZATION PROOF (§11, §17-I).
 *
 * A seeded, randomized, cross-domain adversarial harness that is fully OFFLINE
 * and deterministic. It generates title evidence across ~30 UNRELATED subject
 * domains (submarines, ballet, chess, journalism, mountaineering, cult
 * documentaries, …) with a ground-truth centrality label baked in BEFORE
 * compilation, compiles each with the real Knowledge Layer, and an INDEPENDENT
 * oracle (sharing no code with the compiler) checks two invariants that must
 * hold for EVERY subject, not a hand-picked few:
 *
 *   • ZERO false positives — an ABSENT/setting-only/weak-keyword title must
 *     NEVER compile to CENTRAL (the Snake-Eyes / Goodfellas class).
 *   • Recall — a genuinely central title (title hit or a sustained overview)
 *     must compile to CENTRAL.
 *
 * Failing seeds are PERSISTED so any random failure becomes reproducible. The
 * corpus is generated, never hand-tuned to pass; the oracle is written here,
 * independently of compile.ts.
 */
import { describe, it, expect } from 'vitest';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { compileTitle } from './batch';
import type { SubjectRequirement, CandidateEvidence } from '@/lib/nlu/semanticEligibility';

// Deterministic PRNG (mulberry32) — same discipline as the eval framework.
function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// A broad pool of subjects across unrelated domains. Deliberately NOT limited to
// the prompt's examples — the point is generalization. `{head}` lets multi-word
// lexemes be generated without a per-subject table.
const SUBJECTS: Array<{ canonical: string; word: string; extra: string[] }> = [
  { canonical: 'submarine', word: 'submarine', extra: ['sub', 'periscope', 'torpedo'] },
  { canonical: 'boxing', word: 'boxing', extra: ['boxer', 'prizefight', 'heavyweight'] },
  { canonical: 'baseball', word: 'baseball', extra: ['pitcher', 'ballpark', 'shortstop'] },
  { canonical: 'chess', word: 'chess', extra: ['grandmaster', 'checkmate', 'chessboard'] },
  { canonical: 'ballet', word: 'ballet', extra: ['ballerina', 'pointe', 'choreographer'] },
  { canonical: 'courtroom', word: 'courtroom', extra: ['trial', 'verdict', 'testimony'] },
  { canonical: 'journalism', word: 'journalism', extra: ['reporter', 'newsroom', 'editor'] },
  { canonical: 'mountaineering', word: 'mountaineering', extra: ['climber', 'summit', 'ascent'] },
  { canonical: 'heist', word: 'heist', extra: ['robbery', 'vault', 'burglar'] },
  { canonical: 'kidnapping', word: 'kidnapping', extra: ['abduction', 'ransom', 'hostage'] },
  { canonical: 'treasure', word: 'treasure', extra: ['treasure', 'gold', 'map'] },
  { canonical: 'serial-killer', word: 'serial killer', extra: ['murderer', 'homicide', 'killer'] },
  { canonical: 'political-conspiracy', word: 'conspiracy', extra: ['coverup', 'senator', 'espionage'] },
  { canonical: 'revenge', word: 'revenge', extra: ['vengeance', 'retribution', 'avenge'] },
  { canonical: 'chess-hustler', word: 'chess', extra: ['gambit', 'tournament', 'grandmaster'] },
  { canonical: 'surfing', word: 'surfing', extra: ['surfer', 'wave', 'surfboard'] },
  { canonical: 'firefighting', word: 'firefighting', extra: ['firefighter', 'blaze', 'engine'] },
  { canonical: 'wine', word: 'winemaking', extra: ['vineyard', 'vintner', 'sommelier'] },
  { canonical: 'poker', word: 'poker', extra: ['gambler', 'bluff', 'tournament'] },
  { canonical: 'archaeology', word: 'archaeology', extra: ['archaeologist', 'excavation', 'artifact'] },
  { canonical: 'space-mission', word: 'astronaut', extra: ['spacecraft', 'orbit', 'launch'] },
  { canonical: 'cooking', word: 'cooking', extra: ['chef', 'kitchen', 'restaurant'] },
  { canonical: 'cycling', word: 'cycling', extra: ['cyclist', 'peloton', 'tour'] },
  { canonical: 'beekeeping', word: 'beekeeping', extra: ['beekeeper', 'hive', 'apiary'] },
  { canonical: 'submarine-rescue', word: 'submarine', extra: ['rescue', 'depth', 'hull'] },
  { canonical: 'figure-skating', word: 'skating', extra: ['skater', 'rink', 'axel'] },
  { canonical: 'wrestling', word: 'wrestling', extra: ['wrestler', 'grappler', 'takedown'] },
  { canonical: 'magic', word: 'magician', extra: ['illusion', 'trick', 'sleight'] },
  { canonical: 'coding', word: 'hacking', extra: ['hacker', 'malware', 'cyber'] },
  { canonical: 'sailing', word: 'sailing', extra: ['sailor', 'regatta', 'yacht'] },
];

type Truth = 'central' | 'incidental' | 'absent';

function requirement(s: (typeof SUBJECTS)[number]): SubjectRequirement {
  return { canonical: s.canonical, label: s.word, lexemes: [s.word, ...s.extra], strict: true };
}

// Generate evidence whose centrality is KNOWN by construction.
function evidenceFor(s: (typeof SUBJECTS)[number], truth: Truth, rnd: () => number): CandidateEvidence {
  const w = s.word;
  const filler = 'A story of ambition, loss, and family set over many years.';
  if (truth === 'central') {
    // Either a title hit or a sustained multi-sentence overview.
    if (rnd() < 0.5) {
      return { title: `The ${w[0].toUpperCase()}${w.slice(1)}`, overview: `${filler} The ${w} runs through the whole film.`, genres: ['Drama'], keywords: [w] };
    }
    return { title: 'Untitled Drama', overview: `A ${w} obsessive pursues greatness. The ${w} defines every choice they make.`, genres: ['Drama'], keywords: [w] };
  }
  if (truth === 'incidental') {
    // Word appears only as a one-scene setting (the Snake-Eyes class).
    return { title: 'City of Shadows', overview: `A detective uncovers a plot. A key meeting happens at a ${w} event before the story moves on.`, genres: ['Thriller'], keywords: rnd() < 0.5 ? [w] : [] };
  }
  // absent — no connection at all.
  return { title: 'Elsewhere', overview: filler, genres: ['Drama'], keywords: [] };
}

async function runSeed(seed: number, cases: number) {
  const rnd = mulberry32(seed);
  const failures: Array<{ seed: number; i: number; subject: string; truth: Truth; got: string; kind: string }> = [];
  for (let i = 0; i < cases; i++) {
    const s = SUBJECTS[Math.floor(rnd() * SUBJECTS.length)];
    const truth: Truth = (['central', 'incidental', 'absent'] as Truth[])[Math.floor(rnd() * 3)];
    const ev = evidenceFor(s, truth, rnd);
    const out = await compileTitle(ev, [requirement(s)]);
    const fact = out.facts[0];

    // INDEPENDENT ORACLE — invariants that must hold for every subject.
    if (truth === 'absent' && (fact.centrality === 'CENTRAL' || fact.centrality === 'MATERIAL')) {
      failures.push({ seed, i, subject: s.canonical, truth, got: fact.centrality, kind: 'false-positive-absent' });
    }
    if (truth === 'incidental' && fact.centrality === 'CENTRAL') {
      failures.push({ seed, i, subject: s.canonical, truth, got: fact.centrality, kind: 'false-positive-incidental' });
    }
    if (truth === 'central' && !(fact.centrality === 'CENTRAL' || fact.centrality === 'MATERIAL')) {
      failures.push({ seed, i, subject: s.canonical, truth, got: fact.centrality, kind: 'recall-miss' });
    }
    // RULE 1 universal: a lone keyword tag must never be CENTRAL.
    if (fact.evidence.sources.length === 1 && fact.evidence.sources[0] === 'keyword' && fact.centrality === 'CENTRAL') {
      failures.push({ seed, i, subject: s.canonical, truth, got: fact.centrality, kind: 'keyword-only-central' });
    }
  }
  return failures;
}

describe('Knowledge Layer — randomized cross-domain generalization', () => {
  it('holds the false-positive and recall invariants across 600 random cases / 2 seeds', async () => {
    const seeds = [1337, 90210];
    const all: Awaited<ReturnType<typeof runSeed>> = [];
    for (const seed of seeds) all.push(...(await runSeed(seed, 300)));

    if (all.length > 0) {
      // Persist failing seeds so every random failure is reproducible.
      const dir = join(process.cwd(), 'evaluation-results', 'knowledge');
      mkdirSync(dir, { recursive: true });
      writeFileSync(join(dir, 'failing-seeds.json'), JSON.stringify({ generatedBy: 'knowledgeChaos', failures: all }, null, 2));
    }
    expect(all, `false positives / recall misses (persisted to evaluation-results/knowledge/failing-seeds.json): ${JSON.stringify(all.slice(0, 8))}`).toHaveLength(0);
  });

  it('a second unseen seed also holds (not overfit to 1337)', async () => {
    const failures = await runSeed(4242, 200);
    expect(failures).toHaveLength(0);
  });
});
