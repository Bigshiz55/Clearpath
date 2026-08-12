import { describe, it, expect } from 'vitest';
import { isEligible, partitionEligible, shapeForPack, type ProgrammeFacts } from './eligibility';

/**
 * THE CONTAMINATION THAT SHIPPED, TURNED INTO TESTS.
 *
 * Every title below was reported in a real Pack page. None of them is a
 * listings error — they genuinely aired on those channels. The bug was that
 * `listPackBrowse` treated "aired on a Lifetime channel" as "is a Lifetime
 * movie", and a cable channel's schedule is mostly not the thing the channel is
 * known for.
 *
 * The rules are properties of the programme rather than a blocklist of the five
 * titles in the screenshots, so they generalise to next week's schedule. These
 * tests check both directions: the contamination is excluded AND the genuine
 * article still gets in, because a filter that empties the Vault is not a fix.
 */

const prog = (title: string, extra: Partial<ProgrammeFacts> = {}): ProgrammeFacts => ({
  title,
  mediaType: 'movie',
  genres: ['drama'],
  ...extra,
});

describe('Lifetime Movie Vault keeps movies and drops the schedule', () => {
  const vault = (f: ProgrammeFacts) => isEligible('movie-vault', f);

  it('drops the syndicated procedurals that filled it', () => {
    for (const t of ['Castle', 'The Rookie', 'Major Crimes']) {
      const v = vault(prog(t, { mediaType: 'tv', episodeCount: 100 }));
      expect(v.eligible, `${t} is still in the Vault`).toBe(false);
      expect(v.reason).toContain('movie vault');
    }
  });

  it('drops paid religious programming', () => {
    for (const t of ['Joyce Meyer Enjoying Everyday Life', 'Life Today']) {
      const v = vault(prog(t, { mediaType: 'tv' }));
      expect(v.eligible, `${t} is still in the Vault`).toBe(false);
      expect(v.reason).toBe('not entertainment programming');
    }
  });

  it('drops reality formats', () => {
    const v = vault(prog('Dr. Pimple Popper', { mediaType: 'tv', genres: ['reality'] }));
    expect(v.eligible).toBe(false);
  });

  it('drops an unmatched programme rather than guessing it is a film', () => {
    /* FAIL CLOSED. An unmatched row could be anything, and "probably a movie
       because it is on a movie channel" is the exact assumption that caused
       this. */
    const v = vault(prog('Some Unmatched Airing', { mediaType: null }));
    expect(v.eligible).toBe(false);
    expect(v.reason).toContain('unmatched');
  });

  it('drops a 42-minute "movie", which is a drama episode', () => {
    const v = vault(prog('A Suspicious Movie', { runtimeMinutes: 42 }));
    expect(v.eligible).toBe(false);
    expect(v.reason).toContain('episode');
  });

  it('AND KEEPS THE ACTUAL LIFETIME MOVIES — a filter that empties it is not a fix', () => {
    for (const t of ['A Deadly Adoption', 'Stalked by My Doctor', 'The Girl in the Basement']) {
      const v = vault(prog(t, { mediaType: 'movie', runtimeMinutes: 88, genres: ['thriller'] }));
      expect(v.eligible, `${t} was wrongly excluded: ${v.reason}`).toBe(true);
    }
  });
});

describe('Crime Case Files keeps cases and drops the rest', () => {
  const cases = (f: ProgrammeFacts) => isEligible('crime-cases', f);

  it('drops the reality formats that filled it', () => {
    /* The product's promise is CASES — a real event with victims, a place and a
       date, retold across programmes. An auction show is not a case however
       often its metadata says "crime". */
    for (const t of ['Storage Wars', 'K9 PD With Jim Belushi']) {
      const v = cases(prog(t, { mediaType: 'tv', genres: ['crime', 'reality'] }));
      expect(v.eligible, `${t} is still in Case Files`).toBe(false);
    }
  });

  it('drops infomercials', () => {
    const v = cases(prog('Natural Blood Pressure Management', { mediaType: null, genres: [] }));
    expect(v.eligible).toBe(false);
    expect(v.reason).toBe('not entertainment programming');
  });

  it('drops anything it cannot confirm is crime', () => {
    expect(cases(prog('Unknown Thing', { genres: [] })).eligible).toBe(false);
    expect(cases(prog('A Cooking Show', { genres: ['food'] })).eligible).toBe(false);
  });

  it('AND KEEPS THE REAL TRUE-CRIME PROGRAMMES', () => {
    for (const t of ['Dateline', 'Snapped', '48 Hours']) {
      const v = cases(prog(t, { mediaType: 'tv', genres: ['crime', 'documentary'] }));
      expect(v.eligible, `${t} was wrongly excluded: ${v.reason}`).toBe(true);
    }
  });
});

describe('the rules are about format, not subject', () => {
  it('a documentary about medicine is not an infomercial', () => {
    /* The infomercial patterns target a FORMAT. Broadening them to catch topics
       would start excluding real programming, which is the more expensive
       mistake — an over-eager filter empties the page and nobody can tell why. */
    const v = isEligible('crime-cases', prog('The Bleeding Edge', { genres: ['documentary'] }));
    expect(v.eligible).toBe(true);
  });

  it('a crime film is not excluded for being about a heist', () => {
    expect(isEligible('movie-vault', prog('Heist', { runtimeMinutes: 96 })).eligible).toBe(true);
  });
});

describe('rejections are reported, not silently dropped', () => {
  it('partition returns the reasons', () => {
    /* "The Vault is empty" and "the Vault filtered out 300 infomercials" are
       different problems and must be distinguishable to whoever debugs it. */
    const { kept, rejected } = partitionEligible('movie-vault', [
      prog('A Real Lifetime Movie', { runtimeMinutes: 90 }),
      prog('Castle', { mediaType: 'tv', episodeCount: 100 }),
      prog('Joyce Meyer Enjoying Everyday Life', { mediaType: 'tv' }),
    ]);
    expect(kept).toHaveLength(1);
    expect(rejected).toHaveLength(2);
    expect(rejected.every((r) => r.reason.length > 0)).toBe(true);
  });
});

describe('pack shape is data, not a branch on a slug', () => {
  it('maps the known packs and defaults to open', () => {
    // CLAUDE.md forbids switching on a Pack slug in shared logic; this is a
    // lookup table the shared path reads, like `packChannelMap` does for channels.
    expect(shapeForPack('lifetime-movie-vault')).toBe('movie-vault');
    expect(shapeForPack('crime-case-files')).toBe('crime-cases');
    expect(shapeForPack('hallmark')).toBe('seasonal-movies');
    expect(shapeForPack('some-future-pack')).toBe('open');
  });
});
