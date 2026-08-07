import { describe, it, expect } from 'vitest';
import {
  AI_TOOLS,
  TOOL_LIMITS,
  resolveProvider,
  resolveKeywordIds,
  resolveTitle,
  resolvePerson,
  searchBySubject,
} from './tools';

/**
 * THE TOOL BOUNDARY (§13). These assert the shape and safety of the approved
 * tool surface without any network: the registry is a closed, named set; each
 * tool degrades to null/[] on empty/too-short input BEFORE any catalog call; and
 * provider resolution is the pure ontology (a network with no streaming id
 * resolves to null rather than a guess).
 */

describe('AI tool registry is a closed, named set', () => {
  it('exposes exactly the approved tools', () => {
    expect(Object.keys(AI_TOOLS).sort()).toEqual(
      ['referenceThemeKeywords', 'resolveKeywordIds', 'resolveProvider', 'resolvePerson', 'resolveTitle', 'searchBySubject'].sort(),
    );
  });
  it('publishes bounded limits', () => {
    expect(TOOL_LIMITS.maxSubjectTerms).toBeGreaterThan(0);
    expect(TOOL_LIMITS.maxKeywordIds).toBeGreaterThan(0);
    expect(TOOL_LIMITS.maxReferenceTitles).toBeGreaterThan(0);
  });
});

describe('resolveProvider — pure ontology, never a guess', () => {
  it('resolves a real streaming provider to its canonical id', async () => {
    const r = await resolveProvider('netflix');
    expect(r).toEqual({ providerId: 8, canonicalName: 'Netflix' });
  });
  it('returns null for a linear-only network (no streaming provider id)', async () => {
    expect(await resolveProvider('Hallmark Channel')).toBeNull();
  });
  it('returns null for an empty name', async () => {
    expect(await resolveProvider('')).toBeNull();
  });
});

describe('tools degrade before any network call', () => {
  it('resolveTitle returns null for too-short text', async () => {
    expect(await resolveTitle('')).toBeNull();
    expect(await resolveTitle('a')).toBeNull();
  });
  it('resolvePerson returns null for too-short text', async () => {
    expect(await resolvePerson('a')).toBeNull();
  });
  it('resolveKeywordIds returns [] for empty input', async () => {
    expect(await resolveKeywordIds([])).toEqual([]);
  });
  it('searchBySubject returns null when no term is present', async () => {
    expect(await searchBySubject([])).toBeNull();
    expect(await searchBySubject(['   '])).toBeNull();
  });
});
