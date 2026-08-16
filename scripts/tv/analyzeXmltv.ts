/**
 * XMLTV FORENSIC ANALYZER — Phase-1 evidence, produced by the SAME streaming
 * parser the importer uses, so every number in the report is a number the
 * import path would actually see.
 *
 *   npx tsx scripts/tv/analyzeXmltv.ts /path/a.xml /path/b.xml …
 *
 * Read-only. No network. No database. Prints one JSON report per file plus a
 * cross-file overlap section.
 */
import { createReadStream } from 'node:fs';
import { statSync } from 'node:fs';
import { basename } from 'node:path';
import {
  parseXmltvStream,
  type XmltvChannel,
  type XmltvProgramme,
} from '../../src/lib/viewing/ingest/xmltv/parseXmltv';

interface FileReport {
  file: string;
  bytes: number;
  header: { sourceInfoName: string | null; sourceInfoUrl: string | null; generatedDate: string | null };
  channels: number;
  programmes: number;
  malformed: number;
  malformedReasons: Record<string, number>;
  earliestStart: string | null;
  latestStop: string | null;
  coverageHours: number | null;
  channelIdFormats: Record<string, number>;
  displayNameCountHistogram: Record<string, number>;
  categoryTop: Record<string, number>;
  moviesExact: number;
  sports: number;
  news: number;
  pct: Record<string, string>;
  offsetsSeen: Record<string, number>;
  duplicateAiringIdentities: number;
  parseMs: number;
  peakRssMb: number;
}

function pct(n: number, of: number): string {
  return of === 0 ? '0%' : `${((n / of) * 100).toFixed(1)}%`;
}

async function analyze(path: string): Promise<{ report: FileReport; channelIds: Set<string>; airingKeys: Set<string>; channelNames: Map<string, string> }> {
  const t0 = Date.now();
  let peak = process.memoryUsage().rss;
  const tick = setInterval(() => {
    const rss = process.memoryUsage().rss;
    if (rss > peak) peak = rss;
  }, 100);

  let header: FileReport['header'] = { sourceInfoName: null, sourceInfoUrl: null, generatedDate: null };
  const channelIds = new Set<string>();
  const channelNames = new Map<string, string>();
  const displayNameCountHistogram: Record<string, number> = {};
  const channelIdFormats: Record<string, number> = {};
  const categories: Record<string, number> = {};
  const offsetsSeen: Record<string, number> = {};
  const malformedReasons: Record<string, number> = {};
  const airingKeys = new Set<string>();
  let duplicateAiringIdentities = 0;
  let earliest = Number.POSITIVE_INFINITY;
  let latest = Number.NEGATIVE_INFINITY;
  let withDesc = 0, withIcon = 0, withDate = 0, withRating = 0, withStarRating = 0,
    withCredits = 0, withEpisodeNum = 0, withFlags = 0, withStop = 0, withSubtitle = 0;
  let movies = 0, sports = 0, news = 0;

  const onChannel = (c: XmltvChannel) => {
    channelIds.add(c.id);
    channelNames.set(c.id, c.displayNames[0] ?? c.id);
    const fmt = c.id.replace(/^\d+/, 'N');
    channelIdFormats[fmt] = (channelIdFormats[fmt] ?? 0) + 1;
    const k = String(c.displayNames.length);
    displayNameCountHistogram[k] = (displayNameCountHistogram[k] ?? 0) + 1;
  };

  const onProgramme = (p: XmltvProgramme) => {
    if (p.start.utcMs < earliest) earliest = p.start.utcMs;
    const end = p.stop?.utcMs ?? p.start.utcMs;
    if (end > latest) latest = end;
    const offKey = p.start.raw.slice(15).trim() || '(none)';
    offsetsSeen[offKey] = (offsetsSeen[offKey] ?? 0) + 1;
    for (const c of p.categories) categories[c] = (categories[c] ?? 0) + 1;
    if (p.categories.includes('Movie')) movies++;
    if (p.categories.some((c) => /^sports?$/i.test(c))) sports++;
    if (p.categories.some((c) => /^news$/i.test(c))) news++;
    if (p.desc) withDesc++;
    if (p.iconUrls.length > 0) withIcon++;
    if (p.date) withDate++;
    if (p.rating) withRating++;
    if (p.starRating) withStarRating++;
    if (p.actors.length + p.directors.length > 0) withCredits++;
    if (p.episodeNums.length > 0) withEpisodeNum++;
    if (p.isNew || p.isPremiere || p.previouslyShown) withFlags++;
    if (p.stop) withStop++;
    if (p.subTitle) withSubtitle++;
    const key = `${p.channelId}|${p.start.utcMs}`;
    if (airingKeys.has(key)) duplicateAiringIdentities++;
    else airingKeys.add(key);
  };

  const summary = await parseXmltvStream(createReadStream(path, { highWaterMark: 256 * 1024 }), {
    onHeader: (h) => { header = h; },
    onChannel,
    onProgramme,
    onMalformed: (m) => { malformedReasons[m.reason] = (malformedReasons[m.reason] ?? 0) + 1; },
  });
  clearInterval(tick);

  const categoryTop = Object.fromEntries(
    Object.entries(categories).sort((a, b) => b[1] - a[1]).slice(0, 14),
  );
  const P = summary.programmes;
  const report: FileReport = {
    file: basename(path),
    bytes: statSync(path).size,
    header,
    channels: summary.channels,
    programmes: P,
    malformed: summary.malformed,
    malformedReasons,
    earliestStart: Number.isFinite(earliest) ? new Date(earliest).toISOString() : null,
    latestStop: Number.isFinite(latest) ? new Date(latest).toISOString() : null,
    coverageHours: Number.isFinite(earliest) && Number.isFinite(latest) ? Math.round((latest - earliest) / 3_600_000) : null,
    channelIdFormats,
    displayNameCountHistogram,
    categoryTop,
    moviesExact: movies,
    sports,
    news,
    pct: {
      desc: pct(withDesc, P),
      icon: pct(withIcon, P),
      dateYear: pct(withDate, P),
      rating: pct(withRating, P),
      starRating: pct(withStarRating, P),
      credits: pct(withCredits, P),
      episodeNum: pct(withEpisodeNum, P),
      newPremierePrevShown: pct(withFlags, P),
      stopPresent: pct(withStop, P),
      subtitle: pct(withSubtitle, P),
    },
    offsetsSeen,
    duplicateAiringIdentities,
    parseMs: Date.now() - t0,
    peakRssMb: Math.round(peak / 1024 / 1024),
  };
  return { report, channelIds, airingKeys, channelNames };
}

async function main() {
  const files = process.argv.slice(2);
  if (files.length === 0) {
    console.error('usage: npx tsx scripts/tv/analyzeXmltv.ts <file.xml> [more.xml…]');
    process.exit(2);
  }
  const results: Awaited<ReturnType<typeof analyze>>[] = [];
  for (const f of files) {
    const r = await analyze(f);
    results.push(r);
    console.log(JSON.stringify(r.report, null, 1));
  }
  if (results.length > 1) {
    console.log('\n── CROSS-FILE OVERLAP ──');
    for (let i = 0; i < results.length; i++) {
      for (let j = i + 1; j < results.length; j++) {
        const a = results[i]!, b = results[j]!;
        const sharedChannels = [...a.channelIds].filter((id) => b.channelIds.has(id));
        const sharedAirings = [...a.airingKeys].filter((k) => b.airingKeys.has(k)).length;
        console.log(JSON.stringify({
          pair: [a.report.file, b.report.file],
          channelsA: a.channelIds.size,
          channelsB: b.channelIds.size,
          sharedChannelIds: sharedChannels.length,
          sharedAiringIdentities: sharedAirings,
          exampleSharedChannels: sharedChannels.slice(0, 5).map((id) => a.channelNames.get(id) ?? id),
        }));
      }
    }
  }
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
