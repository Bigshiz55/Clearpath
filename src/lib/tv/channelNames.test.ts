import { describe, it, expect } from 'vitest';
import { channelIdentity } from './channelNames';

describe('channel identity — abbreviated grid codes resolve to the real name', () => {
  // Some grid rows arrive as a short Gracenote-style station code rather than
  // the network's own name. Read alone, that code IS the abbreviation the
  // guide used to repeat beside its own monogram badge — these must resolve
  // to the same full name the network's own spelling already does.
  it('DISC -> Discovery, same as the full spelling', () => {
    expect(channelIdentity('DISC').name).toBe('Discovery');
    expect(channelIdentity('DISC').name).toBe(channelIdentity('Discovery').name);
  });

  it('HIST -> History, same as the full spelling', () => {
    expect(channelIdentity('HIST').name).toBe('History');
    expect(channelIdentity('HIST').name).toBe(channelIdentity('History').name);
  });

  it('BRA -> Bravo, same as the full spelling', () => {
    expect(channelIdentity('BRA').name).toBe('Bravo');
    expect(channelIdentity('BRA').name).toBe(channelIdentity('Bravo').name);
  });

  it('HAL -> Hallmark Channel, same as the full spelling', () => {
    expect(channelIdentity('HAL').name).toBe('Hallmark Channel');
    expect(channelIdentity('HAL').name).toBe(channelIdentity('Hallmark').name);
  });

  it('every alias is marked mapped (we actually knew it, not a guess)', () => {
    for (const code of ['DISC', 'HIST', 'BRA', 'HAL']) {
      expect(channelIdentity(code).mapped).toBe(true);
    }
  });
});

describe('channel identity — the rest of the module is unaffected', () => {
  it('a real call sign we cannot map is shown as-is, never guessed', () => {
    const id = channelIdentity('KXYZDT');
    expect(id.name).toBe('KXYZ');
    expect(id.mapped).toBe(true); // the -DT tail was stripped, so name !== raw
  });

  it('a PX-block call sign is ION Television', () => {
    expect(channelIdentity('WPXNDT').name).toBe('ION Television');
  });

  it('an unrecognized name keeps its own spelling, unmapped', () => {
    const id = channelIdentity('Some Local Channel');
    expect(id.name).toBe('Some Local Channel');
    expect(id.mapped).toBe(false);
  });
});
