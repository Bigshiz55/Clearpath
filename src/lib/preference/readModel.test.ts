/**
 * ONE READ MODEL OVER SIX EVIDENCE STORES — Phase 3 of graph-native
 * WatchVerd1ct: user evidence unification.
 *
 * THE STATE THIS ENDS (audited at 975938f): four parallel taste models
 * (`deriveDna`, `DimensionProfile`, embedding `TasteDna`, `DnaSignalTally`)
 * each read their own subset of six raw stores, and every derivation
 * FLATTENS provenance at the boundary — `preference_events` rows carry
 * source/event_at/session_id and `rowToEvent` drops them; `dimension_signals`
 * is two floats with no history; `preference_rules` reaches no derived model
 * at all. Nothing in the system can answer "which evidence, from where,
 * observed when, produced this belief".
 *
 * THE SHAPE. `EvidenceRecord` carries the repo's own sanctioned `Provenance`
 * and `Persistence` (src/lib/graph/types.ts) — reusing the graph vocabulary
 * rather than inventing a second provenance model, which is the exact
 * failure the ingest sourceRegistry warns about. The shapers are pure and
 * per-store; honesty rules are load-bearing:
 *
 *   - `observedAt` comes from the ROW's own timestamp, never from "now".
 *   - confidence is null unless the source genuinely grades itself.
 *   - the `dimension_signals` aggregate admits it has no per-row history
 *     (detail.aggregated) instead of dressing two floats as events.
 *   - reactions/ratings are `user_action`; dials and FOR/AGAINST rules are
 *     `user_statement`; the running axis aggregate is `inference`.
 *
 * ADDITIVE. `deriveDna` and every existing consumer are untouched — this
 * phase builds the traceable view; later phases migrate consumers onto it.
 */
import { describe, it, expect } from 'vitest';
import {
  evidenceFromPreferenceEvent,
  evidenceFromDimensionSignal,
  evidenceFromOverride,
  evidenceFromRule,
  evidenceFromRating,
  type EvidenceRecord,
} from './readModel';

describe('reactions — the preference_events spine', () => {
  const row = {
    id: 'evt-1',
    title_id: 'movie:603',
    action: 'loved',
    source: 'showdown',
    round_id: 'round-9',
    session_id: null,
    event_at: '2026-08-14T12:00:00.000Z',
    undone_at: null,
  };

  it('keeps the provenance the store already had and deriveDna drops', () => {
    const ev = evidenceFromPreferenceEvent(row)!;
    expect(ev.kind).toBe('reaction');
    expect(ev.key).toBe('movie:603');
    expect(ev.provenance.source).toBe('user_action');
    expect(ev.provenance.observedAt).toBe('2026-08-14T12:00:00.000Z');
    expect(ev.provenance.runId).toBe('round-9');
    expect(ev.persistence).toBe('durable');
    expect(ev.detail?.surface).toBe('showdown');
    expect(ev.detail?.action).toBe('loved');
  });

  it('behavior does not grade itself — confidence stays null', () => {
    expect(evidenceFromPreferenceEvent(row)!.provenance.confidence ?? null).toBeNull();
  });

  it('an undone event is evidence of NOTHING — excluded, not down-weighted', () => {
    expect(evidenceFromPreferenceEvent({ ...row, undone_at: '2026-08-15T00:00:00Z' })).toBeNull();
  });
});

describe('the axis aggregate — honest about what it is not', () => {
  it('admits it is an aggregate with no per-row history', () => {
    const ev = evidenceFromDimensionSignal({
      dimension_key: 'darkness',
      w_sum: 3.2,
      wv_sum: 224,
      updated_at: '2026-08-10T09:30:00.000Z',
    });
    expect(ev.kind).toBe('axis_signal');
    expect(ev.key).toBe('darkness');
    expect(ev.provenance.source).toBe('inference');
    expect(ev.provenance.observedAt).toBe('2026-08-10T09:30:00.000Z');
    expect(ev.detail?.aggregated, 'two floats are not an event log and must say so').toBe(true);
    // The implied position, recoverable: wv/w.
    expect(ev.detail?.impliedTarget).toBe(70);
  });
});

describe('statements — dials and rules', () => {
  it('a pinned dial is a user statement at full confidence', () => {
    const ev = evidenceFromOverride({ dimension_key: 'violence', pref: 20, is_limit: true, updated_at: '2026-08-01T00:00:00.000Z' });
    expect(ev.kind).toBe('axis_override');
    expect(ev.provenance.source).toBe('user_statement');
    expect(ev.provenance.confidence).toBe(1);
    expect(ev.persistence).toBe('durable');
    expect(ev.detail?.hardLimit).toBe(true);
  });

  it('a FOR/AGAINST rule finally joins the same evidence vocabulary', () => {
    const ev = evidenceFromRule({ trait: 'slow-burn', weight: -25, label: 'Too slow', created_at: '2026-07-20T00:00:00.000Z' });
    expect(ev.kind).toBe('rule');
    expect(ev.key).toBe('slow-burn');
    expect(ev.weight).toBe(-25);
    expect(ev.provenance.source).toBe('user_statement');
  });
});

describe('ratings', () => {
  it('a rating is user action observed when it was watched, not when it was read', () => {
    const ev = evidenceFromRating({
      tmdb_id: 603,
      media_type: 'movie',
      rating: 9,
      watched_at: '2026-06-01T00:00:00.000Z',
      added_at: '2026-05-01T00:00:00.000Z',
    })!;
    expect(ev.kind).toBe('rating');
    expect(ev.key).toBe('movie:603');
    expect(ev.weight).toBe(9);
    expect(ev.provenance.source).toBe('user_action');
    expect(ev.provenance.observedAt).toBe('2026-06-01T00:00:00.000Z');
  });

  it('falls back to added_at only when watched_at is absent, and an unrated save is no taste evidence', () => {
    expect(
      evidenceFromRating({ tmdb_id: 1, media_type: 'tv', rating: 7, watched_at: null, added_at: '2026-05-01T00:00:00.000Z' })!
        .provenance.observedAt,
    ).toBe('2026-05-01T00:00:00.000Z');
    expect(evidenceFromRating({ tmdb_id: 2, media_type: 'tv', rating: null, watched_at: null, added_at: '2026-05-01T00:00:00.000Z' })).toBeNull();
  });
});

describe('the record shape is the graph vocabulary, not a second one', () => {
  it('every shaper emits Provenance with an observedAt — never an invented now', () => {
    const records: EvidenceRecord[] = [
      evidenceFromPreferenceEvent({ id: 'e', title_id: 'tv:1', action: 'liked', source: null, round_id: null, session_id: null, event_at: '2026-08-14T12:00:00.000Z', undone_at: null })!,
      evidenceFromDimensionSignal({ dimension_key: 'humor', w_sum: 1, wv_sum: 50, updated_at: '2026-08-14T12:00:00.000Z' }),
      evidenceFromOverride({ dimension_key: 'humor', pref: 80, is_limit: false, updated_at: '2026-08-14T12:00:00.000Z' }),
      evidenceFromRule({ trait: 'x', weight: 10, label: null, created_at: '2026-08-14T12:00:00.000Z' }),
      evidenceFromRating({ tmdb_id: 3, media_type: 'movie', rating: 8, watched_at: null, added_at: '2026-08-14T12:00:00.000Z' })!,
    ];
    for (const r of records) {
      expect(r.provenance.observedAt).toBe('2026-08-14T12:00:00.000Z');
      expect(['user_action', 'user_statement', 'inference']).toContain(r.provenance.source);
      expect(['durable', 'session', 'request_only']).toContain(r.persistence);
    }
  });
});

describe('undone events cost nothing', () => {
  it('the loader excludes undone rows at the QUERY, not only in JS', () => {
    /* The shaper's null-return is defense in depth; the query filter is the
       actual fix — an undone event fetched and discarded still consumed one
       of the 1000 cap slots, silently crowding out a live reaction. */
    const src = require('node:fs').readFileSync(require('node:path').join(__dirname, 'readModel.ts'), 'utf8');
    expect(src).toMatch(/\.is\('undone_at', null\)/);
  });
});

describe('the stale-derivation bug this phase also closes', () => {
  it('recordEvents busts the pref-dna cache tag it writes under', () => {
    /* `loadPreferenceCached` tags its entry `pref-dna:${userId}` with a
       5-minute revalidate — and NOTHING in the repo ever revalidated that
       tag, so a fresh rating was invisible to /api/ask for up to five
       minutes. The write chokepoint must bust the tag it feeds. */
    const src = require('node:fs').readFileSync(require('node:path').join(__dirname, 'store.ts'), 'utf8');
    expect(src).toMatch(/revalidateTag\(`pref-dna:\$\{userId\}`\)/);
  });
});
