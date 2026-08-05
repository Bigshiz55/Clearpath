import 'server-only';
import { createAdminClient } from '@/lib/supabase/admin';
import { runExtractionBatch, type EpisodeInput } from './extraction';
import { proposeMatches, scoreMatch, PROPOSAL_THRESHOLD, type EpisodeExtraction } from './matching';

/**
 * CRIME CASE FILES — the pipeline that actually runs against production.
 *
 * ── WHY THIS EXISTS ───────────────────────────────────────────────────────
 * The pure case modules (extraction.ts, matching.ts) have been tested against
 * TVmaze fixtures since they were written, and production has had ZERO rows
 * in `cases` and ZERO in `case_programmes` the whole time. The Pack's entire
 * value proposition — "the same case, across every show that covered it" —
 * was never computed on real data. Nothing was broken; nothing was ever run.
 *
 * The gap was structural: `runMatchingJob` takes `EpisodeInput`, which is
 * shaped like a TVmaze episode (`tvmazeEpisodeId: number`). Production holds
 * `tv_programmes` rows keyed by uuid, sourced mostly from TV Media. This
 * module is the adapter and the writer — the reasoning stays in the pure
 * modules, which keep their tests.
 *
 * ── WHAT COUNTS AS EVIDENCE ───────────────────────────────────────────────
 * `extractCaseIdentifiers` reads the episode title and synopsis for named
 * subjects, a location, a year and a crime type, then removes correspondents
 * and narrators (Keith Morrison presents hundreds of unrelated cases; his
 * name is not evidence) via the stoplist and per-series frequency
 * suppression. `scoreMatch` weights a shared NAMED SUBJECT far above a shared
 * crime type, because two unrelated murders both labelled "murder" is not a
 * link.
 *
 * ── TWO THRESHOLDS, AND NOTHING SILENTLY DROPPED ──────────────────────────
 * >= AUTO_LINK_THRESHOLD  linked automatically, with its reasons stored.
 * >= PROPOSAL_THRESHOLD   queued for human review, never auto-linked.
 * <  PROPOSAL_THRESHOLD   not a candidate.
 * Every programme that ends up in no case at all is reported as unmatched.
 * A case the pipeline is unsure about stays unsure and visible, rather than
 * being asserted or discarded.
 */

/** Above this, a pair is linked without review. Deliberately well clear of
 *  PROPOSAL_THRESHOLD (0.5): a shared subject name alone scores 0.6, which is
 *  worth a look but not worth asserting as fact on its own. */
export const AUTO_LINK_THRESHOLD = 0.75;

export interface CaseJobReport {
  programmesConsidered: number;
  programmesWithEvidence: number;
  /** Programmes whose own text describes a crime — the matcher's real input. */
  crimeScoped: number;
  /** Fingerprints written to case_evidence — the audit trail. */
  evidenceRows: number;
  casesCreated: number;
  casesReused: number;
  linksWritten: number;
  queuedForReview: number;
  unmatched: number;
  /** Present when a durable review queue is not available in this database. */
  reviewQueueStored: boolean;
  examples: Array<{ case: string; titles: string[]; confidence: number; reasons: string[] }>;
}

interface ProgrammeRow {
  id: string;
  title: string;
  episode_title: string | null;
  description: string | null;
}

function slugify(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 70) || 'case';
}

/**
 * A stable, content-derived slug so re-running the job updates the same Case
 * instead of creating a second one. Built from the strongest evidence the
 * cluster shares — its most common subject name, plus a year when known.
 */
function caseIdentity(members: EpisodeExtraction[]): { slug: string; title: string; location: string | null; year: number | null } {
  const nameCounts = new Map<string, number>();
  for (const m of members) {
    for (const n of m.identifiers.subjectNames) nameCounts.set(n, (nameCounts.get(n) ?? 0) + 1);
  }
  const ranked = [...nameCounts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
  const primary = ranked[0]?.[0] ?? members[0]?.episode.title ?? 'case';
  const year = members.map((m) => m.identifiers.year).find((y) => y != null) ?? null;
  const location = members.map((m) => m.identifiers.location).find((l) => l != null) ?? null;
  return {
    slug: slugify(year ? `${primary}-${year}` : primary),
    title: primary,
    location,
    year,
  };
}

/** Union-find over auto-linkable pairs. */
function cluster(n: number, pairs: Array<[number, number]>): Map<number, number[]> {
  const parent = Array.from({ length: n }, (_, i) => i);
  const find = (x: number): number => (parent[x] === x ? x : (parent[x] = find(parent[x]!)));
  for (const [a, b] of pairs) {
    const ra = find(a); const rb = find(b);
    if (ra !== rb) parent[rb] = ra;
  }
  const groups = new Map<number, number[]>();
  for (let i = 0; i < n; i++) {
    const r = find(i);
    const g = groups.get(r) ?? [];
    g.push(i);
    groups.set(r, g);
  }
  return groups;
}

/** Does this database have the 0043 review queue / evidence columns yet? */
async function hasTable(admin: ReturnType<typeof createAdminClient>, table: string): Promise<boolean> {
  const { error } = await admin.from(table).select('*').limit(1);
  return !error || !/schema cache|does not exist/i.test(error.message);
}

export async function runProductionCaseJob(packSlug = 'crime-case-files'): Promise<CaseJobReport> {
  const admin = createAdminClient();

  const { data: packRows } = await admin.from('packs').select('id').eq('slug', packSlug).limit(1);
  const packId = packRows?.[0]?.id as string | undefined;
  if (!packId) throw new Error(`Pack ${packSlug} not found.`);

  const { data: ps } = await admin.from('pack_stations').select('station_id').eq('pack_id', packId);
  const stationIds = ((ps ?? []) as { station_id: string }[]).map((r) => r.station_id);
  if (stationIds.length === 0) {
    return {
      programmesConsidered: 0, programmesWithEvidence: 0, casesCreated: 0, casesReused: 0,
      linksWritten: 0, queuedForReview: 0, unmatched: 0, reviewQueueStored: false, examples: [], crimeScoped: 0, evidenceRows: 0,
    };
  }

  // Every programme this Pack's channels have ever carried, plus the station
  // name so a link can say WHERE each side aired — which is the whole point
  // ("covered across 3 networks").
  const { data: airings } = await admin
    .from('tv_airings')
    .select('programme_id, station_id, start_at_utc')
    .in('station_id', stationIds)
    .limit(20000);

  const firstAiring = new Map<string, string>();
  const stationOf = new Map<string, string>();
  for (const a of (airings ?? []) as { programme_id: string; station_id: string; start_at_utc: string }[]) {
    if (!firstAiring.has(a.programme_id) || a.start_at_utc < firstAiring.get(a.programme_id)!) {
      firstAiring.set(a.programme_id, a.start_at_utc);
    }
    if (!stationOf.has(a.programme_id)) stationOf.set(a.programme_id, a.station_id);
  }
  const programmeIds = [...firstAiring.keys()];
  if (programmeIds.length === 0) {
    return {
      programmesConsidered: 0, programmesWithEvidence: 0, casesCreated: 0, casesReused: 0,
      linksWritten: 0, queuedForReview: 0, unmatched: 0, reviewQueueStored: false, examples: [], crimeScoped: 0, evidenceRows: 0,
    };
  }

  const programmes: ProgrammeRow[] = [];
  for (let i = 0; i < programmeIds.length; i += 200) {
    const { data } = await admin
      .from('tv_programmes')
      .select('id, title, episode_title, description')
      .in('id', programmeIds.slice(i, i + 200));
    programmes.push(...((data ?? []) as ProgrammeRow[]));
  }

  const { data: stationRows } = await admin.from('tv_stations').select('id, name').in('id', stationIds);
  const stationName = new Map(((stationRows ?? []) as { id: string; name: string | null }[]).map((s) => [s.id, s.name ?? '']));

  // Adapt to the pure pipeline's input. The numeric id is a positional index
  // into `programmes`; it never leaves this function.
  const inputs: EpisodeInput[] = programmes.map((p, i) => ({
    tvmazeEpisodeId: i,
    series: p.title,
    network: stationName.get(stationOf.get(p.id) ?? '') ?? '',
    title: p.episode_title || p.title,
    airdate: (firstAiring.get(p.id) ?? '').slice(0, 10),
    synopsis: p.description ?? '',
  }));

  const batch = runExtractionBatch(inputs);
  const allExtractions: EpisodeExtraction[] = batch.results.map((r) => ({
    episode: inputs[r.tvmazeEpisodeId]!,
    identifiers: r.identifiers,
  }));

  // ── ONLY CRIME COVERAGE CAN BE A CRIME CASE ─────────────────────────────
  // The extractor treats any capitalized two-word run as a possible subject
  // name, which is right for true-crime synopses and badly wrong for
  // everything else a cable lineup carries. Measured across the full live
  // corpus of 943 programmes it produced 145 "shared subject" pairs and
  // every single high-scoring one was junk: "Washington Capitals",
  // "Super Bowl", "Jewel School", "Rise & Shine Savings". None was a case.
  //
  // A programme only enters the matcher if its own text describes a crime
  // (extractCrimeType found one). That is the cheapest possible statement of
  // "this is about a case", it uses the classifier the module already has,
  // and it means a shopping segment can never be linked to a murder however
  // its brand name happens to capitalize.
  const extractions = allExtractions.filter((e) => e.identifiers.crimeType != null);

  const withEvidence = extractions.filter((e) => e.identifiers.subjectNames.length > 0).length;
  const crimeScoped = extractions.length;

  const candidates = proposeMatches(extractions);
  const autoPairs: Array<[number, number]> = [];
  const reviewPairs: typeof candidates = [];
  for (const c of candidates) {
    // A shared NAMED SUBJECT is required to assert a case automatically.
    // Circumstantial agreement (same location, same year, same crime type)
    // can total 0.4 between two programmes that have nothing to do with each
    // other, and a Pack that tells you a storage-auction show covered a
    // murder has destroyed the only thing it was for. Those pairs are still
    // surfaced for review; they are just never asserted.
    const hasSharedSubject = c.reasons.some((r) => r.startsWith('shared subject:'));
    if (hasSharedSubject && c.confidence >= AUTO_LINK_THRESHOLD) {
      autoPairs.push([c.episodeAId, c.episodeBId]);
    } else if (c.confidence >= PROPOSAL_THRESHOLD) {
      reviewPairs.push(c);
    }
  }

  // Sized to `programmes`, NOT `extractions`: proposeMatches preserves each
  // item's ORIGINAL index (tvmazeEpisodeId), so pair ids address the full
  // programme list even though the matcher only saw the crime-scoped subset.
  const groups = cluster(programmes.length, autoPairs);
  const multi = [...groups.values()].filter((g) => g.length > 1);

  const evidenceColumns = await hasTable(admin, 'case_evidence');
  const queueTable = await hasTable(admin, 'case_link_candidates');

  // ── RECONCILE, DO NOT APPEND ────────────────────────────────────────────
  // A rebuild must be able to RETRACT a link the current evidence no longer
  // supports, not just add new ones. Without this the first bad match is
  // permanent: an early run linked a storage-auction show to a murder show
  // on a place name, and re-running with the fixed extractor would have left
  // that row sitting in production for ever.
  //
  // Only automatic links are cleared. A curated link is somebody's checked
  // judgement and is never touched by a batch job; when the linked_by column
  // is absent (0043 not applied) there are no curated links to protect,
  // because nothing can have written one.
  {
    let del = admin.from('case_programmes').delete().in('programme_id', programmeIds);
    if (evidenceColumns) del = del.eq('linked_by', 'automatic');
    await del;
    // Cases left with no programmes at all are now empty shells.
    const { data: remaining } = await admin.from('case_programmes').select('case_id');
    const stillUsed = new Set(((remaining ?? []) as { case_id: string }[]).map((r) => r.case_id));
    const { data: allCases } = await admin.from('cases').select('id');
    const orphans = ((allCases ?? []) as { id: string }[]).map((c) => c.id).filter((id) => !stillUsed.has(id));
    if (orphans.length > 0) await admin.from('cases').delete().in('id', orphans);
  }

  // ── PERSIST THE EVIDENCE, LINKED OR NOT ─────────────────────────────────
  // case_evidence is the audit trail: it records what the extractor actually
  // saw for every crime-scoped programme, including the ones that matched
  // nothing. Storing only the fingerprints of programmes that HAPPENED to
  // link would make an unexplained non-match impossible to investigate —
  // you could not tell "we found no subject names" from "we never looked".
  //
  // victims/perpetrators stay empty on purpose: this extractor identifies
  // named subjects but does not assign roles, and guessing which name is the
  // victim is exactly the kind of claim this Pack must not invent.
  let evidenceRows = 0;
  if (evidenceColumns) {
    const rows = extractions.map((e) => {
      const ids = e.identifiers;
      return {
        programme_id: programmes[e.episode.tvmazeEpisodeId]!.id,
        entities: ids.subjectNames,
        victims: [],
        perpetrators: [],
        locations: ids.location ? [ids.location] : [],
        // Only a year the text actually stated — an air year is not a case year.
        event_years: ids.yearFromText && ids.year != null ? [ids.year] : [],
        signature: [
          [...ids.subjectNames].sort().join('|').toLowerCase(),
          ids.location ?? '',
          ids.crimeType ?? '',
        ].join('::'),
        extracted_at: new Date().toISOString(),
      };
    });
    for (let i = 0; i < rows.length; i += 200) {
      const { error } = await admin
        .from('case_evidence')
        .upsert(rows.slice(i, i + 200), { onConflict: 'programme_id' });
      if (!error) evidenceRows += rows.slice(i, i + 200).length;
    }
  }

  let casesCreated = 0;
  let casesReused = 0;
  let linksWritten = 0;
  const examples: CaseJobReport['examples'] = [];

  for (const group of multi) {
    const members = group.map((i) => extractions[i]!);
    const identity = caseIdentity(members);

    const { data: existing } = await admin.from('cases').select('id').eq('slug', identity.slug).maybeSingle();
    let caseId = existing?.id as string | undefined;
    if (caseId) {
      casesReused++;
    } else {
      const { data: created, error } = await admin
        .from('cases')
        .insert({
          slug: identity.slug,
          title: identity.title,
          description: `Covered by ${members.length} programmes across this Pack's channels.`,
          location: identity.location,
        })
        .select('id')
        .single();
      if (error || !created) continue;
      caseId = created.id as string;
      casesCreated++;
    }

    // The strongest pair inside this cluster, for the stored explanation.
    let best = { confidence: 0, reasons: [] as string[] };
    for (let a = 0; a < members.length; a++) {
      for (let b = a + 1; b < members.length; b++) {
        const s = scoreMatch(members[a]!.identifiers, members[b]!.identifiers);
        if (s.confidence > best.confidence) best = s;
      }
    }

    for (const idx of group) {
      const programme = programmes[idx]!;
      const row: Record<string, unknown> = { case_id: caseId, programme_id: programme.id };
      if (evidenceColumns) {
        row.confidence = best.confidence;
        row.linked_by = 'automatic';
        row.evidence = best.reasons;
      }
      const { error } = await admin.from('case_programmes').upsert(row, { onConflict: 'case_id,programme_id' });
      if (!error) linksWritten++;
    }

    if (examples.length < 5) {
      examples.push({
        case: identity.title,
        titles: group.map((i) => `${programmes[i]!.title} — ${programmes[i]!.episode_title ?? ''}`.trim()),
        confidence: best.confidence,
        reasons: best.reasons,
      });
    }
  }

  let queued = 0;
  if (queueTable) {
    for (const c of reviewPairs) {
      const aId = programmes[c.episodeAId]!.id;
      const bId = programmes[c.episodeBId]!.id;
      const [lo, hi] = aId < bId ? [aId, bId] : [bId, aId];
      const { error } = await admin
        .from('case_link_candidates')
        .upsert(
          { programme_a_id: lo, programme_b_id: hi, confidence: c.confidence, reasons: c.reasons },
          { onConflict: 'programme_a_id,programme_b_id' },
        );
      if (!error) queued++;
    }
  }

  const inSomeCase = new Set(multi.flat());
  return {
    programmesConsidered: programmes.length,
    programmesWithEvidence: withEvidence,
    crimeScoped,
    evidenceRows,
    casesCreated,
    casesReused,
    linksWritten,
    queuedForReview: queueTable ? queued : reviewPairs.length,
    unmatched: programmes.length - inSomeCase.size,
    reviewQueueStored: queueTable,
    examples,
  };
}
