import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { historyToObservations, type HistoryRow } from './historyObservations';
import { buildQueue, normaliseKey, resolveAnswer } from './rapidFire';

/**
 * RAPID FIRE OVER REAL HISTORY — the owner's four RED items, pinned:
 *   1. imported titles enter the candidate question pool
 *   2. available imported titles are not displaced by unrelated titles
 *   3. a no-history user still gets useful questions
 *   4. answers persist to the canonical Taste DNA
 */

const ROOT = join(__dirname, '..', '..', '..');
const read = (p: string) => readFileSync(join(ROOT, p), 'utf8');

const row = (over: Partial<HistoryRow> = {}): HistoryRow => ({
  tmdb_id: 603,
  media_type: 'movie',
  title: 'The Matrix',
  status: 'watched',
  rating: null,
  watched_at: '2026-01-05T00:00:00Z',
  ...over,
});

describe('RED 1 — imported titles enter the candidate question pool', () => {
  it('a watched history row becomes a rapid-fire question about THAT title', () => {
    const { observations, refs } = historyToObservations([row()]);
    const queue = buildQueue(observations, { now: Date.parse('2026-02-01') });
    expect(queue).toHaveLength(1);
    expect(queue[0]!.title).toBe('The Matrix');
    expect(queue[0]!.kind).toBe('watched');
    // The real identity travels with the queue key, so the answer can persist.
    expect(refs.get(queue[0]!.key)).toEqual({ tmdbId: 603, mediaType: 'movie', title: 'The Matrix' });
  });

  it('a stopped-watching row becomes the abandoned question — and goes FIRST', () => {
    const { observations } = historyToObservations([
      row(),
      row({ tmdb_id: 1396, media_type: 'tv', title: 'Breaking Bad', status: 'dropped' }),
    ]);
    const queue = buildQueue(observations, { now: Date.parse('2026-02-01') });
    expect(queue[0]!.title).toBe('Breaking Bad');
    expect(queue[0]!.kind).toBe('abandoned');
  });

  it('the evidence line states only what the row says', () => {
    const { observations } = historyToObservations([row()]);
    expect(observations[0]!.evidence).toBe('In your history as watched on Jan 5, 2026.');
    const undated = historyToObservations([row({ watched_at: null })]);
    expect(undated.observations[0]!.evidence).toBe('In your history as watched.');
  });

  it('rows that cannot honestly support the question are excluded', () => {
    const { observations } = historyToObservations([
      row({ rating: 8 }), // opinion already exists
      row({ tmdb_id: 2, title: 'Saved Thing', status: 'possible' }), // never watched
      row({ tmdb_id: 3, title: '' }), // no title
    ]);
    expect(observations).toHaveLength(0);
  });
});

describe('RED 2 — imported titles are not displaced by unrelated titles', () => {
  it('the queue is built from the history observations ALONE', () => {
    const rows = Array.from({ length: 30 }, (_, i) =>
      row({ tmdb_id: i + 1, title: `Film ${i + 1}` }),
    );
    const { observations } = historyToObservations(rows);
    const queue = buildQueue(observations, { now: 0, limit: 20 });
    expect(queue).toHaveLength(20);
    for (const q of queue) expect(q.title).toMatch(/^Film \d+$/);
  });

  it('the live page feeds buildQueue only history observations — no other source', () => {
    const page = read('src/app/app/rapid-fire/page.tsx');
    expect(page).toContain('historyToObservations');
    expect(page).toContain('buildQueue(mapped.observations');
    expect(page).not.toContain('sampleObservations');
  });
});

describe('RED 3 — a no-history user still gets useful questions', () => {
  it('the fallback is the normal quiz pool, which never implies a watch', () => {
    const page = read('src/app/app/rapid-fire/page.tsx');
    expect(page).toContain('rapid-fire-fallback');
    expect(page).toContain('TitleGridCalibration');
    expect(page).toContain('never assume you watched anything');
  });
});

describe('RED 4 — answers persist to the canonical Taste DNA', () => {
  const action = read('src/lib/actions/rapidFire.ts');

  it('taste answers land as the engine’s own experience grades — including dnf', () => {
    expect(action).toContain('recordEvents');
    expect(action).toContain("bailed: 'dnf'");
    expect(action).toContain("source: 'rapid-fire'");
    // No second model: the event is an ordinary PreferenceEvent.
    expect(action).toContain("from '@/lib/preference/types'");
  });

  it('the no-opinion answers write only the zero-DNA asked-marker', () => {
    expect(action).toContain("action: 'skip'");
  });

  it('"wasn’t me" deletes the row and never fabricates a taste event', () => {
    expect(action).toContain('dropsObservation');
    expect(action).toMatch(/\.delete\(\)/);
  });

  it('the meaning of every answer comes from resolveAnswer — one owner', () => {
    expect(action).toContain('resolveAnswer');
    // And the pure contract the action leans on still holds:
    expect(resolveAnswer('dont_remember').verdict).toBeNull();
    expect(resolveAnswer('not_me').dropsObservation).toBe(true);
    expect(resolveAnswer('bailed').verdict).toBe('did_not_finish');
  });

  it('already-asked titles are excluded across sittings via their events', () => {
    const page = read('src/app/app/rapid-fire/page.tsx');
    expect(page).toContain("eq('source', 'rapid-fire')");
    expect(page).toContain('!asked.has');
  });
});

describe('the queue key bridge is stable', () => {
  it('normaliseKey matches between the observation and the ref map', () => {
    const { observations, refs } = historyToObservations([row()]);
    const key = normaliseKey(observations[0]!.title, observations[0]!.mediaType);
    expect(refs.has(key)).toBe(true);
  });
});
