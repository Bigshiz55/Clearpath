// Infer a coarse Book DNA from the signals a provider actually gives us
// (subjects/genres, page count, year). Every axis produced here is labelled
// 'inferred' with modest confidence — it is an honest approximation, never
// presented as confirmed. Richer, higher-confidence DNA (editorial or
// AI-assisted) can override these values later through the provenance layer.

import { emptyBookDna, type BookDna, type BookDnaAxis } from '@/lib/domain/book';

interface SubjectSignal {
  match: RegExp;
  axes: Partial<Record<keyof BookDna, number>>; // axis -> value contribution 0..1
  moods?: string[];
  tropes?: string[];
}

// Keyword → axis heuristics. Deliberately conservative.
const SIGNALS: SubjectSignal[] = [
  { match: /thriller|suspense/i, axes: { pacing: 0.8, suspense: 0.85, darkness: 0.6 }, moods: ['tense'] },
  { match: /mystery|detective|crime|noir/i, axes: { pacing: 0.65, suspense: 0.7, complexity: 0.6 }, tropes: ['investigation'] },
  { match: /horror/i, axes: { darkness: 0.9, suspense: 0.85, emotionalIntensity: 0.7 } },
  { match: /romance|love stor/i, axes: { romanceEmphasis: 0.85, emotionalIntensity: 0.6 }, moods: ['emotional'] },
  { match: /fantasy/i, axes: { worldbuilding: 0.85, complexity: 0.6 }, moods: ['adventurous'] },
  { match: /science fiction|sci-fi|space/i, axes: { worldbuilding: 0.8, complexity: 0.65 } },
  { match: /literary|literature/i, axes: { literaryVsCommercial: 0.85, proseDensity: 0.65, pacing: 0.35 }, moods: ['reflective'] },
  { match: /historical/i, axes: { worldbuilding: 0.6, complexity: 0.55 } },
  { match: /humor|comic|satire/i, axes: { humor: 0.85, pacing: 0.6 }, moods: ['funny'] },
  { match: /young adult|ya\b/i, axes: { pacing: 0.7, complexity: 0.35, proseDensity: 0.3 } },
  { match: /war|military/i, axes: { darkness: 0.7, emotionalIntensity: 0.7 } },
  { match: /memoir|biography|nonfiction|essays/i, axes: { literaryVsCommercial: 0.6, plotVsCharacter: 0.3 } },
];

function axis(value: number, salience: number, confidence: number): BookDnaAxis {
  return { value: Math.max(0, Math.min(1, value)), salience, confidence };
}

/**
 * Infer Book DNA from subjects + basic metadata. Confidence scales with how many
 * corroborating subject signals fire; a single keyword yields low confidence.
 */
export function inferBookDna(input: {
  subjects: string[];
  pageCount?: number | null;
}): BookDna {
  const dna = emptyBookDna();
  const acc: Partial<Record<keyof BookDna, { sum: number; hits: number }>> = {};
  const moods = new Set<string>();
  const tropes = new Set<string>();
  let signalHits = 0;

  const haystack = input.subjects.join(' | ');
  for (const sig of SIGNALS) {
    if (!sig.match.test(haystack)) continue;
    signalHits++;
    for (const [k, v] of Object.entries(sig.axes)) {
      const key = k as keyof BookDna;
      const cur = acc[key] ?? { sum: 0, hits: 0 };
      cur.sum += v as number;
      cur.hits += 1;
      acc[key] = cur;
    }
    sig.moods?.forEach((m) => moods.add(m));
    sig.tropes?.forEach((t) => tropes.add(t));
  }

  // Confidence rises with corroboration but stays honest about thin evidence.
  const baseConf = Math.min(0.5, 0.18 + signalHits * 0.08);

  for (const [k, agg] of Object.entries(acc)) {
    const key = k as keyof BookDna;
    const value = agg.sum / agg.hits;
    const salience = Math.min(1, 0.4 + agg.hits * 0.2);
    // Numeric axes only.
    (dna as unknown as Record<string, BookDnaAxis>)[key] = axis(value, salience, baseConf);
  }

  // Page count hints at length-driven prose density / commitment (very weak).
  if (input.pageCount != null && input.pageCount > 600 && !acc.proseDensity) {
    dna.proseDensity = axis(0.6, 0.4, 0.2);
  }

  dna.moods = [...moods];
  dna.tropes = [...tropes];
  return dna;
}
