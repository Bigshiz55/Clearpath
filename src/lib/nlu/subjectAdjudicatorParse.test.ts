import { describe, it, expect } from 'vitest';
import { parseAdjudication } from './subjectAdjudicatorParse';

describe('subject adjudicator output parsing (schema validation)', () => {
  it('accepts a well-formed verdict', () => {
    const v = parseAdjudication('{"centrality":"CENTRAL","confidence":0.9,"reason":"the film follows a baseball GM."}');
    expect(v).not.toBeNull();
    expect(v!.centrality).toBe('CENTRAL');
    expect(v!.confidence).toBe(0.9);
  });

  it('tolerates a code fence / surrounding prose', () => {
    const v = parseAdjudication('```json\n{"centrality":"incidental","confidence":0.8,"reason":"one scene"}\n```');
    expect(v!.centrality).toBe('INCIDENTAL');
  });

  it('clamps confidence into 0..1 and normalizes case', () => {
    const v = parseAdjudication('{"centrality":"material","confidence":9,"reason":""}');
    expect(v!.centrality).toBe('MATERIAL');
    expect(v!.confidence).toBe(1);
  });

  it('rejects an invalid centrality class (→ null → caller rejects on uncertainty)', () => {
    expect(parseAdjudication('{"centrality":"SORTA","confidence":0.5}')).toBeNull();
  });

  it('rejects non-JSON / empty', () => {
    expect(parseAdjudication('not json')).toBeNull();
    expect(parseAdjudication('')).toBeNull();
  });
});
