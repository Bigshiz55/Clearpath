import { describe, it, expect } from 'vitest';
import {
  parseNetflixCsv, splitCsvLine, decomposeTitle, parseDate, inferDateOrder,
  mapColumns, looksLikeHeader,
} from './netflixCsv';
import { consolidate, classifyEvidence, EVIDENCE_THRESHOLDS } from './consolidate';
import {
  SIGNAL_WEIGHTS, ZERO_WEIGHT_CONTEXTS, signalFor, signalForVerdict, isTasteBearing,
  createsPermanentExclusion, applyInfluenceCap, type ImportContext, type UserVerdict,
} from './signalModel';

const csv = (...lines: string[]) => lines.join('\n');

// ---------------------------------------------------------------------------
// CSV tests 1–20
// ---------------------------------------------------------------------------
describe('Netflix CSV parsing', () => {
  it('1. parses a standard viewing-history export', () => {
    const r = parseNetflixCsv(csv('Title,Date', 'The Irishman,1/15/26', 'Klaus,12/25/25'));
    expect(r.accepted).toBe(2);
    expect(r.rows[0]!.rawTitle).toBe('The Irishman');
    expect(r.rows[0]!.watchedOn).toBe('2026-01-15');
    expect(r.dateRange).toEqual({ first: '2025-12-25', last: '2026-01-15' });
  });

  it('2. does not depend on column order', () => {
    const r = parseNetflixCsv(csv('Date,Profile Name,Title', '1/15/26,Scott,The Irishman'));
    expect(r.accepted).toBe(1);
    expect(r.rows[0]!.rawTitle).toBe('The Irishman');
    expect(r.rows[0]!.profileName).toBe('Scott');
  });

  it('3. infers day-first dates from the file rather than assuming US order', () => {
    // 25/12 can only be day-first; the ambiguous 1/2 must follow suit.
    const r = parseNetflixCsv(csv('Title,Date', 'A,25/12/25', 'B,1/2/26'));
    expect(r.rows[0]!.watchedOn).toBe('2025-12-25');
    expect(r.rows[1]!.watchedOn).toBe('2026-02-01');
    expect(inferDateOrder(['25/12/25', '1/2/26'])).toBe('dmy');
  });

  it('accepts ISO dates', () => {
    expect(parseDate('2026-01-15', 'ymd')).toBe('2026-01-15');
    expect(inferDateOrder(['2026-01-15'])).toBe('ymd');
  });

  it('4. keeps commas inside quoted titles', () => {
    const r = parseNetflixCsv(csv('Title,Date', '"Hello, Goodbye, and Everything",1/1/26'));
    expect(r.rows[0]!.rawTitle).toBe('Hello, Goodbye, and Everything');
    expect(splitCsvLine('"a,b",c')).toEqual(['a,b', 'c']);
    expect(splitCsvLine('"He said ""hi""",x')).toEqual(['He said "hi"', 'x']);
  });

  it('5. flags duplicates instead of importing them twice', () => {
    const r = parseNetflixCsv(csv('Title,Date', 'Klaus,1/1/26', 'Klaus,1/1/26'));
    expect(r.accepted).toBe(1);
    expect(r.duplicates).toBe(1);
    expect(r.rows[1]!.reason).toMatch(/appears earlier/i);
  });

  it('the same title on a different day is NOT a duplicate — it is a rewatch', () => {
    const r = parseNetflixCsv(csv('Title,Date', 'Klaus,1/1/26', 'Klaus,3/4/26'));
    expect(r.accepted).toBe(2);
    expect(r.duplicates).toBe(0);
  });

  it('6/7. handles blank rows and a missing header', () => {
    const blank = parseNetflixCsv(csv('Title,Date', '', 'Klaus,1/1/26', ''));
    expect(blank.blank).toBe(2);
    expect(blank.accepted).toBe(1);

    const noHeader = parseNetflixCsv(csv('Klaus,1/1/26', 'Roma,2/2/26'));
    expect(noHeader.accepted).toBe(2);
    expect(noHeader.warnings.join(' ')).toMatch(/no column headers/i);
  });

  it('8. reports unknown headers rather than failing', () => {
    const r = parseNetflixCsv(csv('Title,Date,Mystery Column', 'Klaus,1/1/26,zzz'));
    expect(r.accepted).toBe(1);
    expect(r.unknownColumns).toContain('Mystery Column');
  });

  it('9. never silently discards a bad row', () => {
    const r = parseNetflixCsv(csv('Title,Date', ',1/1/26', 'Klaus,not-a-date'));
    expect(r.detected).toBe(2);
    expect(r.invalid).toBe(1);
    expect(r.rows[0]!.reason).toMatch(/no title/i);
    // A bad date keeps the title — losing the row would be worse.
    expect(r.rows[1]!.status).toBe('ok');
    expect(r.rows[1]!.watchedOn).toBeNull();
    expect(r.rows[1]!.reason).toMatch(/could not be read/i);
  });

  it('10. handles a large file without losing the count', () => {
    const rows = Array.from({ length: 5000 }, (_, i) => `Title ${i},1/1/26`);
    const r = parseNetflixCsv(csv('Title,Date', ...rows));
    expect(r.detected).toBe(5000);
    expect(r.accepted).toBe(5000);
  });

  it('strips a UTF-8 BOM instead of losing the Title column', () => {
    const r = parseNetflixCsv('﻿Title,Date\nKlaus,1/1/26');
    expect(r.accepted).toBe(1);
    expect(r.rows[0]!.rawTitle).toBe('Klaus');
  });

  it('handles semicolon-delimited exports', () => {
    const r = parseNetflixCsv(csv('Title;Date', 'Klaus;1/1/26'));
    expect(r.accepted).toBe(1);
    expect(r.rows[0]!.rawTitle).toBe('Klaus');
  });

  it('11/12/13. tells films, series and episodes apart', () => {
    expect(decomposeTitle('The Irishman').isEpisode).toBe(false);
    const ep = decomposeTitle('Stranger Things: Season 2: Trick or Treat, Freak');
    expect(ep.isEpisode).toBe(true);
    expect(ep.seriesTitle).toBe('Stranger Things');
    expect(ep.seasonNumber).toBe(2);
    expect(ep.episodeTitle).toBe('Trick or Treat, Freak');
  });

  it('handles limited series and part-based season labels', () => {
    expect(decomposeTitle('Beef: Limited Series: The Birds').seriesTitle).toBe('Beef');
    expect(decomposeTitle('Kaleidoscope: Part 3: Green').seasonNumber).toBe(3);
  });

  it('16. handles localized season labels and foreign titles', () => {
    const es = decomposeTitle('La Casa de Papel: Temporada 3: Episodio 4');
    expect(es.seriesTitle).toBe('La Casa de Papel');
    expect(es.seasonNumber).toBe(3);
    const de = decomposeTitle('Dark: Staffel 1: Geheimnisse');
    expect(de.seriesTitle).toBe('Dark');
  });

  it('recognises localized column headers', () => {
    const { map } = mapColumns(['Título', 'Fecha', 'Perfil']);
    expect(map.title).toBe(0);
    expect(map.date).toBe(1);
    expect(map.profile).toBe(2);
    expect(looksLikeHeader(['Título', 'Fecha'])).toBe(true);
    expect(looksLikeHeader(['Klaus', '1/1/26'])).toBe(false);
  });

  it('19/20. detects multiple profiles', () => {
    const r = parseNetflixCsv(csv(
      'Title,Date,Profile Name',
      'Klaus,1/1/26,Scott', 'Roma,1/2/26,Heather', 'Bluey,1/3/26,Kids',
    ));
    expect(r.profiles).toEqual(['Heather', 'Kids', 'Scott']);
  });

  it('HARD: an unquoted comma in a title is flagged, not misaligned into other columns', () => {
    // Found in a browser test: this shifted every column, so the DATE was
    // imported as the profile name.
    const r = parseNetflixCsv(csv(
      'Title,Date,Profile Name',
      'Trick or Treat, Freak,1/6/26,Heather',
      '"Quoted, Properly",1/7/26,Heather',
    ));
    expect(r.rows[0]!.status).toBe('invalid');
    expect(r.rows[0]!.reason).toMatch(/not quoted/i);
    expect(r.rows[0]!.profileName).toBeNull();   // never a date
    // The correctly quoted row still imports.
    expect(r.rows[1]!.rawTitle).toBe('Quoted, Properly');
    expect(r.rows[1]!.profileName).toBe('Heather');
  });

  it('an empty or unrecognisable file explains itself instead of throwing', () => {
    expect(parseNetflixCsv('').warnings.join(' ')).toMatch(/empty/i);

    // Unrecognised headers AND no dates: refuse, rather than importing the
    // header row itself as a watched title.
    const notNetflix = parseNetflixCsv('Foo,Bar\nalpha,beta');
    expect(notNetflix.accepted).toBe(0);
    expect(notNetflix.warnings.join(' ')).toMatch(/does not look like a Netflix viewing history/i);

    // A recognised title column with junk elsewhere still imports.
    expect(parseNetflixCsv('Title,Bar\nKlaus,beta').accepted).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// Episode consolidation 14, plus evidence strength
// ---------------------------------------------------------------------------
describe('episode consolidation', () => {
  const episodes = (series: string, season: number, n: number) =>
    Array.from({ length: n }, (_, i) =>
      `${series}: Season ${season}: Episode ${i + 1},1/${(i % 28) + 1}/26`).join('\n');

  it('14. folds many episodes into ONE series observation', () => {
    const r = parseNetflixCsv(csv('Title,Date', episodes('Ozark', 1, 10)));
    const c = consolidate(r.rows);
    expect(c.series).toHaveLength(1);
    expect(c.series[0]!.seriesTitle).toBe('Ozark');
    expect(c.series[0]!.episodeCount).toBe(10);
    // 62 rows must not become 62 pieces of evidence.
    expect(c.series[0]!.episodes).toHaveLength(10);
  });

  it('scales evidence with how much was actually watched', () => {
    expect(classifyEvidence(1, 1)).toBe('sampled');
    expect(classifyEvidence(EVIDENCE_THRESHOLDS.moderate, 1)).toBe('moderate');
    expect(classifyEvidence(EVIDENCE_THRESHOLDS.substantial, 1)).toBe('substantial');
    expect(classifyEvidence(20, 2)).toBe('strong');
  });

  it('HARD: one sampled episode is not enjoyment evidence', () => {
    const r = parseNetflixCsv(csv('Title,Date', 'Ozark: Season 1: Episode 1,1/1/26'));
    const c = consolidate(r.rows);
    expect(c.series[0]!.strength).toBe('sampled');
    expect(c.series[0]!.context).toBe('viewing_history');
    expect(signalFor(c.series[0]!.context).weight).toBeLessThan(0.5);
    expect(c.series[0]!.reason).toMatch(/not enough to say you liked it/i);
  });

  it('substantial viewing becomes stronger evidence — but still not "loved"', () => {
    const r = parseNetflixCsv(csv('Title,Date', episodes('Ozark', 1, 10)));
    const c = consolidate(r.rows);
    expect(c.series[0]!.context).toBe('completed_series');
    const sig = signalFor('completed_series');
    expect(sig.explicit).toBe(false);
    // Never as strong as an explicit statement.
    expect(sig.weight).toBeLessThan(signalFor('thumbs_up').weight);
  });

  it('multiple seasons read as continuing interest', () => {
    const r = parseNetflixCsv(csv('Title,Date', episodes('Ozark', 1, 6), episodes('Ozark', 2, 6)));
    const c = consolidate(r.rows);
    expect(c.series).toHaveLength(1);
    expect(c.series[0]!.distinctSeasons).toBe(2);
    expect(c.series[0]!.strength).toBe('strong');
  });

  it('replaying one episode is not two episodes', () => {
    const r = parseNetflixCsv(csv('Title,Date',
      'Ozark: Season 1: Episode 1,1/1/26', 'Ozark: Season 1: Episode 1,2/2/26'));
    const c = consolidate(r.rows);
    expect(c.series[0]!.episodeCount).toBe(1);
  });

  it('a film watched on separate days is a rewatch; twice in a day is not', () => {
    const rewatch = consolidate(parseNetflixCsv(csv('Title,Date', 'Klaus,1/1/26', 'Klaus,6/6/26')).rows);
    expect(rewatch.movies[0]!.context).toBe('repeated_viewing');

    const sameDay = consolidate(parseNetflixCsv(csv('Title,Date,Profile Name',
      'Roma,1/1/26,Scott', 'Roma,1/1/26,Heather')).rows);
    expect(sameDay.movies[0]!.context).toBe('viewing_history');
  });

  it('accounts for every row — nothing vanishes', () => {
    const r = parseNetflixCsv(csv('Title,Date', 'Klaus,1/1/26', '', ',2/2/26', 'Klaus,1/1/26'));
    const c = consolidate(r.rows);
    const placed = c.series.reduce((n, s) => n + s.episodes.length, 0)
      + c.movies.reduce((n, m) => n + m.rows.length, 0);
    expect(placed + c.skipped.length).toBe(r.detected);
  });
});

// ---------------------------------------------------------------------------
// Signal tests 41–50
// ---------------------------------------------------------------------------
describe('signal weighting', () => {
  it('HARD: 44. platform-generated context carries ZERO taste weight', () => {
    for (const c of ['because_you_watched', 'trending', 'popular',
      'recommendation_row', 'visible_poster'] as ImportContext[]) {
      const s = signalFor(c);
      expect(s.weight, c).toBe(0);
      expect(s.polarity, c).toBe(0);
      expect(s.channel, c).toBeNull();
      expect(isTasteBearing(c), c).toBe(false);
    }
    expect(ZERO_WEIGHT_CONTEXTS).toContain('visible_poster');
  });

  it('HARD: 41. watched is not liked', () => {
    const watched = signalFor('viewing_history');
    expect(watched.explicit).toBe(false);
    expect(watched.weight).toBeLessThan(0.3);
    expect(watched.rationale).toMatch(/not assumed you liked/i);
    // An explicit like is worth several times a play.
    expect(signalFor('thumbs_up').weight).toBeGreaterThan(watched.weight * 4);
  });

  it('42. saved is not watched', () => {
    const saved = signalFor('my_list');
    expect(saved.channel).toBe('attraction'); // interest, not experience
    expect(signalFor('viewing_history').channel).toBe('experience');
  });

  it('43. Continue Watching stays weak and temporary', () => {
    const cw = signalFor('continue_watching');
    expect(cw.weight).toBeLessThan(0.25);
    expect(cw.decay).toBe('mood');
    expect(cw.rationale).toMatch(/cannot tell yet/i);
  });

  it('45/46/47. explicit service ratings are the strongest imported signals', () => {
    expect(signalFor('double_thumbs_up').weight).toBeGreaterThan(signalFor('thumbs_up').weight);
    expect(signalFor('thumbs_up').polarity).toBe(1);
    expect(signalFor('thumbs_down').polarity).toBe(-1);
    for (const c of ['double_thumbs_up', 'thumbs_up', 'thumbs_down'] as ImportContext[]) {
      expect(signalFor(c).explicit, c).toBe(true);
    }
  });

  it('the hierarchy is ordered as documented', () => {
    const w = (c: ImportContext) => signalFor(c).weight;
    expect(w('double_thumbs_up')).toBeGreaterThan(w('thumbs_up'));
    expect(w('thumbs_up')).toBeGreaterThan(w('repeated_viewing'));
    expect(w('repeated_viewing')).toBeGreaterThan(w('completed_series'));
    expect(w('completed_series')).toBeGreaterThan(w('my_list'));
    expect(w('my_list')).toBeGreaterThan(w('downloaded'));
    expect(w('downloaded')).toBeGreaterThan(w('continue_watching'));
    expect(w('continue_watching')).toBeGreaterThan(w('visible_poster'));
  });

  it('48. a user verdict overrides whatever we detected', () => {
    const detected = signalFor('viewing_history');
    const corrected = signalForVerdict('loved')!;
    expect(corrected.weight).toBeGreaterThan(detected.weight);
    expect(corrected.explicit).toBe(true);
  });

  it('HARD: 50. only an explicit verdict can create a permanent exclusion', () => {
    // No DETECTED context may produce one.
    for (const c of Object.keys(SIGNAL_WEIGHTS) as ImportContext[]) {
      const s = signalFor(c);
      const permanentNegative = s.polarity === -1 && s.decay === 'permanent';
      if (permanentNegative) {
        // The one detected negative must demand confirmation first.
        expect(s.requiresConfirmation, c).toBe(true);
      }
    }
    expect(createsPermanentExclusion('never_recommend')).toBe(true);
    for (const v of ['watched', 'saved', 'not_now', 'disliked'] as UserVerdict[]) {
      expect(createsPermanentExclusion(v), v).toBe(false);
    }
  });

  it('"not now" decays; "never recommend" does not', () => {
    expect(signalForVerdict('not_now')!.decay).toBe('mood');
    expect(signalForVerdict('never_recommend')!.decay).toBe('permanent');
  });

  it('confirming "watched" still does not imply an opinion', () => {
    const s = signalForVerdict('watched')!;
    expect(s.weight).toBeLessThan(signalForVerdict('liked')!.weight);
    expect(s.rationale).toMatch(/not assumed an opinion/i);
  });

  it('a record assigned to another profile contributes nothing here', () => {
    expect(signalForVerdict('other_profile')).toBeNull();
    expect(signalForVerdict('remove')).toBeNull();
  });

  it('every context has a rationale the review screen can show', () => {
    for (const c of Object.keys(SIGNAL_WEIGHTS) as ImportContext[]) {
      expect(signalFor(c).rationale.length, c).toBeGreaterThan(15);
    }
  });
});

// ---------------------------------------------------------------------------
// A big import must not drown a small number of real ratings
// ---------------------------------------------------------------------------
describe('import influence cap', () => {
  it('HARD: 4,000 history rows cannot outweigh a few explicit ratings', () => {
    const items = [
      ...Array.from({ length: 4000 }, () => ({ weight: 0.2, explicit: false })),
      ...Array.from({ length: 5 }, () => ({ weight: 1.1, explicit: true })),
    ];
    const { items: out, scale } = applyInfluenceCap(items);
    expect(scale).toBeLessThan(0.05);

    const inferredMass = out.filter((i) => !i.explicit).reduce((n, i) => n + i.scaledWeight, 0);
    const explicitMass = out.filter((i) => i.explicit).reduce((n, i) => n + i.scaledWeight, 0);
    // Inferred history informs, but does not dominate.
    expect(inferredMass).toBeLessThan(explicitMass * 2);
  });

  it('never scales down what the user explicitly stated', () => {
    const items = [
      { weight: 1.6, explicit: true },
      ...Array.from({ length: 500 }, () => ({ weight: 0.2, explicit: false })),
    ];
    const { items: out } = applyInfluenceCap(items);
    expect(out[0]!.scaledWeight).toBe(1.6);
  });

  it('leaves a small, balanced import untouched', () => {
    const items = [
      { weight: 1.1, explicit: true }, { weight: 1.1, explicit: true },
      { weight: 0.2, explicit: false },
    ];
    expect(applyInfluenceCap(items).scale).toBe(1);
  });

  it('handles an empty batch without dividing by zero', () => {
    expect(applyInfluenceCap([]).scale).toBe(1);
  });
});
