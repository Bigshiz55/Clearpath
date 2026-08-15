import { describe, expect, it, beforeEach, afterEach, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  MAX_ELEMENT_BYTES,
  decodeXmlText,
  parseXmltvStream,
  parseXmltvTimestamp,
  type XmltvChannel,
  type XmltvProgramme,
} from './parseXmltv';
import {
  PROVIDER_ID,
  TRANSPORT,
  airingIdFor,
  channelFacts,
  httpsOnly,
  importXmltv,
  programmeKey,
  programmeTypeFor,
  releaseYearFrom,
  type DbClient,
  type DbFilterChain,
  type DbResult,
} from './importXmltv';
import { showTypeForProgrammeType, ingestedRowToAiring } from '@/lib/tv/ingestedGuide';
import { buildChannelGuide, filterGuideByMedia } from '@/lib/tv/channelGuide';

/**
 * XMLTV FILE INGESTION — the parser contract, the importer's write path, and
 * the safety properties, proven WITHOUT redistributing provider content: the
 * fixture is synthetic and reproduces the schema characteristics measured on
 * the real TV Media corpus (three display-names with a lineup-scoped channel
 * number, credits, ratings, xmltv_ns + onscreen episode numbers, offset and
 * UTC timestamps, CDATA, duplicate rows, a titleless malformed row, an
 * impossible clock).
 */

const FIXTURE = readFileSync(join(__dirname, 'fixtures', 'synthetic.xmltv.xml'), 'utf8');

async function* streamOf(text: string, chunk = 97): AsyncIterable<Buffer> {
  const b = Buffer.from(text, 'utf8');
  for (let i = 0; i < b.length; i += chunk) yield b.subarray(i, i + chunk);
}

async function parseAll(text: string) {
  const channels: XmltvChannel[] = [];
  const programmes: XmltvProgramme[] = [];
  const malformed: string[] = [];
  const summary = await parseXmltvStream(streamOf(text), {
    onChannel: (c) => { channels.push(c); },
    onProgramme: (p) => { programmes.push(p); },
    onMalformed: (m) => { malformed.push(m.reason); },
  });
  return { channels, programmes, malformed, summary };
}

// ═══ PARSER CONTRACT ══════════════════════════════════════════════════════

describe('parseXmltvStream · the fixture parses exactly as the schema promises', () => {
  it('channels: ids, display-name order, icons preserved', async () => {
    const { channels } = await parseAll(FIXTURE);
    expect(channels.map((c) => c.id)).toEqual([
      '1.stations.synthetic.test', '2.stations.synthetic.test', '3.stations.synthetic.test',
    ]);
    expect(channels[0]!.displayNames).toEqual(['Fixture Movies Network - Eastern Feed', 'FMN', '12']);
    expect(channels[0]!.iconUrls).toEqual(['http://cdn.example.invalid/fmn.png']);
  });

  it('programmes: fields, credits, episode numbers, flags', async () => {
    const { programmes, malformed } = await parseAll(FIXTURE);
    const film = programmes.find((p) => p.title.startsWith('A Fixture Film'))!;
    expect(film.title).toBe('A Fixture Film & Its Sequel'); // entity decoded
    expect(film.desc).toContain('CDATA text & raw ampersand'); // CDATA passthrough
    expect(film.categories).toEqual(['Movie', 'Drama']);
    expect(film.actors).toEqual(['Actor One', 'Actor Two']);
    expect(film.directors).toEqual(['Directy McDirect']);
    expect(film.date).toBe('1999');
    expect(film.rating).toBe('TVPG');
    expect(film.starRating).toBe('3 / 5');

    const sitcom = programmes.find((p) => p.title === 'Fixture Sitcom')!;
    expect(sitcom.subTitle).toBe('The Pilot');
    expect(sitcom.isNew).toBe(true);
    expect(sitcom.episodeNums).toEqual([
      { system: 'xmltv_ns', value: '7 . 9 .' },
      { system: 'onscreen', value: 'S8/E10' },
    ]);

    const sports = programmes.find((p) => p.title === 'Fixture Kickoff')!;
    expect(sports.isLive).toBe(true);
    const news = programmes.find((p) => p.title === 'Fixture News at Nine')!;
    expect(news.previouslyShown).toBe(true);

    // The impossible clock and the titleless row are counted, never guessed.
    expect(malformed.some((r) => r.includes('unparseable start'))).toBe(true);
    expect(malformed.some((r) => r.includes('without title'))).toBe(true);
    expect(malformed).toHaveLength(2);
  });

  it('timestamps: the supplied offset is arithmetic, never a guess', () => {
    const utc = parseXmltvTimestamp('20260815010000 +0000')!;
    expect(new Date(utc.utcMs).toISOString()).toBe('2026-08-15T01:00:00.000Z');
    expect(utc.offsetMinutes).toBe(0);

    const eastern = parseXmltvTimestamp('20260814200000 -0500')!;
    expect(new Date(eastern.utcMs).toISOString()).toBe('2026-08-15T01:00:00.000Z');
    expect(eastern.offsetMinutes).toBe(-300);

    // No offset = provider-local with no way to know whose. Refused.
    expect(parseXmltvTimestamp('20260815010000')).toBeNull();
    expect(parseXmltvTimestamp('20260231010000 +0000')).toBeNull(); // Feb 31
  });

  it('entity decoding covers exactly the five built-ins + numeric refs, nothing external', () => {
    expect(decodeXmlText('a &amp; b &lt;c&gt; &quot;d&quot; &apos;e&apos; &#65;&#x42;')).toBe('a & b <c> "d" \'e\' AB');
    // An unknown named entity would require a DTD; it stays literal.
    expect(decodeXmlText('&xxe; &nbsp;')).toBe('&xxe; &nbsp;');
  });

  it('an oversized element is rejected and the stream continues', async () => {
    const big = `<programme start="20260815010000 +0000" channel="1.c">${'x'.repeat(MAX_ELEMENT_BYTES + 1024)}</programme>`;
    const doc = `<tv source-info-name="t">${big}<programme start="20260815020000 +0000" stop="20260815030000 +0000" channel="1.c"><title>Survivor</title></programme></tv>`;
    const { programmes, summary } = await parseAll(doc);
    expect(summary.malformed).toBe(1);
    expect(programmes.map((p) => p.title)).toEqual(['Survivor']);
  });

  it('large-stream behavior: 50k rows parse with counts intact', async () => {
    async function* many(): AsyncIterable<string> {
      yield '<tv source-info-name="big">';
      for (let i = 0; i < 50_000; i++) {
        const hh = String(i % 24).padStart(2, '0');
        yield `<programme start="202608150${hh.slice(0, 1)}0000 +0000" stop="20260815230000 +0000" channel="c.${i % 100}"><title>Row ${i}</title></programme>`;
      }
      yield '</tv>';
    }
    let count = 0;
    const summary = await parseXmltvStream(many(), { onProgramme: () => { count++; } });
    expect(count).toBe(50_000);
    expect(summary.malformed).toBe(0);
  });
});

// ═══ NORMALIZATION RULES ══════════════════════════════════════════════════

describe('normalization · validated conventions, never guesses', () => {
  it('channelFacts: [full name, callsign, lineup-scoped number]', async () => {
    const { channels } = await parseAll(FIXTURE);
    expect(channelFacts(channels[0]!)).toEqual({
      name: 'Fixture Movies Network - Eastern Feed', callSign: 'FMN', channelNumber: '12',
      iconUrl: 'http://cdn.example.invalid/fmn.png',
    });
    expect(channelFacts(channels[1]!).channelNumber).toBe('4-1'); // broadcast virtual channel
    expect(channelFacts(channels[2]!)).toMatchObject({ callSign: 'TNO', channelNumber: null });
  });

  it('programme_type: the provider declaration classifies — Movie and only Movie is a movie', () => {
    expect(programmeTypeFor(['Movie', 'Drama'])).toBe('movie');
    expect(programmeTypeFor(['Drama'])).toBe('series');
    expect(programmeTypeFor(['Sports'])).toBe('sports');
    expect(programmeTypeFor(['News'])).toBe('news');
    expect(programmeTypeFor(['Children'])).toBe('kids');
    expect(programmeTypeFor(['Paid Program'])).toBe('special');
    expect(programmeTypeFor([])).toBeNull(); // no category = honest unknown
    // A two-hour drama with a star rating is still not a movie.
    expect(programmeTypeFor(['Drama', 'Suspense'])).toBe('series');
  });

  it('programme identity: same work on two channels is one programme; a remake year splits it', async () => {
    const { programmes } = await parseAll(FIXTURE);
    const film = programmes.find((p) => p.title.startsWith('A Fixture Film'))!;
    const sameElsewhere = { ...film, channelId: '2.stations.synthetic.test', start: { ...film.start, utcMs: film.start.utcMs + 3_600_000 } };
    expect(programmeKey(sameElsewhere)).toBe(programmeKey(film));
    expect(programmeKey({ ...film, date: '2024' })).not.toBe(programmeKey(film));
  });

  it('httpsOnly: http provider artwork is preserved as metadata, never rendered', () => {
    expect(httpsOnly('http://cdn.example.invalid/x.png')).toBeNull();
    expect(httpsOnly('https://cdn.example.invalid/x.png')).toBe('https://cdn.example.invalid/x.png');
    expect(releaseYearFrom('1999')).toBe(1999);
    expect(releaseYearFrom('not a year')).toBeNull();
  });
});

// ═══ IN-MEMORY DATABASE — the real write path, executable ═════════════════

interface MemRow extends Record<string, unknown> { id: string }
class MemDb implements DbClient {
  tables = new Map<string, MemRow[]>();
  seq = 0;
  log: string[] = [];
  failOn: string | null = null;

  rows(t: string): MemRow[] {
    if (!this.tables.has(t)) this.tables.set(t, []);
    return this.tables.get(t)!;
  }

  from(table: string) {
    const self = this;
    const mk = (op: string, payload?: unknown, opts?: { onConflict?: string; ignoreDuplicates?: boolean }) => {
      const filters: ((r: MemRow) => boolean)[] = [];
      let head = false;
      const chain: DbFilterChain = {
        eq: (c, v) => { filters.push((r) => r[c] === v); return chain; },
        lt: (c, v) => { filters.push((r) => String(r[c]) < String(v)); return chain; },
        gte: (c, v) => { filters.push((r) => String(r[c]) >= String(v)); return chain; },
        lte: (c, v) => { filters.push((r) => String(r[c]) <= String(v)); return chain; },
        select: (_cols, o) => { head = o?.head ?? false; return chain; },
        then<TResult1 = DbResult, TResult2 = never>(
          onf?: ((v: DbResult) => TResult1 | PromiseLike<TResult1>) | null,
          onr?: ((e: unknown) => TResult2 | PromiseLike<TResult2>) | null,
        ): PromiseLike<TResult1 | TResult2> {
          return Promise.resolve().then(() => {
            self.log.push(`${table}.${op}`);
            if (self.failOn && `${table}.${op}` === self.failOn) {
              return { data: null, error: { message: `injected failure at ${table}.${op}` } } as DbResult;
            }
            const rows = self.rows(table);
            if (op === 'upsert' || op === 'insert') {
              const list = (Array.isArray(payload) ? payload : [payload]) as Record<string, unknown>[];
              const out: MemRow[] = [];
              for (const r of list) {
                const keyCols = opts?.onConflict?.split(',') ?? [];
                const found = keyCols.length > 0
                  ? rows.find((x) => keyCols.every((k) => x[k] === r[k]))
                  : undefined;
                if (found) {
                  if (!opts?.ignoreDuplicates) Object.assign(found, r);
                  out.push(found);
                } else {
                  const created: MemRow = { id: `id-${++self.seq}`, ...r } as MemRow;
                  rows.push(created);
                  out.push(created);
                }
              }
              return { data: out, error: null } as DbResult;
            }
            if (op === 'update') {
              const hit = rows.filter((r) => filters.every((f) => f(r)));
              for (const r of hit) Object.assign(r, payload as Record<string, unknown>);
              return { data: null, error: null } as DbResult;
            }
            if (op === 'delete') {
              const keep = rows.filter((r) => !filters.every((f) => f(r)));
              const removed = rows.length - keep.length;
              self.tables.set(table, keep);
              return { data: null, error: null, count: removed } as DbResult;
            }
            // select
            const hit = rows.filter((r) => filters.every((f) => f(r)));
            return { data: head ? null : hit, error: null, count: hit.length } as DbResult;
          }).then(onf as never, onr as never);
        },
      };
      return chain;
    };
    return {
      upsert: (rows: unknown, opts?: { onConflict?: string; ignoreDuplicates?: boolean }) => mk('upsert', rows, opts),
      insert: (rows: unknown) => mk('insert', rows),
      update: (values: unknown) => mk('update', values),
      delete: () => mk('delete'),
      select: (cols: string, o?: { count?: 'exact'; head?: boolean }) => {
        const c = mk('select');
        return c.select(cols, o);
      },
    };
  }
}

const fixtureImport = (db: MemDb, over: Partial<Parameters<typeof importXmltv>[0]> = {}) =>
  importXmltv({
    feedId: '9999',
    streamFactory: () => streamOf(FIXTURE),
    db,
    dryRun: false,
    nowMs: Date.parse('2026-08-15T12:00:00Z'),
    ...over,
  });

describe('importXmltv · the write path against the canonical tables', () => {
  it('a full import lands channels, programmes and airings with exact provenance', async () => {
    const db = new MemDb();
    const r = await fixtureImport(db);
    expect(r.error).toBeNull();
    expect(r.ok).toBe(true);
    expect(r.channelsAccepted).toBe(3);
    // 7 valid rows, one exact duplicate collapses → 6 airings.
    expect(r.airingsAccepted).toBe(7);
    expect(r.inFileDuplicates).toBe(1);
    expect(db.rows('tv_airings')).toHaveLength(6);
    expect(r.movieAirings).toBe(1);
    expect(r.malformed).toBe(2);

    const lineup = db.rows('tv_lineups')[0]!;
    expect(lineup.provider_lineup_id).toBe('xmltv:9999');
    expect(lineup.coverage_start_utc).toBe('2026-08-15T01:00:00.000Z');
    expect(lineup.coverage_end_utc).toBe('2026-08-15T07:00:00.000Z');

    const airing = db.rows('tv_airings').find((a) => String(a.provider_airing_id).includes('1.stations.synthetic.test'))!;
    expect(airing.source).toBe(TRANSPORT);
    expect(airing.provider_airing_id).toBe(airingIdFor('9999', '1.stations.synthetic.test', '2026-08-15T01:00:00.000Z'));

    // The -0500 sports row landed at the correct UTC instant.
    const sports = db.rows('tv_airings').find((a) => String(a.provider_airing_id).includes('2.stations.synthetic.test:2026-08-15T01:00:00.000Z'));
    expect(sports).toBeTruthy();

    // Provider row was insert-if-missing: the API transport stays off.
    expect(db.rows('tv_providers')[0]).toMatchObject({ id: PROVIDER_ID, enabled: false });

    const run = db.rows('tv_ingestion_runs')[0]!;
    expect(run.status).toBe('success');
    expect(run.trigger).toBe(TRANSPORT);
  });

  it('IDEMPOTENT: importing the same file twice changes nothing', async () => {
    const db = new MemDb();
    await fixtureImport(db);
    const before = {
      stations: db.rows('tv_stations').length,
      programmes: db.rows('tv_programmes').length,
      airings: db.rows('tv_airings').length,
    };
    const r2 = await fixtureImport(db, { nowMs: Date.parse('2026-08-15T13:00:00Z') });
    expect(r2.ok).toBe(true);
    expect(db.rows('tv_stations')).toHaveLength(before.stations);
    expect(db.rows('tv_programmes')).toHaveLength(before.programmes);
    expect(db.rows('tv_airings')).toHaveLength(before.airings);
    expect(r2.recordsExpired).toBe(0);
  });

  it('RECONCILE: a changed slot updates in place; a vanished slot is pruned only on success', async () => {
    const db = new MemDb();
    await fixtureImport(db);
    // The later delivery renames the 05:00 slot and drops the 06:00 twin.
    const changed = FIXTURE
      .replace('Bare Minimum', 'Renamed Minimum')
      .replace(/<programme start="20260815060000[\s\S]*?<\/programme>\s*<programme start="20260815060000[\s\S]*?<\/programme>/, '');
    const r2 = await importXmltv({
      feedId: '9999', streamFactory: () => streamOf(changed), db, dryRun: false,
      nowMs: Date.parse('2026-08-15T14:00:00Z'),
    });
    expect(r2.ok).toBe(true);
    const airings = db.rows('tv_airings');
    const renamedId = airingIdFor('9999', '3.stations.synthetic.test', '2026-08-15T05:00:00.000Z');
    const renamed = airings.find((a) => a.provider_airing_id === renamedId)!;
    const prog = db.rows('tv_programmes').find((p) => p.id === renamed.programme_id)!;
    expect(prog.title).toBe('Renamed Minimum'); // same slot row, new programme
    expect(airings.some((a) => String(a.provider_airing_id).includes('06:00:00'))).toBe(false); // pruned
    expect(r2.recordsExpired).toBe(1);
  });

  it('ATOMIC ENOUGH: a failing write records a failed run and never prunes', async () => {
    const db = new MemDb();
    await fixtureImport(db);
    const airingsBefore = db.rows('tv_airings').length;
    db.failOn = 'tv_airings.upsert';
    const r2 = await fixtureImport(db, { nowMs: Date.parse('2026-08-15T15:00:00Z') });
    expect(r2.ok).toBe(false);
    expect(r2.error).toContain('injected failure');
    expect(db.rows('tv_airings')).toHaveLength(airingsBefore); // previous guide intact
    const runs = db.rows('tv_ingestion_runs');
    expect(runs[runs.length - 1]!.status).toBe('failed');
    expect(db.log.filter((l) => l === 'tv_airings.delete')).toHaveLength(0);
  });

  it('VALIDATION GATE: garbage never touches the database', async () => {
    const db = new MemDb();
    const r = await importXmltv({
      feedId: '9999', streamFactory: () => streamOf('<tv source-info-name="x"></tv>'), db, dryRun: false,
    });
    expect(r.ok).toBe(false);
    expect(r.error).toContain('no channels or no programmes');
    expect(db.log).toHaveLength(0);
  });
});

// ═══ SAFETY SENTINELS ═════════════════════════════════════════════════════

describe('zero-upstream sentinel · file import performs NO network I/O', () => {
  const attempts: string[] = [];
  beforeEach(() => {
    attempts.length = 0;
    vi.stubGlobal('fetch', (input: unknown) => {
      attempts.push(String(input));
      throw new Error(`network attempted: ${String(input)}`);
    });
  });
  afterEach(() => vi.unstubAllGlobals());

  it('a FULL import (parse + write) attempts zero requests — tvmedia, tvpassport, anywhere', async () => {
    const db = new MemDb();
    const r = await fixtureImport(db);
    expect(r.ok).toBe(true);
    expect(attempts).toEqual([]);
  });

  it('XXE: a hostile DOCTYPE/entity resolves nothing and fetches nothing', async () => {
    const hostile = `<?xml version="1.0"?>
<!DOCTYPE tv SYSTEM "http://api.tvmedia.ca/evil.dtd" [<!ENTITY xxe SYSTEM "https://tvpassport.com/secret">]>
<tv source-info-name="t"><channel id="c.1"><display-name>&xxe; Channel</display-name></channel>
<programme start="20260815010000 +0000" stop="20260815020000 +0000" channel="c.1"><title>&xxe; and &amp; stay text</title></programme></tv>`;
    const { channels, programmes } = await parseAll(hostile);
    expect(attempts).toEqual([]);
    expect(channels[0]!.displayNames[0]).toBe('&xxe; Channel'); // undecoded literal
    expect(programmes[0]!.title).toBe('&xxe; and & stay text');
  });

  it('structurally: the import modules import no adapter, no egress, no fetch', () => {
    // Comments DESCRIBE the boundary (the header names the egress gate it
    // deliberately does not touch); only executable text can breach it.
    const stripComments = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/^\s*\/\/.*$/gm, ' ');
    for (const f of ['parseXmltv.ts', 'importXmltv.ts']) {
      const src = stripComments(readFileSync(join(__dirname, f), 'utf8'));
      expect(src).not.toMatch(/\bfetch\s*\(/);
      expect(src).not.toContain('tvMedia');
      expect(src).not.toContain('adapters/');
      expect(src).not.toContain('egress');
      expect(src).not.toContain('api.tvmedia.ca');
      expect(src).not.toContain('tvpassport');
    }
  });
});

// ═══ THE GUIDE READS THE STORED TRUTH ═════════════════════════════════════

describe('downstream · imported rows feed the existing guide pipeline unchanged', () => {
  it('XML movie row → programme_type movie → showType Movie → Movies filter', async () => {
    const db = new MemDb();
    await fixtureImport(db);
    const stations = new Map(db.rows('tv_stations').map((s) => [s.id, s]));
    const programmes = new Map(db.rows('tv_programmes').map((p) => [p.id, p]));
    // The exact shape getIngestedGuideAirings builds from these tables:
    const airings = db.rows('tv_airings').map((a) => {
      const st = stations.get(a.station_id as string)!;
      const pr = programmes.get(a.programme_id as string)!;
      return ingestedRowToAiring({
        startAtUtc: a.start_at_utc as string,
        providerAiringId: a.provider_airing_id as string,
        stationName: st.name as string,
        stationLogoUrl: (st.logo_url as string | null) ?? null,
        programmeProviderId: pr.provider_programme_id as string,
        title: pr.title as string,
        episodeTitle: (pr.episode_title as string | null) ?? null,
        programmeType: (pr.programme_type as string | null) ?? '',
        seasonNumber: (pr.season_number as number | null) ?? null,
        episodeNumber: (pr.episode_number as number | null) ?? null,
        genres: (pr.genres as string[] | null) ?? [],
        description: (pr.description as string | null) ?? null,
        runtimeMinutes: (pr.runtime_minutes as number | null) ?? null,
        artworkUrl: (pr.artwork_url as string | null) ?? null,
      });
    });
    // 01:00–03:00 movie is ON NOW at 02:00 with a provable runtime.
    const NOW = Date.parse('2026-08-15T02:00:00Z');
    const rows = buildChannelGuide(airings, NOW);
    const movies = filterGuideByMedia(rows, 'movie');
    expect(movies).toHaveLength(1);
    expect(movies[0]!.network).toBe('Fixture Movies Network - Eastern Feed');
    expect(movies[0]!.onNow?.showName).toBe('A Fixture Film & Its Sequel');
    expect(movies[0]!.onNow?.showType).toBe('Movie');
    // …and the mapping is the SAME normalized boundary every source uses.
    expect(showTypeForProgrammeType('movie')).toBe('Movie');
  });
});
