import { describe, it, expect } from 'vitest';
import { reducer, initialLocalState } from './reducer';
import type { LibraryEntry } from './types';

const NOW = '2026-07-23T00:00:00.000Z';

function entry(workId: string, title: string): LibraryEntry {
  return {
    id: `id-${workId}`,
    book: { workId, title, author: null, year: null, coverUrl: null, isbn13: null, subjects: [], pageCount: null, rating: null, source: 'mock' },
    status: 'saved',
    rating: null,
    dnfReason: null,
    dnfPage: null,
    startedAt: null,
    finishedAt: null,
    addedAt: NOW,
    provenance: 'test',
  };
}

describe('store reducer', () => {
  it('adds to library and de-dupes by workId', () => {
    let s = initialLocalState();
    s = reducer(s, { type: 'add-to-library', entry: entry('w1', 'A') });
    s = reducer(s, { type: 'add-to-library', entry: { ...entry('w1', 'A'), id: 'id2', status: 'reading' } });
    expect(s.library).toHaveLength(1);
    expect(s.library[0]!.status).toBe('reading');
  });

  it('updates and removes entries', () => {
    let s = reducer(initialLocalState(), { type: 'add-to-library', entry: entry('w1', 'A') });
    s = reducer(s, { type: 'update-entry', id: 'id-w1', patch: { status: 'finished', rating: 5 } });
    expect(s.library[0]!.status).toBe('finished');
    expect(s.library[0]!.rating).toBe(5);
    s = reducer(s, { type: 'remove-entry', id: 'id-w1' });
    expect(s.library).toHaveLength(0);
  });

  it('applies Reader DNA observations', () => {
    let s = initialLocalState();
    s = reducer(s, {
      type: 'apply-observations',
      observations: [{ key: 'pacing', observed: 0.9, weight: 0.8, at: NOW }],
    });
    expect(s.readerDna.dimensions.pacing).toBeDefined();
  });

  it('resets DNA and clears all', () => {
    let s = reducer(initialLocalState(), { type: 'set-onboarded', value: true });
    s = reducer(s, { type: 'confirm-dimension', key: 'spice', value: 0.1, at: NOW });
    s = reducer(s, { type: 'reset-dna' });
    expect(s.onboarded).toBe(false);
    expect(Object.keys(s.readerDna.dimensions)).toHaveLength(0);

    s = reducer(s, { type: 'record-event', event: { id: 'e', name: 'x', version: 1, props: {}, at: NOW } });
    s = reducer(s, { type: 'clear-all' });
    expect(s.events).toHaveLength(0);
  });

  it('bounds the local event ring', () => {
    let s = initialLocalState();
    for (let i = 0; i < 520; i++) {
      s = reducer(s, { type: 'record-event', event: { id: `e${i}`, name: 'x', version: 1, props: {}, at: NOW } });
    }
    expect(s.events.length).toBe(500);
  });
});
